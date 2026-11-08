import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CONFIG_DIR, writeFileAtomic } from './store.mjs';

// Kept in the config dir, not the data dir: the data dir may be on NTFS, where modes do nothing.
const file = () => path.join(CONFIG_DIR, 'auth.json');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const SESSION_DAYS = 365;
const SETUP_HOURS = 24;

function load() {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')); }
  catch { return { password: null, sessions: {}, setup: null }; }
}
function save(a) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileAtomic(file(), JSON.stringify(a, null, 2));
}

export function hasPassword() { return Boolean(load().password); }

/** A single-use code: it is pasted into chat, so it must be dead the moment it is used. */
export function createSetupCode() {
  const a = load();
  const code = crypto.randomBytes(18).toString('base64url');
  a.setup = { hash: sha(code), expires: Date.now() + SETUP_HOURS * 3600e3 };
  save(a);
  return code;
}
export function setupCodeValid(code) {
  const { setup } = load();
  if (!code || !setup || Date.now() > setup.expires) return false;
  const given = Buffer.from(sha(code));
  return crypto.timingSafeEqual(given, Buffer.from(setup.hash));
}

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }).toString('hex') };
}
export function setPassword(code, pw) {
  if (!setupCodeValid(code)) return false;
  const a = load();
  a.password = hashPassword(pw);
  a.setup = null;
  a.sessions = {};
  save(a);
  return true;
}
export function checkPassword(pw) {
  const { password } = load();
  if (!password || typeof pw !== 'string') return false;
  const got = Buffer.from(hashPassword(pw, password.salt).hash, 'hex');
  return crypto.timingSafeEqual(got, Buffer.from(password.hash, 'hex'));
}

export function createSession() {
  const a = load();
  const token = crypto.randomBytes(32).toString('base64url');
  a.sessions[sha(token)] = Date.now() + SESSION_DAYS * 86400e3;
  for (const [k, exp] of Object.entries(a.sessions)) if (exp < Date.now()) delete a.sessions[k];
  save(a);
  return token;
}
export function sessionValid(token) {
  if (!token) return false;
  const exp = load().sessions[sha(token)];
  return Boolean(exp && exp > Date.now());
}
export function endSession(token) {
  const a = load();
  delete a.sessions[sha(token || '')];
  save(a);
}
export const sessionCookie = (token, maxAge = SESSION_DAYS * 86400) =>
  // No Secure flag: the site is plain HTTP inside the tailnet, which WireGuard already encrypts.
  `rs_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;

const failures = new Map();
const WINDOW = 15 * 60e3;
const MAX_FAILS = 10;
export function loginAllowed(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.first > WINDOW) return true;
  return f.count < MAX_FAILS;
}
export function recordFailure(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.first > WINDOW) failures.set(ip, { first: Date.now(), count: 1 });
  else f.count += 1;
}
export const clearFailures = (ip) => failures.delete(ip);
