import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A shim over the agent's hotline channel, so the site needs no chat system of its own.
// Reads and mirrors use hotline's bot token. hotlined drops bot-authored messages
// (src/hotline/bot.py), so the mirror post cannot loop back into the agent as a second copy;
// the real delivery is `hotline --to`.
const API = 'https://discord.com/api/v10';
// Discord returns a 403 that looks like a permissions problem without this User-Agent form.
const UA = 'DiscordBot (https://github.com/BogdanStamenovic/room-studio, 0.1)';
export const SITE_MARK = '**From the site:** ';
const CACHE_MS = 3000;

function token() {
  if (process.env.HOTLINE_BOT_TOKEN) return process.env.HOTLINE_BOT_TOKEN;
  const file = process.env.HOTLINE_ENV || path.join(os.homedir(), 'data/hotline/.env');
  try {
    return fs.readFileSync(file, 'utf8').match(/^HOTLINE_BOT_TOKEN=(.*)$/m)?.[1] || null;
  } catch { return null; }
}

async function discord(method, route, body) {
  const t = token();
  const channel = process.env.ROOM_STUDIO_CHANNEL;
  if (!t || !channel) throw new Error('chat channel is not configured');
  const res = await fetch(`${API}/channels/${channel}${route}`, {
    method,
    headers: { Authorization: `Bot ${t}`, 'User-Agent': UA, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Discord answered ${res.status}`);
  return res.json();
}

export function mapMessage(m, ownerId) {
  const fromSite = m.author?.bot && m.content?.startsWith(SITE_MARK);
  return {
    id: m.id,
    at: m.timestamp,
    from: fromSite || m.author?.id === ownerId ? 'you' : 'agent',
    via: fromSite ? 'site' : 'discord',
    text: fromSite ? m.content.slice(SITE_MARK.length) : m.content || '',
    attachments: (m.attachments || []).map((a) => ({ name: a.filename, url: a.url })),
  };
}

function ownerId() {
  if (process.env.DISCORD_USER_ID) return process.env.DISCORD_USER_ID;
  try {
    const file = process.env.HOTLINE_ENV || path.join(os.homedir(), 'data/hotline/.env');
    return fs.readFileSync(file, 'utf8').match(/^DISCORD_USER_ID=(.*)$/m)?.[1] || null;
  } catch { return null; }
}

let cache = { at: 0, value: null };
export async function readChannel() {
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  const raw = await discord('GET', '/messages?limit=100');
  const owner = ownerId();
  const value = raw.reverse().filter((m) => m.content || m.attachments?.length).map((m) => mapMessage(m, owner));
  cache = { at: Date.now(), value };
  return value;
}

export async function mirrorToChannel(text) {
  cache = { at: 0, value: null };
  // Discord rejects content over 2000 characters.
  const room = 2000 - SITE_MARK.length;
  const content = SITE_MARK + (text.length > room ? `${text.slice(0, room - 1)}…` : text);
  return discord('POST', '/messages', { content, allowed_mentions: { parse: [] } });
}
