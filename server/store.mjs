import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const CONFIG_DIR = process.env.ROOM_STUDIO_CONFIG || path.join(os.homedir(), '.config/room-studio');

function loadEnvFile() {
  try {
    for (const line of fs.readFileSync(path.join(CONFIG_DIR, 'env'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnvFile();

export const dataDir = () => process.env.ROOM_STUDIO_DATA || path.join(os.homedir(), '.local/share/room-studio');

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,80}$/;
export const safeId = (id) => (typeof id === 'string' && SAFE_ID.test(id) ? id : null);

export function writeFileAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  const fd = fs.openSync(tmp, 'w', 0o600);
  fs.writeSync(fd, content);
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  fs.renameSync(tmp, file);
}

export class Store {
  constructor(dir = dataDir()) {
    this.dir = dir;
    for (const sub of ['photos', 'drawings', 'studies', 'history', 'trash']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  p(...parts) { return path.join(this.dir, ...parts); }
  readJson(rel, fallback) {
    try { return JSON.parse(fs.readFileSync(this.p(rel), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
  }
  writeJson(rel, value) {
    writeFileAtomic(this.p(rel), JSON.stringify(value, null, 2));
    this.bump();
  }
  bump() { writeFileAtomic(this.p('rev'), String(Date.now())); }
  rev() { try { return fs.readFileSync(this.p('rev'), 'utf8'); } catch { return '0'; } }

  room() { return this.readJson('room.json', {}); }
  saveRoom(room) {
    const prev = this.readJson('room.json', null);
    // Every overwrite keeps the previous measurements: they cost a tape measure and a person.
    if (prev) writeFileAtomic(this.p('history', `room-${Date.now()}.json`), JSON.stringify(prev, null, 2));
    this.writeJson('room.json', room);
  }
  items() { return this.readJson('items.json', []); }
  saveItems(items) { this.writeJson('items.json', items); }
  photos() { return this.readJson('photos.json', []); }
  savePhotos(photos) { this.writeJson('photos.json', photos); }
  messages() {
    try {
      return fs.readFileSync(this.p('messages.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  }
  addMessage(msg) {
    const full = { id: newId('m'), at: new Date().toISOString(), ...msg };
    fs.appendFileSync(this.p('messages.jsonl'), `${JSON.stringify(full)}\n`);
    this.bump();
    return full;
  }
  updateMessage(id, patch) {
    const all = this.messages().map((m) => (m.id === id ? { ...m, ...patch } : m));
    writeFileAtomic(this.p('messages.jsonl'), all.map((m) => JSON.stringify(m)).join('\n') + '\n');
    this.bump();
  }
  drawings() {
    return fs.readdirSync(this.p('drawings')).filter((f) => f.endsWith('.json')).sort()
      .map((f) => JSON.parse(fs.readFileSync(this.p('drawings', f), 'utf8')));
  }
  studies() {
    return fs.readdirSync(this.p('studies')).filter((f) => f.endsWith('.json')).sort()
      .map((f) => JSON.parse(fs.readFileSync(this.p('studies', f), 'utf8')));
  }
  study(id) { return this.readJson(path.join('studies', `${id}.json`), null); }
  saveStudy(s) { this.writeJson(path.join('studies', `${s.id}.json`), s); }
  /** Each put appends a revision, so older versions of a design stay viewable. */
  putStudyRevision(spec) {
    const id = spec.id || newId('study');
    const existing = this.study(id);
    const revision = { ...spec, id: undefined, rev: (existing?.revisions.length || 0) + 1, at: new Date().toISOString() };
    delete revision.id;
    const study = existing || { id, revisions: [], status: 'open' };
    study.title = spec.title;
    study.status = 'open';
    study.revisions.push(revision);
    this.saveStudy(study);
    return study;
  }
}
