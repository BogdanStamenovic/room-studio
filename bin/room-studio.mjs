#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store, CONFIG_DIR, dataDir, writeFileAtomic, safeId } from '../server/store.mjs';
import { resolveRoom, validateStudy } from '../web/geometry.mjs';

const ROOT = path.resolve(path.dirname(fs.realpathSync(fileURLToPath(import.meta.url))), '..');
const UNIT_DIR = path.join(os.homedir(), '.config/systemd/user');
const UNIT = path.join(UNIT_DIR, 'room-studio.service');
const die = (msg, code = 1) => { console.error(`room-studio: ${msg}`); process.exit(code); };
const siteUrl = () => `http://archserver:${process.env.PORT || 3300}`;

const USAGE = `room-studio: private site for designing a room with an agent

  serve                      run the web server
  status                     data location, room summary, counts
  setup-link                 print a one-time link to set or reset the password
  room                       print measurements and the solved shape
  inbox                      drawings not yet acknowledged, with image paths
  ack ID                     mark a drawing as read
  study put FILE [--dry-run] add a study, or a new revision if its id exists
  study list | study rm ID
  item put FILE              add or replace items from a JSON list (agent placement)
  install-service [--dry-run]    write config and the systemd user unit, start it
  update-service                 refresh the unit, keep config and data, restart
  remove-service                 stop and remove the unit; data removal is asked
`;

const EXAMPLE = {
  id: 'example-flap-table',
  title: 'Example: flap table (not your design)',
  understanding: 'Shows how a study works. A table whose rear flap folds up and whose drawer slides out. Scrub the timeline, or stop on a frame and press Draw.',
  duration: 6,
  blocks: [
    { id: 'leg1', label: 'Leg', size: [60, 60, 720], pos: [-540, -240, 360] },
    { id: 'leg2', size: [60, 60, 720], pos: [540, -240, 360] },
    { id: 'leg3', size: [60, 60, 720], pos: [-540, 240, 360] },
    { id: 'leg4', size: [60, 60, 720], pos: [540, 240, 360] },
    { id: 'top', label: 'Top', size: [1200, 600, 30], pos: [0, 0, 735] },
    { id: 'flap', label: 'Flap, hinged', size: [1200, 300, 30], pivot: [0, -150, 0], pos: [0, 300, 735], rot: [-90, 0, 0], color: '#e3d3b5' },
    { id: 'drawer', label: 'Drawer', size: [500, 420, 90], pos: [0, 0, 670], color: '#b8cdd8' },
  ],
  keyframes: {
    flap: [{ t: 0.5, rot: [-90, 0, 0] }, { t: 2.5, rot: [0, 0, 0] }],
    drawer: [{ t: 3, pos: [0, 0, 670] }, { t: 4.5, pos: [0, -330, 670] }, { t: 5.5, pos: [0, -330, 670] }],
  },
  captions: [{ t: 0, text: 'Flap hangs down, drawer closed' }, { t: 0.5, text: 'Flap swings up on its hinge' }, { t: 3, text: 'Drawer slides out toward you' }],
};

function readJsonFile(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { die(`cannot read ${file}: ${e.message}`, 2); }
}
const tailnetIp = () => {
  try { return execFileSync('tailscale', ['ip', '-4'], { encoding: 'utf8' }).trim().split('\n')[0]; } catch { return ''; }
};
const isMount = (p) => { try { execFileSync('mountpoint', ['-q', p]); return true; } catch { return false; } };
const systemctl = (...a) => execFileSync('systemctl', ['--user', ...a], { stdio: 'inherit' });

