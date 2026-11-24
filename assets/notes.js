// Personal Notes: a plain notepad. Saved in this browser and, when signed in, synced to the account.
// Notes are separate from the tracker; nothing here changes meals, workouts or goals.
import * as cloud from './cloud.js';

const LS = 'dsj-notes:v1';
const $ = s => document.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false || kid === '') continue; el.append(kid instanceof Node ? kid : document.createTextNode(String(kid))); }
  return el;
}
const put = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false && k !== ''));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const num = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
const norm = x => ({ id: String(x.id).slice(0, 40), body: typeof x.body === 'string' ? x.body.slice(0, 5000) : '', created: num(x.created) || Date.now(), u: num(x.u), deleted: !!x.deleted });

const N = { notes: {}, user: null, editing: null, draft: '', confirmDel: null, sync: 'local' };
const pending = new Set();

function load() {
  try { const o = JSON.parse(localStorage.getItem(LS) || 'null'); if (o && o.notes) for (const [k, v] of Object.entries(o.notes)) if (v && typeof v === 'object') N.notes[k] = norm({ ...v, id: k }); } catch (e) { /* start empty */ }
}
function persist() { try { localStorage.setItem(LS, JSON.stringify({ v: 1, notes: N.notes })); return true; } catch (e) { toast("Couldn't save on this device."); return false; } }
function change(note) { note.u = Date.now(); N.notes[note.id] = note; pending.add(note.id); persist(); schedulePush(); render(); }

/* ---------- sync ---------- */
let pushT = null, pushing = false;
function schedulePush() { if (!N.user || !pending.size) return; clearTimeout(pushT); pushT = setTimeout(flush, 700); setStatus('saving'); }
async function flush() {
  if (!N.user) return;
  if (pushing) { schedulePush(); return; }
  const ids = [...pending]; pending.clear(); if (!ids.length) { setStatus('synced'); return; }
  pushing = true;
  try { await cloud.push(ids.filter(id => N.notes[id]).map(id => { const n = N.notes[id]; return { kind: 'note', key: id, data: { body: n.body, created: n.created, u: n.u, deleted: n.deleted } }; })); setStatus('synced'); }
  catch (e) { ids.forEach(id => pending.add(id)); setStatus('error'); }
  pushing = false;
}
async function syncNow() {
  if (!N.user) return;
  setStatus('saving');
  try {
    const rows = await cloud.pull(['note']);
    const remote = new Map(); let changed = false;
    for (const r of rows) {
      const rn = norm({ ...(r.data || {}), id: r.key }); remote.set(r.key, rn.u);
      const ln = N.notes[r.key];
      if (!ln || rn.u > ln.u) { N.notes[r.key] = rn; changed = true; }
    }
    for (const [id, n] of Object.entries(N.notes)) { const ru = remote.get(id); if (ru === undefined || n.u > ru) { if (!n.u) n.u = Date.now(); pending.add(id); } }
    persist(); if (changed) render();
    if (pending.size) await flush(); else setStatus('synced');
  } catch (e) { setStatus('error'); }
}
function setStatus(s) { N.sync = s; renderStatus(); }
function renderStatus() {
  const el = $('#notesStatus'); if (!el) return;
  if (!cloud.configured) { el.textContent = 'Saved on this device.'; return; }
  if (!N.user) { put(el, 'Saved on this device. ', h('a', { href: '../tracking/' }, 'Sign in on Start Tracking'), ' to sync your notes.'); return; }
  el.textContent = { saving: 'Syncing…', synced: 'Synced with your account.', error: "Couldn't sync right now. Your notes are safe on this device and will sync later." }[N.sync] || 'Synced with your account.';
}

/* ---------- render ---------- */
const when = ms => new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function render() {
  const list = Object.values(N.notes).filter(n => !n.deleted).sort((a, b) => b.created - a.created);
  const box = h('textarea', { id: 'composer', placeholder: 'Write a note…', 'aria-label': 'New note', maxlength: 5000, oninput: e => { N.draft = e.target.value; saveBtn.disabled = !N.draft.trim(); }, onkeydown: e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') add(); } }, N.draft);
  const saveBtn = h('button', { class: 'btn btn-primary btn-sm', type: 'button', disabled: !N.draft.trim(), onclick: () => add() }, 'Save note');
  function add() { const body = N.draft.trim(); if (!body) return; const now = Date.now(); N.draft = ''; change({ id: uid(), body, created: now, u: now, deleted: false }); toast('Note saved'); setTimeout(() => { const c = $('#composer'); if (c) c.focus(); }, 0); }
  put($('#notesApp'),
    h('div', { class: 'composer' }, box, h('div', { class: 'row' }, h('span', { class: 'muted', style: 'font-size:12.5px' }, list.length ? `${list.length} ${list.length === 1 ? 'note' : 'notes'}` : ''), saveBtn)),
    list.length ? h('ul', { class: 'note-list' }, list.map(noteCard)) : h('div', { class: 'empty' }, h('b', {}, 'No notes yet'), 'Write anything here: plans, thoughts, reminders. Notes are just for you and don\'t change your tracking.'));
}
function noteCard(n) {
  if (N.editing === n.id) {
    let text = n.body;
    return h('li', { class: 'pnote' },
      h('textarea', { 'aria-label': 'Edit note', maxlength: 5000, oninput: e => { text = e.target.value; } }, n.body),
      h('div', { class: 'note-meta' }, h('time', {}, when(n.created)),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { N.editing = null; render(); } }, 'Cancel'),
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { N.editing = null; if (text.trim()) change({ ...n, body: text.trim() }); else render(); toast('Note updated'); } }, 'Save'))));
  }
  const confirm = N.confirmDel === n.id;
  return h('li', { class: 'pnote' },
    h('p', { class: 'note-body' }, n.body),
    h('div', { class: 'note-meta' },
      h('time', { datetime: new Date(n.created).toISOString() }, when(n.created) + (n.u - n.created > 60000 ? ' · edited' : '')),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { N.editing = n.id; N.confirmDel = null; render(); } }, 'Edit'),
        h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => {
          if (!confirm) { N.confirmDel = n.id; render(); return; }
          N.confirmDel = null; change({ ...n, body: '', deleted: true }); toast('Note deleted');
        } }, confirm ? 'Tap again to delete' : 'Delete'))));
}
let toastT = null;
function toast(msg) { const t = $('#toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }

/* ---------- start ---------- */
load();
render();
renderStatus();
(async () => {
  if (!cloud.configured) return;
  try {
    await cloud.onAuthChange((event, user) => {
      const was = N.user && N.user.id; N.user = user; renderStatus();
      if (user && user.id !== was) syncNow();
    });
    const u = await cloud.currentUser();
    if (u && (!N.user || N.user.id !== u.id)) { N.user = u; syncNow(); }
    renderStatus();
  } catch (e) { setStatus('error'); }
})();
window.addEventListener('storage', e => { if (e.key === LS) { N.notes = {}; load(); render(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && N.user) syncNow(); });