function unitText() {
  return `[Unit]
Description=room-studio: private site for designing a room with an agent
After=network.target tailscaled.service

[Service]
Type=simple
EnvironmentFile=${CONFIG_DIR}/env
Environment=PATH=${os.homedir()}/.claude/bin:${os.homedir()}/.local/bin:/usr/local/bin:/usr/bin
WorkingDirectory=${ROOT}
ExecStart=${process.execPath} ${ROOT}/bin/room-studio.mjs serve
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
}

function configText() {
  const data = isMount('/mnt/windows') ? '/mnt/windows/room-studio-data' : path.join(os.homedir(), '.local/share/room-studio');
  const ip = tailnetIp();
  return `ROOM_STUDIO_DATA=${data}
PORT=3300
HOST=127.0.0.1${ip ? `,${ip}` : ''}
ROOM_STUDIO_AGENT=
ROOM_STUDIO_CHANNEL=
`;
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case 'serve': {
    // A data dir on an unmounted disk would silently fill the 95% full root instead.
    const d = dataDir();
    if (d.startsWith('/mnt/windows/') && !isMount('/mnt/windows')) die('/mnt/windows is not mounted; refusing to write data to the root disk');
    const { createServer, listen } = await import('../server/server.mjs');
    const store = new Store(d);
    if (!fs.existsSync(store.p('seeded'))) {
      store.putStudyRevision(EXAMPLE);
      writeFileAtomic(store.p('seeded'), '1');
    }
    listen(createServer({ store }));
    break;
  }
  case 'status': {
    const s = new Store();
    const res = resolveRoom(s.room());
    console.log(`data: ${s.dir}\nroom: ${res.shape}, ${res.edges.map((e) => `${e.name}=${Math.round(e.length)}`).join(' ')}`);
    if (res.check?.errorMm != null) console.log(`check: second diagonal off by ${res.check.errorMm.toFixed(1)} mm`);
    console.log(`photos: ${s.photos().length}  items: ${s.items().length}  studies: ${s.studies().length}  drawings: ${s.drawings().length}`);
    break;
  }
  case 'setup-link': {
    const { createSetupCode, hasPassword } = await import('../server/auth.mjs');
    if (hasPassword()) console.error('note: saving a new password logs out every device');
    console.log(`${siteUrl()}/setup?code=${createSetupCode()}`);
    break;
  }
  case 'room': {
    const r = new Store().room();
    console.log(JSON.stringify({ measurements: r, solved: resolveRoom(r) }, null, 2));
    break;
  }
  case 'inbox': {
    const s = new Store();
    const list = s.drawings().filter((d) => d.status !== 'read');
    if (!list.length) console.log('nothing new');
    for (const d of list) console.log(JSON.stringify({ id: d.id, at: d.at, note: d.note, source: d.source, floor: d.floor, image: s.p('drawings', `${d.id}.png`) }, null, 1));
    break;
  }
  case 'ack': {
    const s = new Store();
    const id = safeId(args[0]) || die('usage: room-studio ack ID', 2);
    const d = s.readJson(path.join('drawings', `${id}.json`), null) || die(`no drawing ${id}`);
    s.writeJson(path.join('drawings', `${id}.json`), { ...d, status: 'read' });
    break;
  }
  case 'study': {
    const s = new Store();
    const [sub, arg] = args;
    if (sub === 'list') {
      for (const st of s.studies()) console.log(`${st.id}\t${st.status}\tr${st.revisions.length}\t${st.title}`);
    } else if (sub === 'put') {
      const spec = readJsonFile(arg || die('usage: room-studio study put FILE', 2));
      const errs = validateStudy(spec);
      if (spec.id && !safeId(spec.id)) errs.push('id must be lowercase letters, digits and dashes');
      if (errs.length) die(`invalid study:\n  ${errs.join('\n  ')}`, 2);
      if (args.includes('--dry-run')) { console.log(`valid: ${spec.blocks.length} blocks; nothing written`); break; }
      const st = s.putStudyRevision(spec);
      console.log(`${st.id} revision ${st.revisions.length}`);
    } else if (sub === 'rm') {
      const id = safeId(arg) || die('usage: room-studio study rm ID', 2);
      if (!s.study(id)) die(`no study ${id}`);
      fs.renameSync(s.p('studies', `${id}.json`), s.p('trash', `study-${id}-${Date.now()}.json`));
      s.bump();
    } else die(USAGE, 2);
    break;
  }
  case 'item': {
    if (args[0] !== 'put' || !args[1]) die('usage: room-studio item put FILE', 2);
    const s = new Store();
    const incoming = readJsonFile(args[1]);
    if (!Array.isArray(incoming) || incoming.some((i) => !safeId(i.id) || !i.name)) die('expected a JSON list of items with id and name', 2);
    const ids = new Set(incoming.map((i) => i.id));
    s.saveItems([...s.items().filter((i) => !ids.has(i.id)), ...incoming]);
    console.log(`${incoming.length} items written`);
    break;
  }
  case 'install-service':
  case 'update-service': {
    const dry = args.includes('--dry-run');
    const envFile = path.join(CONFIG_DIR, 'env');
    const haveEnv = fs.existsSync(envFile);
    if (dry) {
      console.log(`would write ${UNIT}${haveEnv ? '' : ` and ${envFile}:\n${configText()}`}\n${unitText()}`);
      break;
    }
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    if (!haveEnv) writeFileAtomic(envFile, configText());
    fs.mkdirSync(UNIT_DIR, { recursive: true });
    writeFileAtomic(UNIT, unitText());
    systemctl('daemon-reload');
    if (cmd === 'install-service') systemctl('enable', 'room-studio.service');
    systemctl('restart', 'room-studio.service');
    console.log(`${cmd === 'install-service' ? 'installed' : 'updated'}; config ${envFile}; data kept`);
    break;
  }
  case 'remove-service': {
    try { systemctl('disable', '--now', 'room-studio.service'); } catch {}
    fs.rmSync(UNIT, { force: true });
    try { systemctl('daemon-reload'); } catch {}
    const d = dataDir();
    if (process.stdin.isTTY) {
      const { createInterface } = await import('node:readline/promises');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const a = await rl.question(`Delete the room data in ${d} and the login in ${CONFIG_DIR}? This cannot be undone. [y/N] `);
      rl.close();
      if (/^y(es)?$/i.test(a.trim())) {
        fs.rmSync(d, { recursive: true, force: true });
        fs.rmSync(CONFIG_DIR, { recursive: true, force: true });
        console.log('data and login deleted');
        break;
      }
    }
    console.log(`kept room data at ${d} and config at ${CONFIG_DIR}`);
    break;
  }
  default:
    console.log(USAGE);
    process.exit(cmd && cmd !== 'help' && cmd !== '--help' ? 2 : 0);
}
