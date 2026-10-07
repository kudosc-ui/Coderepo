/* ==========================================================================
   CodeRepo Offline — everything runs locally in your browser.
   No network requests, no backend. Data lives in IndexedDB (CodeRepoOfflineDB).
   This is an offline Git-style simulation; it never talks to GitHub.
   ========================================================================== */
(() => {
'use strict';

/* ---------------------------------------------------------------- utils */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const plural = (n, w, p) => `${n} ${n === 1 ? w : (p || w + 's')}`;
const debounce = (fn, ms = 160) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: false });
const decStrict = new TextDecoder('utf-8', { fatal: true });

function fmtSize(n) {
  if (n == null) return '';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}
function ago(ts) {
  const d = Date.now() - ts, s = Math.max(0, Math.round(d / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return plural(m, 'minute') + ' ago';
  const h = Math.round(m / 60); if (h < 24) return plural(h, 'hour') + ' ago';
  const dd = Math.round(h / 24); if (dd < 30) return dd === 1 ? 'yesterday' : dd + ' days ago';
  const mo = Math.round(dd / 30); if (mo < 12) return plural(mo, 'month') + ' ago';
  return plural(Math.round(mo / 12), 'year') + ' ago';
}
const fmtDate = ts => new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const fmtDateTime = ts => new Date(ts).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const dayKey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const enc1 = encodeURIComponent;
const pathEnc = p => p.split('/').filter(Boolean).map(enc1).join('/');

/* Stable 40-char hex hash (used for commit IDs and blob IDs). Not cryptographic. */
function mix(h1, h2, ch) { h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); return [h1, h2]; }
function fin(h1, h2) {
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
function hashStr(str) {
  let out = '';
  for (let s = 1; out.length < 40; s++) {
    let h1 = 0xdeadbeef ^ (s * 7919), h2 = 0x41c6ce57 ^ (s * 104729);
    for (let i = 0; i < str.length; i++) [h1, h2] = mix(h1, h2, str.charCodeAt(i));
    out += fin(h1, h2);
  }
  return out.slice(0, 40);
}
function hashBytes(u8) {
  let out = '';
  for (let s = 1; out.length < 40; s++) {
    let h1 = 0xdeadbeef ^ (s * 7919), h2 = 0x41c6ce57 ^ (s * 104729);
    for (let i = 0; i < u8.length; i++) [h1, h2] = mix(h1, h2, u8[i]);
    out += fin(h1, h2);
  }
  return out.slice(0, 40);
}
const short = h => (h || '').slice(0, 7);

/* ---------------------------------------------------------------- icons */
const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M17 5a3.5 3.5 0 0 1 0 6.5M22 20c0-2.5-1.7-4.2-4-5"/>',
  repo: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  fork: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 12v5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/>',
  issue: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.4"/>',
  'issue-closed': '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  pr: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v10M18 17V9a3 3 0 0 0-3-3h-3"/><path d="M14 3l-2 3 2 3"/>',
  merge: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="13" r="2"/><path d="M6 7v10M6 8c0 4 4 5 10 5"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/>',
  project: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v10"/>',
  wiki: '<path d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z"/><path d="M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  graph: '<path d="M4 20V4M4 20h16"/><path d="M8 16l4-5 3 3 5-7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  'folder-plus': '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
  'file-plus': '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M12 12v6M9 15h6"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 4-6 3-12 7"/>',
  commit: '<circle cx="12" cy="12" r="3.5"/><path d="M2 12h6.5M15.5 12H22"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  'chev-down': '<path d="M6 9l6 6 6-6"/>',
  'chev-right': '<path d="M9 6l6 6-6 6"/>',
  'chev-left': '<path d="M15 6l-6 6 6 6"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  zip: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
  save: '<path d="M5 3h11l4 4v14H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  command: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  sort: '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
  replace: '<path d="M4 4v6h6M20 20v-6h-6"/><path d="M20 10A8 8 0 0 0 6 6L4 10M4 14a8 8 0 0 0 14 4l2-4"/>',
  wrap: '<path d="M3 6h18M3 12h14a3 3 0 0 1 0 6h-5M3 18h5"/><path d="M14 16l-2 2 2 2"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
  pin: '<path d="M12 17v5M8 3h8l-1 7 3 4H6l3-4z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>'
};
const ic = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.file}</svg>`;

/* ------------------------------------------------------------ IndexedDB */
const DB_NAME = 'CodeRepoOfflineDB';
const DB_VERSION = 1;
const STORES = {
  users: { keyPath: 'id' },
  repositories: { keyPath: 'id' },
  files: { keyPath: 'key', idx: ['repoId'] },       // blobs: key = repoId:sha
  commits: { keyPath: 'key', idx: ['repoId'] },     // key = repoId:hash (each commit carries its full tree)
  branches: { keyPath: 'key', idx: ['repoId'] },    // key = repoId:name
  issues: { keyPath: 'id', idx: ['repoId'] },
  pullRequests: { keyPath: 'id', idx: ['repoId'] },
  settings: { keyPath: 'key' },
  activity: { keyPath: 'id', idx: ['repoId'] }
};
let idb = null;
let persistent = true;
const mem = {}; // fallback when IndexedDB is unavailable (e.g. blocked storage)
Object.keys(STORES).forEach(k => mem[k] = new Map());

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB is not supported in this browser'));
    let rq;
    try { rq = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { return reject(e); }
    rq.onupgradeneeded = () => {
      const d = rq.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (d.objectStoreNames.contains(name)) continue;
        const os = d.createObjectStore(name, { keyPath: def.keyPath });
        (def.idx || []).forEach(i => os.createIndex(i, i));
      }
    };
    rq.onsuccess = () => { idb = rq.result; idb.onversionchange = () => idb.close(); resolve(idb); };
    rq.onerror = () => reject(rq.error);
    rq.onblocked = () => reject(new Error('Database is blocked by another tab'));
  });
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
function txDone(tx) { return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('Transaction aborted')); }); }

/* Thin promise-based abstraction over IndexedDB (with an in-memory fallback). */
const DB = {
  async get(store, key) {
    if (!persistent) return mem[store].get(key);
    return req(idb.transaction(store).objectStore(store).get(key));
  },
  async all(store) {
    if (!persistent) return [...mem[store].values()];
    return req(idb.transaction(store).objectStore(store).getAll());
  },
  async byRepo(store, repoId) {
    if (!persistent) return [...mem[store].values()].filter(v => v.repoId === repoId);
    return req(idb.transaction(store).objectStore(store).index('repoId').getAll(repoId));
  },
  async put(store, val) { return DB.batch([{ s: store, put: val }]); },
  async del(store, key) { return DB.batch([{ s: store, del: key }]); },
  /* Atomic multi-store write: ops = [{s, put}|{s, del}] — all-or-nothing. */
  async batch(ops) {
    if (!persistent) {
      for (const o of ops) { if (o.put) mem[o.s].set(o.put[STORES[o.s].keyPath], o.put); else mem[o.s].delete(o.del); }
      return;
    }
    const names = [...new Set(ops.map(o => o.s))];
    const tx = idb.transaction(names, 'readwrite');
    const done = txDone(tx);
    for (const o of ops) {
      const os = tx.objectStore(o.s);
      if (o.put) os.put(o.put); else os.delete(o.del);
    }
    return done;
  },
  /* Delete every record of a repository from the given stores. */
  async purgeRepo(repoId, stores) {
    if (!persistent) { stores.forEach(s => { for (const [k, v] of mem[s]) if (v.repoId === repoId) mem[s].delete(k); }); return; }
    const tx = idb.transaction(stores, 'readwrite');
    const done = txDone(tx);
    stores.forEach(s => {
      const c = tx.objectStore(s).index('repoId').openCursor(IDBKeyRange.only(repoId));
      c.onsuccess = () => { const cur = c.result; if (cur) { cur.delete(); cur.continue(); } };
    });
    return done;
  },
  async clear(store) {
    if (!persistent) return mem[store].clear();
    const tx = idb.transaction(store, 'readwrite'); tx.objectStore(store).clear(); return txDone(tx);
  },
  async estimate() {
    try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch (e) { /* ignore */ }
    return null;
  }
};
const getSetting = async (key, def) => { const r = await DB.get('settings', key); return r ? r.value : def; };
const setSetting = (key, value) => DB.put('settings', { key, value });

/* ----------------------------------------------------------------- toast */
function toast(msg, type = 'ok', ms = 3200) {
  const root = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.setAttribute('role', type === 'err' ? 'alert' : 'status');
  el.innerHTML = `${ic(type === 'err' ? 'alert' : type === 'info' ? 'info' : 'check', 'lg')}<span>${esc(msg)}</span>`;
  root.appendChild(el);
  while (root.children.length > 3) root.firstChild.remove();
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  const t = setTimeout(kill, ms);
  el.addEventListener('click', () => { clearTimeout(t); kill(); });
}

/* ----------------------------------------------------------------- modal */
let modalCount = 0;
/* opts: { title, body (html), actions:[{label, kind, value, onClick(ctx)}], wide, icon, tone, cls, dismissible, onOpen(ctx) }
   Returns a promise resolved with the chosen action's value (undefined if dismissed). */
function openModal(opts) {
  const root = $('#overlay-root');
  const back = document.createElement('div');
  back.className = 'modal-back ' + (opts.cls || '');
  const actions = opts.actions || [{ label: 'Close', kind: '' }];
  back.innerHTML = `
    <div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(opts.title || 'Dialog')}">
      ${opts.bare ? '' : `<div class="modal-h"><h3>${esc(opts.title || '')}</h3><button class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Close">${ic('x')}</button></div>`}
      <div class="modal-b">${opts.icon ? `<div class="modal-icon ${opts.tone || ''}">${ic(opts.icon, 'lg')}</div>` : ''}${opts.body || ''}</div>
      ${opts.bare || !actions.length ? '' : `<div class="modal-f">${actions.map((a, i) => `<button class="btn ${a.kind ? 'btn-' + a.kind : ''}" data-i="${i}">${a.icon ? ic(a.icon) : ''}${esc(a.label)}</button>`).join('')}</div>`}
    </div>`;
  const prev = document.activeElement;
  let resolve; const promise = new Promise(r => resolve = r);
  const modalEl = $('.modal', back);
  let closed = false;
  const close = v => {
    if (closed) return; closed = true;
    document.removeEventListener('keydown', onKey, true);
    back.remove();
    if (--modalCount <= 0) { modalCount = 0; document.body.style.overflow = ''; }
    try { prev && prev.isConnected && prev.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    resolve(v);
  };
  const ctx = {
    el: modalEl, close, $: s => $(s, modalEl), $$: s => $$(s, modalEl),
    error(msg, input) {
      let e = $('.m-err', modalEl);
      if (!e) { e = document.createElement('div'); e.className = 'err m-err'; e.setAttribute('role', 'alert'); $('.modal-b', modalEl).appendChild(e); }
      e.textContent = msg || ''; if (!msg) e.remove();
      $$('.invalid', modalEl).forEach(x => x.classList.remove('invalid'));
      if (input) { input.classList.add('invalid'); input.focus(); }
    }
  };
  const run = async i => {
    const a = actions[i]; if (!a) return;
    if (a.onClick) {
      const btn = $(`[data-i="${i}"]`, modalEl); if (btn) btn.disabled = true;
      let r;
      try { r = await a.onClick(ctx); } catch (e) { ctx.error(e.message || String(e)); r = false; }
      if (btn && btn.isConnected) btn.disabled = false;
      if (r === false) return;
      return close(r !== undefined ? r : a.value);
    }
    close(a.value);
  };
  function onKey(e) {
    if (back !== $$('.modal-back').pop()) return; // only top-most modal reacts
    if (e.key === 'Escape' && opts.dismissible !== false) { e.stopPropagation(); close(undefined); }
    else if (e.key === 'Tab') {
      const f = $$('button:not([disabled]), input:not([disabled]), select, textarea, a[href], [tabindex]:not([tabindex="-1"])', modalEl).filter(x => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    } else if (e.key === 'Enter' && e.target.matches && e.target.matches('input:not([type=checkbox]):not([type=radio]):not([type=file])') && !opts.noEnter) {
      const pi = actions.findIndex(a => a.kind === 'primary' || a.kind === 'success' || a.kind === 'solid-danger');
      if (pi >= 0) { e.preventDefault(); run(pi); }
    }
  }
  back.addEventListener('mousedown', e => { if (e.target === back && opts.dismissible !== false) close(undefined); });
  back.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) return close(undefined);
    const b = e.target.closest('[data-i]'); if (b && modalEl.contains(b)) run(+b.dataset.i);
  });
  document.addEventListener('keydown', onKey, true);
  root.appendChild(back);
  modalCount++; document.body.style.overflow = 'hidden';
  if (opts.onOpen) opts.onOpen(ctx);
  if (!opts.noFocus) setTimeout(() => { const f = $('[autofocus], input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea', modalEl); (f || $('.modal-f .btn:last-child', modalEl) || modalEl).focus?.({ preventScroll: true }); }, 30);
  promise.ctx = ctx; promise.close = close;
  return promise;
}
const alertDialog = (title, message, icon = 'info', tone = '') => openModal({ title, icon, tone, body: `<p style="margin:0;color:var(--text-2);overflow-wrap:anywhere">${message}</p>`, actions: [{ label: 'OK', kind: 'primary', value: true }] });
/* Confirmation dialog; `typeToConfirm` forces the user to type a phrase before confirming. */
function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, typeToConfirm = '', icon }) {
  return openModal({
    title, icon: icon || (danger ? 'alert' : 'info'), tone: danger ? 'danger' : '',
    body: `<p style="margin:0 0 ${typeToConfirm ? 12 : 0}px;color:var(--text-2);overflow-wrap:anywhere">${message}</p>` +
      (typeToConfirm ? `<div class="field" style="margin:0"><label>Type <b class="mono">${esc(typeToConfirm)}</b> to confirm</label><input class="input" id="cf-in" autocomplete="off" autocapitalize="off" spellcheck="false"></div>` : ''),
    actions: [{ label: 'Cancel', value: false }, {
      label: confirmLabel, kind: danger ? 'solid-danger' : 'primary', value: true,
      onClick: ctx => { if (typeToConfirm) { const i = ctx.$('#cf-in'); if (i.value !== typeToConfirm) { ctx.error('The text does not match.', i); return false; } } }
    }]
  }).then(v => !!v);
}

/* ------------------------------------------------------------------ menu */
/* items: [{label, icon, hint, selected, danger, divider, onClick}] */
function openMenu(anchor, { items, title, search, searchPlaceholder = 'Filter…', empty = 'Nothing found' }) {
  closeMenu();
  const sheet = window.innerWidth < 560;
  const back = document.createElement('div'); back.className = 'menu-back' + (sheet ? ' dim' : ''); back.id = 'menu-back';
  const m = document.createElement('div'); m.className = 'menu' + (sheet ? ' sheet' : ''); m.id = 'menu-el'; m.setAttribute('role', 'menu');
  const renderList = q => {
    const f = q ? items.filter(i => !i.divider && i.label.toLowerCase().includes(q.toLowerCase())) : items;
    if (!f.length) return `<div class="menu-empty">${esc(empty)}</div>`;
    return f.map(i => i.divider ? '<div class="mdiv"></div>' : `<button class="mi ${i.danger ? 'danger' : ''}" role="menuitem" data-idx="${items.indexOf(i)}">${i.icon ? ic(i.icon) : ''}<span class="mi-t">${esc(i.label)}</span>${i.hint ? `<span class="mi-h">${esc(i.hint)}</span>` : ''}${i.selected ? `<span class="tick">${ic('check')}</span>` : ''}</button>`).join('');
  };
  m.innerHTML = `${title ? `<div class="menu-title">${esc(title)}</div>` : ''}${search ? `<div class="menu-search"><input class="input" placeholder="${esc(searchPlaceholder)}" aria-label="Filter"></div>` : ''}<div class="menu-list">${renderList('')}</div>`;
  document.body.append(back, m);
  if (!sheet) {
    const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    let left = r.left; if (left + w > innerWidth - 8) left = Math.max(8, r.right - w);
    let top = r.bottom + 6; if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
    m.style.left = left + 'px'; m.style.top = top + 'px';
  }
  const list = $('.menu-list', m);
  const sIn = $('input', m);
  if (sIn) { sIn.addEventListener('input', () => list.innerHTML = renderList(sIn.value)); if (!sheet) setTimeout(() => sIn.focus(), 20); }
  m.addEventListener('click', e => {
    const b = e.target.closest('.mi'); if (!b) return;
    const it = items[+b.dataset.idx]; closeMenu(); if (it && it.onClick) it.onClick();
  });
  m.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeMenu(); anchor.focus?.(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); const els = $$('.mi', m); const i = els.indexOf(document.activeElement);
      (els[clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, els.length - 1)] || els[0])?.focus();
    }
  });
  back.addEventListener('click', closeMenu);
  if (!sIn) setTimeout(() => $('.mi', m)?.focus({ preventScroll: true }), 20);
}
function closeMenu() { $('#menu-back')?.remove(); $('#menu-el')?.remove(); }
window.addEventListener('resize', debounce(closeMenu, 100));

/* ------------------------------------------------------- file type helpers */
const LANGS = {
  javascript: { name: 'JavaScript', color: '#f1e05a', exts: ['js', 'mjs', 'cjs', 'jsx'], hl: 'js' },
  typescript: { name: 'TypeScript', color: '#3178c6', exts: ['ts', 'tsx'], hl: 'js' },
  html: { name: 'HTML', color: '#e34c26', exts: ['html', 'htm', 'xhtml'], hl: 'html' },
  css: { name: 'CSS', color: '#7b5fd6', exts: ['css', 'scss', 'less'], hl: 'css' },
  python: { name: 'Python', color: '#3572A5', exts: ['py', 'pyw'], hl: 'py' },
  java: { name: 'Java', color: '#b07219', exts: ['java', 'kt'], hl: 'java' },
  cpp: { name: 'C++', color: '#f34b7d', exts: ['cpp', 'cc', 'cxx', 'hpp', 'hh'], hl: 'cpp' },
  c: { name: 'C', color: '#8a8a8a', exts: ['c', 'h'], hl: 'c' },
  php: { name: 'PHP', color: '#7a86c2', exts: ['php'], hl: 'php' },
  shell: { name: 'Shell', color: '#89e051', exts: ['sh', 'bash', 'zsh'], hl: 'sh' },
  go: { name: 'Go', color: '#00ADD8', exts: ['go'], hl: 'c' },
  rust: { name: 'Rust', color: '#dea584', exts: ['rs'], hl: 'c' },
  ruby: { name: 'Ruby', color: '#cc342d', exts: ['rb'], hl: 'py' },
  sql: { name: 'SQL', color: '#e38c00', exts: ['sql'], hl: 'sql' }
};
const EXT_LANG = {}; Object.entries(LANGS).forEach(([k, v]) => v.exts.forEach(e => EXT_LANG[e] = k));
const OTHER_HL = { json: 'json', md: 'md', markdown: 'md', xml: 'html', svg: 'html', yml: 'sh', yaml: 'sh', toml: 'sh', ini: 'sh', gitignore: 'sh', env: 'sh' };
const IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif']);
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', svg: 'image/svg+xml', html: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json', md: 'text/markdown', txt: 'text/plain', csv: 'text/csv', xml: 'application/xml', pdf: 'application/pdf', zip: 'application/zip' };
const baseName = p => p.split('/').pop();
const dirName = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
const extOf = n => { const b = baseName(n); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : (b.startsWith('.') ? b.slice(1).toLowerCase() : ''); };
const mimeOf = n => MIME[extOf(n)] || 'application/octet-stream';
const isImage = n => IMG_EXT.has(extOf(n)) || extOf(n) === 'svg';
const langOf = n => EXT_LANG[extOf(n)] || '';
const hlOf = n => { const e = extOf(n); return (LANGS[EXT_LANG[e]] || {}).hl || OTHER_HL[e] || ''; };
function fileIcon(name, isDir) {
  if (isDir) return ic('folder', 'ficon dir');
  const e = extOf(name);
  const cls = { js: 'f-js', mjs: 'f-js', jsx: 'f-js', ts: 'f-js', html: 'f-html', htm: 'f-html', css: 'f-css', scss: 'f-css', json: 'f-json', md: 'f-md', py: 'f-py', zip: 'f-zip', svg: 'f-img' }[e] || (IMG_EXT.has(e) ? 'f-img' : '');
  return ic(IMG_EXT.has(e) || e === 'svg' ? 'image' : ['js', 'ts', 'html', 'css', 'py', 'java', 'cpp', 'c', 'php', 'json', 'xml', 'sh'].includes(e) ? 'code' : e === 'zip' ? 'zip' : 'file', 'ficon ' + cls);
}
/* Normalise a user-supplied path: forward slashes, no empty / dot segments. Returns '' if invalid. */
function normPath(p) {
  const segs = String(p || '').replace(/\\/g, '/').split('/').map(s => s.trim()).filter(s => s && s !== '.');
  if (segs.some(s => s === '..' || /[\u0000-\u001f<>:"|?*]/.test(s))) return '';
  return segs.join('/');
}
/* Heuristic: is this byte array readable text? */
function looksText(u8) {
  const n = Math.min(u8.length, 8000);
  for (let i = 0; i < n; i++) if (u8[i] === 0) return false;
  try { decStrict.decode(u8); return true; } catch (e) { return false; }
}

/* ------------------------------------------------------ syntax highlighter */
const KW = {
  js: 'abstract|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|of|private|protected|public|readonly|return|set|static|super|switch|this|throw|try|type|typeof|var|void|while|with|yield|as|null|undefined|true|false|NaN|Infinity',
  py: 'and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|try|while|with|yield|True|False|self|print',
  java: 'abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|return|short|static|super|switch|synchronized|this|throw|throws|try|void|volatile|while|null|true|false|var|record',
  c: 'auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|NULL|true|false|bool|func|package|import|fn|let|mut|pub|impl|use|match|go|defer|chan|range|type|interface|map',
  php: 'abstract|and|array|as|break|case|catch|class|clone|const|continue|declare|default|do|echo|else|elseif|empty|extends|final|finally|fn|for|foreach|function|global|if|implements|include|include_once|instanceof|interface|isset|list|namespace|new|or|print|private|protected|public|require|require_once|return|static|switch|throw|trait|try|unset|use|var|while|yield|null|true|false',
  sh: 'if|then|else|elif|fi|for|while|do|done|case|esac|function|in|return|export|local|echo|cd|exit|true|false|null',
  sql: 'select|from|where|insert|into|values|update|set|delete|create|table|drop|alter|join|left|right|inner|outer|on|group|by|order|having|limit|and|or|not|null|primary|key|as|distinct|union|index|SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|JOIN|LEFT|RIGHT|INNER|ON|GROUP|BY|ORDER|HAVING|LIMIT|AND|OR|NOT|NULL|PRIMARY|KEY|AS'
};
KW.cpp = KW.c + '|class|namespace|template|typename|using|new|delete|public|private|protected|virtual|override|nullptr|this|try|catch|throw|std|string|vector|constexpr|operator|friend|explicit|mutable|cout|cin|endl';
const STR = `"(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*'`;
const NUM = `\\b0[xX][0-9a-fA-F]+\\b|\\b\\d+\\.?\\d*(?:[eE][+-]?\\d+)?\\b`;
const kwRule = k => ['kw', `\\b(?:${KW[k]})\\b`];
const FN = ['fn', `\\b[A-Za-z_$][\\w$]*(?=\\s*\\()`];
const TYPE = ['type', `\\b[A-Z][A-Za-z0-9_]*\\b`];
const CLIKE_COM = ['com', `\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)`];
const RULES = {
  js: [CLIKE_COM, ['str', STR + '|`(?:\\\\[\\s\\S]|[^`\\\\])*`'], ['num', NUM], kwRule('js'), FN, TYPE],
  java: [CLIKE_COM, ['str', STR], ['num', NUM], ['type', '@[A-Za-z_]\\w*'], kwRule('java'), FN, TYPE],
  c: [CLIKE_COM, ['kw', '^\\s*#\\s*\\w+'], ['str', STR], ['num', NUM], kwRule('c'), FN, TYPE],
  cpp: [CLIKE_COM, ['kw', '^\\s*#\\s*\\w+'], ['str', STR], ['num', NUM], kwRule('cpp'), FN, TYPE],
  php: [['com', `\\/\\/[^\\n]*|#[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)`], ['str', STR], ['type', '<\\?php|<\\?=|\\?>'], ['attr', '\\$[A-Za-z_]\\w*'], ['num', NUM], kwRule('php'), FN, TYPE],
  py: [['com', '#[^\\n]*'], ['str', `"""[\\s\\S]*?(?:"""|$)|'''[\\s\\S]*?(?:'''|$)|` + STR], ['type', '@[A-Za-z_][\\w.]*'], ['num', NUM], kwRule('py'), FN, TYPE],
  sh: [['com', '#[^\\n]*'], ['str', STR], ['attr', '\\$\\{?[A-Za-z_]\\w*\\}?'], ['num', NUM], kwRule('sh'), ['attr', '^\\s*[\\w.-]+(?=\\s*:)']],
  sql: [['com', '--[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)'], ['str', `'(?:''|[^'])*'`], ['num', NUM], kwRule('sql')],
  css: [['com', '\\/\\*[\\s\\S]*?(?:\\*\\/|$)'], ['str', STR], ['kw', '@[\\w-]+'], ['num', '#[0-9a-fA-F]{3,8}\\b'], ['attr', '--?[A-Za-z][\\w-]*(?=\\s*:(?!:))'], ['num', '-?\\b\\d*\\.?\\d+(?:[a-z%]+)?'], ['fn', '[A-Za-z-]+(?=\\()'], ['tag', '[.#][A-Za-z_][\\w-]*'], ['attr', '[A-Za-z-]+(?=\\s*:(?!:))'], ['type', '--[\\w-]+']],
  json: [['attr', '"(?:\\\\.|[^"\\\\\\n])*"(?=\\s*:)'], ['str', STR], ['num', '-?\\b\\d+\\.?\\d*(?:[eE][+-]?\\d+)?\\b'], ['kw', '\\b(?:true|false|null)\\b']],
  md: [['str', '^```[\\s\\S]*?(?:^```|(?![\\s\\S]))'], ['h', '^#{1,6}[^\\n]*'], ['com', '^>[^\\n]*'], ['str', '`[^`\\n]+`'], ['b', '\\*\\*[^*\\n]+\\*\\*'], ['fn', '!?\\[[^\\]\\n]*\\]\\([^)\\n]*\\)'], ['kw', '^\\s*(?:[-*+]|\\d+\\.)(?=\\s)']]
};
const RULESETS = {};
for (const [k, rules] of Object.entries(RULES)) RULESETS[k] = { re: new RegExp(rules.map(r => '(' + r[1] + ')').join('|'), 'gm'), cls: rules.map(r => r[0]) };

function tokenizeWith(text, rs) {
  const out = []; let last = 0, m; rs.re.lastIndex = 0;
  while ((m = rs.re.exec(text))) {
    if (m[0] === '') { rs.re.lastIndex++; continue; }
    if (m.index > last) out.push(['', text.slice(last, m.index)]);
    let g = 1; while (g < m.length && m[g] === undefined) g++;
    out.push([rs.cls[g - 1], m[0]]); last = m.index + m[0].length;
  }
  if (last < text.length) out.push(['', text.slice(last)]);
  return out;
}
/* HTML/XML/SVG: tags, attributes, strings, comments, plus embedded <script>/<style>. */
const HTML_RE = /<!--[\s\S]*?(?:-->|$)|<(script|style)\b(?:"[^"]*"|'[^']*'|[^>"'])*>[\s\S]*?(?:<\/\1\s*>|$)|<[!?\/]?[A-Za-z][\w:-]*(?:"[^"]*"|'[^']*'|[^>"'])*>?|<![A-Za-z][^>]*>/gi;
const TAGPART_RE = /(<[!?\/]?[\w:-]+)|("[^"]*"|'[^']*')|([\w:@.-]+)(?==)|(\/?\??>)/g;
function tokHtml(text) {
  const out = []; let last = 0, m; HTML_RE.lastIndex = 0;
  const tag = s => { let l = 0, t; TAGPART_RE.lastIndex = 0; while ((t = TAGPART_RE.exec(s))) { if (t.index > l) out.push(['', s.slice(l, t.index)]); out.push([t[1] ? 'tag' : t[2] ? 'str' : t[3] ? 'attr' : 'tag', t[0]]); l = t.index + t[0].length; } if (l < s.length) out.push(['', s.slice(l)]); };
  while ((m = HTML_RE.exec(text))) {
    if (m[0] === '') { HTML_RE.lastIndex++; continue; }
    if (m.index > last) out.push(['', text.slice(last, m.index)]);
    if (m[0].startsWith('<!--')) out.push(['com', m[0]]);
    else if (m[1]) {
      const open = (m[0].match(/^<(?:"[^"]*"|'[^']*'|[^>"'])*>/) || [''])[0];
      const close = (m[0].slice(open.length).match(/<\/(?:script|style)\s*>$/i) || [''])[0];
      const body = m[0].slice(open.length, m[0].length - close.length);
      tag(open); out.push(...tokenizeWith(body, RULESETS[m[1].toLowerCase() === 'script' ? 'js' : 'css'])); if (close) tag(close);
    } else tag(m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(['', text.slice(last)]);
  return out;
}
/* Returns an array of HTML strings, one per source line (tokens that span lines are split). */
function highlightLines(text, hl) {
  let toks;
  if (!hl || text.length > 250000) toks = [['', text]];
  else if (hl === 'html') toks = tokHtml(text);
  else toks = RULESETS[hl] ? tokenizeWith(text, RULESETS[hl]) : [['', text]];
  const lines = [''];
  for (const [cls, s] of toks) {
    const parts = s.split('\n');
    parts.forEach((p, i) => {
      if (i > 0) lines.push('');
      p = p.replace(/\r$/, '');
      if (p) lines[lines.length - 1] += cls ? `<span class="tk-${cls}">${esc(p)}</span>` : esc(p);
    });
  }
  return lines;
}

/* ------------------------------------------------------------- markdown */
const safeHref = u => /^(https?:\/\/|mailto:|#)/i.test(u);
/* opts.link(url) -> href for repo-relative links; opts.img(url) -> object URL for repo-relative images */
function mdInline(s, opts = {}) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (m, alt, url) => {
    const u = url.replace(/&amp;/g, '&');
    const src = opts.img ? opts.img(u) : null;
    return src ? `<img alt="${alt}" src="${src}">` : `<span class="muted">[image: ${alt || u}]</span>`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (m, t, url) => {
    const u = url.replace(/&amp;/g, '&');
    if (safeHref(u)) return `<a href="${esc(u)}" ${u[0] === '#' ? '' : 'target="_blank" rel="noopener noreferrer nofollow"'}>${t}</a>`;
    const h = opts.link ? opts.link(u) : null;
    return h ? `<a href="${esc(h)}">${t}</a>` : t;
  });
  s = s.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (m, a, b) => `<strong>${a || b}</strong>`)
    .replace(/(^|[^\w*])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?!\s)(.+?)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
}
function renderMarkdown(src, opts = {}) {
  const L = String(src).replace(/\r\n?/g, '\n').split('\n');
  let i = 0, out = '';
  const isBlock = l => /^(#{1,6}\s|```|>|\s*([-*+]|\d+\.)\s|\s*([-*_]\s*){3,}$)/.test(l);
  const listRe = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
  function list(indent) {
    const ordered = /\d+\./.test(L[i].match(listRe)[2]);
    let h = ordered ? '<ol>' : '<ul>';
    while (i < L.length) {
      const m = L[i].match(listRe);
      if (!m || m[1].length < indent) break;
      if (m[1].length > indent) { h += list(m[1].length); continue; }
      let txt = m[3]; let box = '';
      const t = txt.match(/^\[( |x|X)\]\s+(.*)/);
      if (t) { box = `<input type="checkbox" disabled ${t[1] !== ' ' ? 'checked' : ''}>`; txt = t[2]; }
      h += `<li>${box}${mdInline(txt, opts)}</li>`; i++;
    }
    return h + (ordered ? '</ol>' : '</ul>');
  }
  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^```\s*([\w+-]*)/))) {
      const buf = []; i++;
      while (i < L.length && !/^```/.test(L[i])) buf.push(L[i++]);
      i++;
      const lang = m[1].toLowerCase();
      const hl = (LANGS[EXT_LANG[lang]] || {}).hl || OTHER_HL[lang] || (RULESETS[lang] ? lang : '');
      out += `<pre><code>${highlightLines(buf.join('\n'), hl).join('\n')}</code></pre>`; continue;
    }
    if ((m = l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) { out += `<h${m[1].length}>${mdInline(m[2], opts)}</h${m[1].length}>`; i++; continue; }
    if (/^\s*([-*_]\s*){3,}$/.test(l)) { out += '<hr>'; i++; continue; }
    if (/^>/.test(l)) { const buf = []; while (i < L.length && /^>/.test(L[i])) buf.push(L[i++].replace(/^>\s?/, '')); out += `<blockquote>${renderMarkdown(buf.join('\n'), opts)}</blockquote>`; continue; }
    if (listRe.test(l)) { out += list(l.match(listRe)[1].length); continue; }
    if (l.includes('|') && i + 1 < L.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(L[i + 1])) {
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(l); i += 2; let rows = '';
      while (i < L.length && L[i].includes('|') && L[i].trim()) { rows += '<tr>' + cells(L[i]).map(c => `<td>${mdInline(c, opts)}</td>`).join('') + '</tr>'; i++; }
      out += `<table><thead><tr>${head.map(c => `<th>${mdInline(c, opts)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`; continue;
    }
    const buf = [];
    while (i < L.length && L[i].trim() && !(buf.length && isBlock(L[i]))) buf.push(L[i++]);
    out += `<p>${buf.map(x => mdInline(x.replace(/\s+$/, ''), opts)).join('<br>')}</p>`;
  }
  return out;
}

/* ------------------------------------------------------------------ ZIP */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
async function deflateRaw(u8) {
  if (typeof CompressionStream === 'undefined') return null;
  try { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); } catch (e) { return null; }
}
async function inflateRaw(u8) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read compressed ZIP files');
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
}
/* entries: [{path, data: Uint8Array, mtime}] -> Blob (dependency-free ZIP writer). */
async function makeZip(entries, onProgress) {
  const parts = [], central = []; let offset = 0, n = 0;
  const u16 = v => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); return b; };
  const u32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return b; };
  for (const e of entries) {
    const name = enc.encode(e.path), d = new Date(e.mtime || Date.now());
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const crc = crc32(e.data);
    let method = 0, body = e.data;
    if (e.data.length > 64) { const z = await deflateRaw(e.data); if (z && z.length < e.data.length) { method = 8; body = z; } }
    const local = [u32(0x04034b50), u16(20), u16(0x0800), u16(method), u16(time), u16(date), u32(crc), u32(body.length), u32(e.data.length), u16(name.length), u16(0), name];
    parts.push(...local, body);
    central.push([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(method), u16(time), u16(date), u32(crc), u32(body.length), u32(e.data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]);
    offset += 30 + name.length + body.length;
    if (onProgress && (++n % 8 === 0)) { onProgress(n / entries.length); await sleep(0); }
  }
  let csize = 0; central.forEach(c => c.forEach(p => { parts.push(p); csize += p.length; }));
  parts.push(u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(csize), u32(offset), u16(0));
  return new Blob(parts, { type: 'application/zip' });
}
/* ArrayBuffer -> [{path, data}] (supports stored + deflate entries). */
async function readZip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a valid ZIP file');
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  if (count === 0xFFFF || p === 0xFFFFFFFF) throw new Error('ZIP64 archives are not supported');
  const out = [];
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt ZIP directory');
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = (flags & 0x800 ? dec : new TextDecoder('latin1')).decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + el + cl;
    if (name.endsWith('/')) continue;
    const dstart = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    const raw = u8.subarray(dstart, dstart + csz);
    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = await inflateRaw(raw);
    else throw new Error('Unsupported ZIP compression method in ' + name);
    out.push({ path: name, data });
  }
  return out;
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

/* ====================================================================
   Git-like data layer (all local): repositories, commits, branches
   ==================================================================== */
const OWNER_DEFAULT = 'developer';
const MAX_FILE = 8 * 1024 * 1024;          // per-file limit
const S = { user: null, repos: [], theme: 'dark' };

const userEmail = () => `${S.user.username}@users.offline.local`;
const authorObj = () => ({ name: S.user.name || S.user.username, email: userEmail() });

async function loadUser() {
  let u = await DB.get('users', 'me');
  if (!u) {
    u = { id: 'me', username: OWNER_DEFAULT, name: 'Developer', bio: 'Building things — fully offline.', followers: 12, following: 7, location: 'Local machine', createdAt: Date.now() };
    await DB.put('users', u);
  }
  S.user = u;
}
const loadRepos = async () => { S.repos = (await DB.all('repositories')).sort((a, b) => b.updatedAt - a.updatedAt); return S.repos; };
const repoByName = name => S.repos.find(r => r.name.toLowerCase() === String(name).toLowerCase());
const saveRepo = async r => { await DB.put('repositories', r); const i = S.repos.findIndex(x => x.id === r.id); if (i >= 0) S.repos[i] = r; else S.repos.push(r); };

/* ---------------- validation ---------------- */
function validateRepoName(name, selfId) {
  name = (name || '').trim();
  if (!name) return 'Repository name is required.';
  if (name.length > 100) return 'Repository name is too long (max 100 characters).';
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return 'Use only letters, numbers, hyphens (-), underscores (_) and dots (.).';
  if (name === '.' || name === '..' || name.endsWith('.git')) return 'That repository name is not allowed.';
  const dup = S.repos.find(r => r.name.toLowerCase() === name.toLowerCase() && r.id !== selfId);
  if (dup) return `A repository named “${dup.name}” already exists.`;
  return '';
}
function validateBranchName(name, repoId, existing = []) {
  name = (name || '').trim();
  if (!name) return 'Branch name is required.';
  if (name.length > 100) return 'Branch name is too long.';
  if (/\s/.test(name)) return 'Branch names cannot contain spaces.';
  if (/[~^:?*\[\\]|\.\.|\/\/|@\{/.test(name) || /^[\/.-]|[\/.]$|\.lock$/.test(name) || name === '@') return 'That is not a valid branch name.';
  if (!/^[A-Za-z0-9._\/-]+$/.test(name)) return 'Use only letters, numbers, ., _, - and /.';
  if (existing.some(b => b.name.toLowerCase() === name.toLowerCase())) return `A branch named “${name}” already exists.`;
  return '';
}

/* ---------------- blobs ---------------- */
const blobKey = (repoId, sha) => repoId + ':' + sha;
const getBlob = (repoId, sha) => DB.get('files', blobKey(repoId, sha));
const blobBytes = b => !b ? new Uint8Array() : b.binary ? new Uint8Array(b.content) : enc.encode(b.content);
const blobText = b => !b ? '' : b.binary ? dec.decode(new Uint8Array(b.content)) : b.content;
/* Make a blob record from string | Uint8Array */
function makeBlob(repoId, data, forceBinary) {
  let binary = false, content, sha, size;
  if (typeof data === 'string') { content = data; size = enc.encode(data).length; sha = hashStr('t' + data); }
  else {
    size = data.length;
    if (!forceBinary && looksText(data)) { content = decStrict.decode(data); sha = hashStr('t' + content); size = data.length; }
    else { binary = true; content = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength); sha = hashBytes(data); }
  }
  return { key: blobKey(repoId, sha), repoId, sha, size, binary, content };
}

/* ---------------- branches & commits ---------------- */
const commitKey = (repoId, id) => repoId + ':' + id;
async function getBranches(repoId) {
  const repo = S.repos.find(r => r.id === repoId);
  const list = await DB.byRepo('branches', repoId);
  return list.sort((a, b) => (b.name === repo?.defaultBranch) - (a.name === repo?.defaultBranch) || a.name.localeCompare(b.name));
}
const getBranch = (repoId, name) => DB.get('branches', repoId + ':' + name);
const getCommit = (repoId, id) => id ? DB.get('commits', commitKey(repoId, id)) : Promise.resolve(null);
async function allCommits(repoId) { const m = new Map(); (await DB.byRepo('commits', repoId)).forEach(c => m.set(c.id, c)); return m; }
/* Commits reachable from a head, newest first. */
async function history(repoId, headId, limit = 5000) {
  const map = await allCommits(repoId), out = [], seen = new Set(), stack = [headId];
  while (stack.length && out.length < limit) {
    const c = map.get(stack.shift()); if (!c || seen.has(c.id)) continue;
    seen.add(c.id); out.push(c); stack.push(...c.parents);
  }
  return out.sort((a, b) => b.date - a.date);
}
async function headOf(repoId, branchName) {
  const br = await getBranch(repoId, branchName);
  if (!br) return null;
  const commit = br.head ? await getCommit(repoId, br.head) : null;
  return { branch: br, commit, tree: commit ? commit.tree : {} };
}
function checkPathConflict(tree, path) {
  const segs = path.split('/');
  for (let i = 1; i < segs.length; i++) if (tree[segs.slice(0, i).join('/')]) throw new Error(`“${segs.slice(0, i).join('/')}” is a file, so “${path}” cannot be created inside it.`);
  const pre = path + '/'; for (const k in tree) if (k.startsWith(pre)) throw new Error(`A folder named “${path}” already exists.`);
}
function computeLangs(tree) {
  const t = {}; let total = 0;
  for (const [p, e] of Object.entries(tree)) { const k = langOf(p); if (k) { t[k] = (t[k] || 0) + (e.size || 1); total += (e.size || 1); } }
  return Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, bytes]) => ({ key: k, name: LANGS[k].name, color: LANGS[k].color, bytes, pct: total ? bytes / total * 100 : 0 }));
}
/* The one function through which every change is recorded as a commit.
   ops: {type:'put',path,data} | {type:'del',path} | {type:'delDir',path} | {type:'rename',from,to} | {type:'renameDir',from,to}
   Atomic: commit, blobs, branch pointer, repo metadata and activity are written in a single transaction. */
async function commitChanges(repo, branchName, message, ops, opts = {}) {
  message = (message || '').trim();
  if (!message) throw new Error('Please enter a commit message.');
  const head = await headOf(repo.id, branchName);
  if (!head) throw new Error(`Branch “${branchName}” no longer exists.`);
  const tree = { ...head.tree }, blobs = [], changes = [], touched = new Set();
  const date = opts.date || Date.now();
  for (const op of ops) {
    if (op.type === 'put') {
      const path = normPath(op.path); if (!path) throw new Error('Invalid file name: “' + op.path + '”');
      const existed = tree[path];
      if (!existed || op.overwrite === false) checkPathConflict(tree, path);
      if (existed && op.overwrite === false) throw new Error(`A file named “${path}” already exists.`);
      const size = typeof op.data === 'string' ? op.data.length * 1 : op.data.length;
      if (size > MAX_FILE) throw new Error(`“${baseName(path)}” is too large (${fmtSize(size)}). The limit is ${fmtSize(MAX_FILE)} per file.`);
      const blob = makeBlob(repo.id, op.data, op.binary);
      if (existed && existed.sha === blob.sha) continue;
      blobs.push(blob);
      tree[path] = { sha: blob.sha, size: blob.size, mod: date, cid: null, msg: message };
      touched.add(path); changes.push({ path, type: existed ? 'M' : 'A', size: blob.size });
    } else if (op.type === 'del') {
      if (!tree[op.path]) throw new Error('File not found: ' + op.path);
      delete tree[op.path]; changes.push({ path: op.path, type: 'D' });
    } else if (op.type === 'delDir') {
      const pre = op.path + '/'; const ks = Object.keys(tree).filter(k => k.startsWith(pre));
      if (!ks.length) throw new Error('Folder not found: ' + op.path);
      ks.forEach(k => { delete tree[k]; changes.push({ path: k, type: 'D' }); });
    } else if (op.type === 'rename' || op.type === 'renameDir') {
      const to = normPath(op.to); if (!to) throw new Error('Invalid name: “' + op.to + '”');
      const pairs = op.type === 'rename' ? [[op.from, to]] : Object.keys(tree).filter(k => k.startsWith(op.from + '/')).map(k => [k, to + k.slice(op.from.length)]);
      if (!pairs.length || (op.type === 'rename' && !tree[op.from])) throw new Error('Nothing to rename: ' + op.from);
      if (to === op.from) continue;
      if (op.type === 'renameDir' && (to + '/').startsWith(op.from + '/')) throw new Error('A folder cannot be moved into itself.');
      pairs.forEach(([a]) => delete tree[a]);
      for (const [a, b] of pairs) {
        if (tree[b]) throw new Error(`“${b}” already exists.`);
        checkPathConflict(tree, b);
      }
      for (const [a, b] of pairs) { tree[b] = { ...head.tree[a], mod: date, msg: message, cid: null }; touched.add(b); changes.push({ path: b, from: a, type: 'R' }); }
    }
  }
  if (!changes.length) throw new Error('There are no changes to commit.');
  const id = hashStr([head.commit?.id || 'root', message, date, Math.random(), JSON.stringify(changes)].join('|'));
  touched.forEach(p => { tree[p].cid = id; });
  const commit = { key: commitKey(repo.id, id), repoId: repo.id, id, message, author: opts.author || authorObj(), date, parents: head.commit ? [head.commit.id] : [], tree, changes, branch: branchName };
  const branch = { ...head.branch, head: id };
  const r2 = { ...repo, updatedAt: date };
  if (branchName === repo.defaultBranch) r2.language = (computeLangs(tree)[0] || {}).name || '';
  const act = { id: uid(), repoId: repo.id, repoName: repo.name, type: 'commit', text: message, branch: branchName, hash: id, date };
  await DB.batch([{ s: 'commits', put: commit }, ...blobs.map(b => ({ s: 'files', put: b })), { s: 'branches', put: branch }, { s: 'repositories', put: r2 }, { s: 'activity', put: act }]);
  const i = S.repos.findIndex(x => x.id === repo.id); if (i >= 0) S.repos[i] = r2;
  return commit;
}

/* ---------------- repo creation & templates ---------------- */
const GITIGNORES = {
  Node: 'node_modules/\nnpm-debug.log*\ndist/\n.env\n.DS_Store\ncoverage/\n',
  Python: '__pycache__/\n*.py[cod]\n.venv/\nvenv/\n.env\ndist/\n*.egg-info/\n.DS_Store\n',
  Java: '*.class\n*.jar\ntarget/\nbuild/\n.idea/\n*.iml\n.gradle/\n',
  'C++': '*.o\n*.obj\n*.exe\n*.out\nbuild/\nCMakeFiles/\nCMakeCache.txt\n',
  PHP: 'vendor/\n.env\n*.log\ncache/\n.phpunit.result.cache\n',
  'Web (HTML/CSS/JS)': '.DS_Store\nThumbs.db\n*.log\n.env\nnode_modules/\n.vscode/\n',
  'OS files': '.DS_Store\nThumbs.db\ndesktop.ini\n*.swp\n'
};
function licenseText(key, author) {
  const y = new Date().getFullYear();
  const L = {
    'MIT': `MIT License\n\nCopyright (c) ${y} ${author}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n`,
    'BSD-3-Clause': `BSD 3-Clause License\n\nCopyright (c) ${y}, ${author}\nAll rights reserved.\n\nRedistribution and use in source and binary forms, with or without\nmodification, are permitted provided that the following conditions are met:\n\n1. Redistributions of source code must retain the above copyright notice, this\n   list of conditions and the following disclaimer.\n\n2. Redistributions in binary form must reproduce the above copyright notice,\n   this list of conditions and the following disclaimer in the documentation\n   and/or other materials provided with the distribution.\n\n3. Neither the name of the copyright holder nor the names of its\n   contributors may be used to endorse or promote products derived from\n   this software without specific prior written permission.\n\nTHIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"\nAND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE\nIMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE\nDISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE\nFOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL\nDAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR\nSERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER\nCAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,\nOR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE\nOF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.\n`,
    'Unlicense': `This is free and unencumbered software released into the public domain.\n\nAnyone is free to copy, modify, publish, use, compile, sell, or distribute this\nsoftware, either in source code form or as a compiled binary, for any purpose,\ncommercial or non-commercial, and by any means.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.\n\nFor more information, please refer to <https://unlicense.org>\n`,
    'Apache-2.0': `Copyright ${y} ${author}\n\nLicensed under the Apache License, Version 2.0 (the "License");\nyou may not use this file except in compliance with the License.\nYou may obtain a copy of the License at\n\n    http://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software\ndistributed under the License is distributed on an "AS IS" BASIS,\nWITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\nSee the License for the specific language governing permissions and\nlimitations under the License.\n\n(Standard notice. The full license text is not bundled with this offline app.)\n`,
    'GPL-3.0': `Copyright (C) ${y} ${author}\n\nThis program is free software: you can redistribute it and/or modify\nit under the terms of the GNU General Public License as published by\nthe Free Software Foundation, either version 3 of the License, or\n(at your option) any later version.\n\nThis program is distributed in the hope that it will be useful,\nbut WITHOUT ANY WARRANTY; without even the implied warranty of\nMERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the\nGNU General Public License for more details.\n\nYou should have received a copy of the GNU General Public License\nalong with this program.  If not, see <https://www.gnu.org/licenses/>.\n\n(Standard notice. The full license text is not bundled with this offline app.)\n`
  };
  return L[key] || '';
}
const LICENSES = ['MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause', 'Unlicense'];

/* Create a repository record + its default branch; optionally an initial commit with the given files. */
async function createRepository({ name, description = '', visibility = 'public', readme = false, gitignore = '', license = '', files = [], message, date, demo = false, starCount = 0 }) {
  const err = validateRepoName(name); if (err) throw new Error(err);
  const now = date || Date.now();
  const repo = {
    id: uid(), name: name.trim(), owner: S.user.username, description: description.trim(), visibility, defaultBranch: 'main',
    stars: starCount, starred: false, watching: false, forks: 0, language: '', license, createdAt: now, updatedAt: now, openedAt: 0,
    counter: 0, pinned: false, demo
  };
  await DB.batch([{ s: 'repositories', put: repo }, { s: 'branches', put: { key: repo.id + ':main', repoId: repo.id, name: 'main', head: null, createdAt: now } }, { s: 'activity', put: { id: uid(), repoId: repo.id, repoName: repo.name, type: 'repo', text: 'Created repository', date: now } }]);
  S.repos.unshift(repo);
  const ops = [...files.map(f => ({ type: 'put', path: f.path, data: f.data }))];
  if (readme) ops.push({ type: 'put', path: 'README.md', data: `# ${repo.name}\n\n${repo.description || 'A new repository created with CodeRepo Offline.'}\n` });
  if (gitignore && GITIGNORES[gitignore]) ops.push({ type: 'put', path: '.gitignore', data: GITIGNORES[gitignore] });
  if (license && licenseText(license, S.user.name)) ops.push({ type: 'put', path: 'LICENSE', data: licenseText(license, S.user.name) });
  if (ops.length) await commitChanges(repo, 'main', message || (files.length ? 'Initial commit' : 'Initial commit'), ops, { date: now });
  return S.repos.find(r => r.id === repo.id);
}
async function logActivity(repo, type, text, extra = {}) { await DB.put('activity', { id: uid(), repoId: repo.id, repoName: repo.name, type, text, date: Date.now(), ...extra }); }

async function createBranch(repo, name, fromName) {
  const brs = await getBranches(repo.id);
  const err = validateBranchName(name, repo.id, brs); if (err) throw new Error(err);
  const src = brs.find(b => b.name === fromName);
  if (!src) throw new Error('Source branch not found.');
  if (!src.head) throw new Error('This repository has no commits yet. Create a file first.');
  const br = { key: repo.id + ':' + name.trim(), repoId: repo.id, name: name.trim(), head: src.head, createdAt: Date.now(), from: fromName };
  await DB.batch([{ s: 'branches', put: br }, { s: 'activity', put: { id: uid(), repoId: repo.id, repoName: repo.name, type: 'branch', text: `Created branch ${br.name} from ${fromName}`, date: Date.now() } }]);
  return br;
}
async function renameBranch(repo, oldName, newName) {
  const brs = await getBranches(repo.id);
  const err = validateBranchName(newName, repo.id, brs.filter(b => b.name !== oldName)); if (err) throw new Error(err);
  newName = newName.trim(); if (newName === oldName) return;
  const b = brs.find(x => x.name === oldName); if (!b) throw new Error('Branch not found.');
  const ops = [{ s: 'branches', del: b.key }, { s: 'branches', put: { ...b, key: repo.id + ':' + newName, name: newName } }];
  if (repo.defaultBranch === oldName) ops.push({ s: 'repositories', put: { ...repo, defaultBranch: newName } });
  for (const p of await DB.byRepo('pullRequests', repo.id)) {
    if (p.source === oldName || p.target === oldName) ops.push({ s: 'pullRequests', put: { ...p, source: p.source === oldName ? newName : p.source, target: p.target === oldName ? newName : p.target } });
  }
  await DB.batch(ops);
  if (repo.defaultBranch === oldName) { const r = S.repos.find(x => x.id === repo.id); r.defaultBranch = newName; }
}
async function deleteBranch(repo, name, currentName) {
  if (name === repo.defaultBranch) throw new Error(`“${name}” is the default branch and cannot be deleted. Change the default branch in Settings first.`);
  if (name === currentName) throw new Error(`You are currently viewing “${name}”. Switch to another branch before deleting it.`);
  const b = await getBranch(repo.id, name); if (!b) throw new Error('Branch not found.');
  await DB.del('branches', b.key);
}
async function setDefaultBranch(repo, name) {
  if (!(await getBranch(repo.id, name))) throw new Error('Branch not found.');
  const r = { ...repo, defaultBranch: name }; await saveRepo(r);
  const h = await headOf(repo.id, name); r.language = (computeLangs(h?.tree || {})[0] || {}).name || ''; await saveRepo(r);
}
async function deleteRepository(repo) {
  await DB.purgeRepo(repo.id, ['files', 'commits', 'branches', 'issues', 'pullRequests', 'activity']);
  await DB.del('repositories', repo.id);
  S.repos = S.repos.filter(r => r.id !== repo.id);
}
async function nextNumber(repo) { const r = { ...repo, counter: (repo.counter || 0) + 1 }; await saveRepo(r); return r.counter; }

/* ---------------- tree helpers ---------------- */
/* Direct children of a directory: folders first (with newest descendant), then files. */
function listDir(tree, dir) {
  const pre = dir ? dir + '/' : ''; const dirs = new Map(), files = [];
  for (const [p, e] of Object.entries(tree)) {
    if (!p.startsWith(pre)) continue;
    const rest = p.slice(pre.length), i = rest.indexOf('/');
    if (i < 0) files.push({ name: rest, path: p, e, dir: false });
    else {
      const n = rest.slice(0, i); let d = dirs.get(n);
      if (!d) dirs.set(n, d = { name: n, path: pre + n, dir: true, e: { mod: 0, msg: '', cid: null, size: 0 }, count: 0 });
      d.count++; d.e.size += e.size || 0;
      if (e.mod >= d.e.mod) { d.e.mod = e.mod; d.e.msg = e.msg; d.e.cid = e.cid; }
    }
  }
  return { dirs: [...dirs.values()], files };
}
const dirExists = (tree, dir) => !dir || Object.keys(tree).some(k => k.startsWith(dir + '/'));
const folderOptions = tree => { const s = new Set(['']); Object.keys(tree).forEach(p => { const segs = p.split('/'); for (let i = 1; i < segs.length; i++) s.add(segs.slice(0, i).join('/')); }); return [...s].sort(); };

/* ---------------- diff (LCS on lines) ---------------- */
function diffLines(aText, bText) {
  const a = aText === '' ? [] : aText.replace(/\r\n?/g, '\n').split('\n'), b = bText === '' ? [] : bText.replace(/\r\n?/g, '\n').split('\n');
  let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length; while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const A = a.slice(s, ea), B = b.slice(s, eb), n = A.length, m = B.length, out = [];
  for (let i = 0; i < s; i++) out.push({ t: ' ', s: a[i], a: i + 1, b: i + 1 });
  if (n * m > 3e6) { A.forEach((x, i) => out.push({ t: '-', s: x, a: s + i + 1 })); B.forEach((x, i) => out.push({ t: '+', s: x, b: s + i + 1 })); }
  else {
    const w = m + 1, dp = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * w + j] = A[i] === B[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { out.push({ t: ' ', s: A[i], a: s + i + 1, b: s + j + 1 }); i++; j++; }
      else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { out.push({ t: '-', s: A[i], a: s + i + 1 }); i++; }
      else { out.push({ t: '+', s: B[j], b: s + j + 1 }); j++; }
    }
    while (i < n) { out.push({ t: '-', s: A[i], a: s + i + 1 }); i++; }
    while (j < m) { out.push({ t: '+', s: B[j], b: s + j + 1 }); j++; }
  }
  for (let i = ea; i < a.length; i++) out.push({ t: ' ', s: a[i], a: i + 1, b: eb + (i - ea) + 1 });
  return out;
}
/* Collapse unchanged runs into hunks with 3 lines of context. */
function toHunks(d, ctx = 3) {
  const keep = new Array(d.length).fill(false);
  d.forEach((x, i) => { if (x.t !== ' ') for (let k = Math.max(0, i - ctx); k <= Math.min(d.length - 1, i + ctx); k++) keep[k] = true; });
  const out = []; let skipped = 0;
  d.forEach((x, i) => { if (keep[i]) { if (skipped) { out.push({ t: '@', s: `… ${skipped} unchanged line${skipped > 1 ? 's' : ''}` }); skipped = 0; } out.push(x); } else skipped++; });
  if (skipped && out.length) out.push({ t: '@', s: `… ${skipped} unchanged line${skipped > 1 ? 's' : ''}` });
  return out;
}

/* ====================================================================
   Issues, pull requests, merge, export / import, demo data
   ==================================================================== */
const LABELS = [
  { name: 'bug', color: '#f85149' }, { name: 'enhancement', color: '#3fb950' }, { name: 'documentation', color: '#58a6ff' },
  { name: 'question', color: '#e3b341' }, { name: 'help wanted', color: '#a371f7' }, { name: 'good first issue', color: '#39c5cf' }
];
const labelColor = n => (LABELS.find(l => l.name === n) || { color: '#8b98ad' }).color;
const labelChip = n => { const c = labelColor(n); return `<span class="lbl-chip" style="color:${c};background:${c}22;border-color:${c}55">${esc(n)}</span>`; };

async function createIssue(repo, { title, body, labels }, date) {
  title = (title || '').trim(); if (!title) throw new Error('Please enter a title.');
  const number = await nextNumber(repo);
  const now = date || Date.now();
  const it = { id: uid(), repoId: repo.id, number, title, body: body || '', labels: labels || [], state: 'open', comments: [], author: S.user.username, createdAt: now, updatedAt: now };
  await DB.batch([{ s: 'issues', put: it }, { s: 'activity', put: { id: uid(), repoId: repo.id, repoName: repo.name, type: 'issue', text: `Opened issue #${number}: ${title}`, date: now } }]);
  return it;
}
async function saveIssue(it) { it.updatedAt = Date.now(); await DB.put('issues', it); return it; }
async function setIssueState(repo, it, state) {
  it.state = state; it.closedAt = state === 'closed' ? Date.now() : null; it.updatedAt = Date.now();
  await DB.batch([{ s: 'issues', put: it }, { s: 'activity', put: { id: uid(), repoId: repo.id, repoName: repo.name, type: 'issue', text: `${state === 'closed' ? 'Closed' : 'Reopened'} issue #${it.number}: ${it.title}`, date: Date.now() } }]);
}
const addComment = (it, text, date) => { it.comments.push({ id: uid(), author: S.user.username, body: text, date: date || Date.now() }); return saveIssue(it); };

/* ---- compare / merge ---- */
function treeDiff(a, b) {
  const out = [];
  for (const p in b) { if (!a[p]) out.push({ path: p, type: 'A' }); else if (a[p].sha !== b[p].sha) out.push({ path: p, type: 'M' }); }
  for (const p in a) if (!b[p]) out.push({ path: p, type: 'D' });
  return out.sort((x, y) => x.path.localeCompare(y.path));
}
function ancestors(map, id) { const s = new Set(), st = [id]; while (st.length) { const c = map.get(st.pop()); if (c && !s.has(c.id)) { s.add(c.id); st.push(...c.parents); } } return s; }
/* Commits in `source` that are not in `target` (what a PR would bring in). */
async function compareBranches(repo, source, target) {
  const [sb, tb, map] = [await getBranch(repo.id, source), await getBranch(repo.id, target), await allCommits(repo.id)];
  if (!sb || !tb) throw new Error('Branch not found.');
  const sa = sb.head ? ancestors(map, sb.head) : new Set(), ta = tb.head ? ancestors(map, tb.head) : new Set();
  const ahead = [...sa].filter(i => !ta.has(i)).map(i => map.get(i)).sort((a, b) => b.date - a.date);
  const sc = sb.head ? map.get(sb.head) : null, tc = tb.head ? map.get(tb.head) : null;
  return { ahead, behind: [...ta].filter(i => !sa.has(i)).length, files: treeDiff(tc ? tc.tree : {}, sc ? sc.tree : {}), srcCommit: sc, tgtCommit: tc, map, sa, ta };
}
/* Three-way, file-level merge. Throws with a list of conflicting files if both sides changed the same file. */
async function mergeBranchesInto(repo, source, target, message) {
  const cmp = await compareBranches(repo, source, target);
  if (!cmp.ahead.length) throw new Error(`“${target}” already contains everything from “${source}”.`);
  const { map, sa, ta, srcCommit, tgtCommit } = cmp;
  // merge base = newest common ancestor
  const base = [...sa].filter(i => ta.has(i)).map(i => map.get(i)).sort((a, b) => b.date - a.date)[0];
  const B = base ? base.tree : {}, Sx = srcCommit.tree, T = tgtCommit ? tgtCommit.tree : {};
  const out = {}, conflicts = [];
  for (const p of new Set([...Object.keys(B), ...Object.keys(Sx), ...Object.keys(T)])) {
    const b = B[p]?.sha, s = Sx[p]?.sha, t = T[p]?.sha;
    if (s === t) { if (T[p]) out[p] = T[p]; }
    else if (t === b) { if (Sx[p]) out[p] = Sx[p]; }
    else if (s === b) { if (T[p]) out[p] = T[p]; }
    else conflicts.push(p);
  }
  if (conflicts.length) { const e = new Error('Merge conflicts in: ' + conflicts.slice(0, 6).join(', ') + (conflicts.length > 6 ? ` and ${conflicts.length - 6} more` : '') + '. Resolve them on one of the branches first.'); e.conflicts = conflicts; throw e; }
  const date = Date.now();
  const changes = treeDiff(T, out).map(c => ({ ...c }));
  const id = hashStr(['merge', source, target, date, Math.random()].join('|'));
  const commit = { key: commitKey(repo.id, id), repoId: repo.id, id, message, author: authorObj(), date, parents: [tgtCommit ? tgtCommit.id : null, srcCommit.id].filter(Boolean), tree: out, changes, branch: target, merge: true };
  const tb = await getBranch(repo.id, target);
  const r2 = { ...repo, updatedAt: date };
  if (target === repo.defaultBranch) r2.language = (computeLangs(out)[0] || {}).name || '';
  await DB.batch([{ s: 'commits', put: commit }, { s: 'branches', put: { ...tb, head: id } }, { s: 'repositories', put: r2 }, { s: 'activity', put: { id: uid(), repoId: repo.id, repoName: repo.name, type: 'commit', text: message, branch: target, hash: id, date } }]);
  const i = S.repos.findIndex(x => x.id === repo.id); if (i >= 0) S.repos[i] = r2;
  return commit;
}
async function createPR(repo, { title, body, source, target }, date) {
  title = (title || '').trim(); if (!title) throw new Error('Please enter a title.');
  if (!source || !target) throw new Error('Choose both branches.');
  if (source === target) throw new Error('Source and destination branches must be different.');
  const cmp = await compareBranches(repo, source, target);
  if (!cmp.ahead.length) throw new Error(`There is nothing to compare — “${source}” has no commits that “${target}” does not already have.`);
  const existing = (await DB.byRepo('pullRequests', repo.id)).find(p => p.state === 'open' && p.source === source && p.target === target);
  if (existing) throw new Error(`An open pull request (#${existing.number}) already exists for these branches.`);
  const number = await nextNumber(repo); const now = date || Date.now();
  const pr = { id: uid(), repoId: repo.id, number, title, body: body || '', source, target, state: 'open', comments: [], author: S.user.username, createdAt: now, updatedAt: now };
  await DB.batch([{ s: 'pullRequests', put: pr }, { s: 'activity', put: { id: uid(), repoId: repo.id, repoName: repo.name, type: 'pr', text: `Opened pull request #${number}: ${title}`, date: now } }]);
  return pr;
}
async function mergePR(repo, pr) {
  const c = await mergeBranchesInto(repo, pr.source, pr.target, `Merge pull request #${pr.number} from ${pr.source}\n\n${pr.title}`.split('\n')[0] + ` — ${pr.title}`);
  pr.state = 'merged'; pr.mergedAt = Date.now(); pr.mergeCommit = c.id; pr.updatedAt = Date.now();
  await DB.batch([{ s: 'pullRequests', put: pr }, { s: 'activity', put: { id: uid(), repoId: repo.id, repoName: repo.name, type: 'pr', text: `Merged pull request #${pr.number}: ${pr.title}`, date: Date.now() } }]);
  return c;
}

/* ---- export / import ---- */
async function repoToZip(repo, branchName, onProgress) {
  const h = await headOf(repo.id, branchName);
  if (!h || !h.commit) throw new Error('This branch has no files to download.');
  const entries = [], root = `${repo.name}-${branchName.replace(/\//g, '-')}/`;
  const paths = Object.keys(h.tree).sort();
  for (const p of paths) { const b = await getBlob(repo.id, h.tree[p].sha); entries.push({ path: root + p, data: blobBytes(b), mtime: h.tree[p].mod }); }
  return makeZip(entries, onProgress);
}
async function exportRepoData(repo) {
  const [branches, commits, blobs, issues, prs, acts] = await Promise.all(['branches', 'commits', 'files', 'issues', 'pullRequests', 'activity'].map(s => DB.byRepo(s, repo.id)));
  return {
    app: 'CodeRepo Offline', version: 1, exportedAt: Date.now(), repo,
    branches: branches.map(({ key, repoId, ...b }) => b),
    commits: commits.map(({ key, repoId, ...c }) => c),
    blobs: blobs.map(b => ({ sha: b.sha, size: b.size, binary: b.binary, content: b.binary ? b64(new Uint8Array(b.content)) : b.content })),
    issues: issues.map(({ repoId, ...i }) => i), pullRequests: prs.map(({ repoId, ...p }) => p), activity: acts.map(({ repoId, ...a }) => a)
  };
}
async function importRepoData(json, name) {
  if (!json || json.app !== 'CodeRepo Offline' || !json.repo || !Array.isArray(json.commits) || !Array.isArray(json.branches)) throw new Error('This file is not a CodeRepo Offline repository export.');
  name = (name || json.repo.name || '').trim();
  const err = validateRepoName(name); if (err) throw new Error(err);
  const rid = uid(), ops = [];
  const repo = { ...json.repo, id: rid, name, owner: S.user.username, openedAt: 0, demo: false };
  ops.push({ s: 'repositories', put: repo });
  json.branches.forEach(b => ops.push({ s: 'branches', put: { ...b, repoId: rid, key: rid + ':' + b.name } }));
  json.commits.forEach(c => ops.push({ s: 'commits', put: { ...c, repoId: rid, key: rid + ':' + c.id } }));
  (json.blobs || []).forEach(b => ops.push({ s: 'files', put: { key: rid + ':' + b.sha, repoId: rid, sha: b.sha, size: b.size, binary: !!b.binary, content: b.binary ? (u => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength))(unb64(b.content)) : b.content } }));
  (json.issues || []).forEach(i => ops.push({ s: 'issues', put: { ...i, repoId: rid } }));
  (json.pullRequests || []).forEach(p => ops.push({ s: 'pullRequests', put: { ...p, repoId: rid } }));
  (json.activity || []).forEach(a => ops.push({ s: 'activity', put: { ...a, id: uid(), repoId: rid, repoName: name } }));
  ops.push({ s: 'activity', put: { id: uid(), repoId: rid, repoName: name, type: 'repo', text: 'Imported repository', date: Date.now() } });
  await DB.batch(ops);
  S.repos.unshift(repo);
  return repo;
}
/* Turn picked/dropped files (File objects with optional webkitRelativePath) into commit "put" ops. */
async function importZipAsRepo(file, name, description) {
  const entries = (await readZip(await file.arrayBuffer())).filter(e => !/(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$)/.test(e.path));
  if (!entries.length) throw new Error('The ZIP file is empty.');
  const tops = new Set(entries.map(e => e.path.split('/')[0]));
  const strip = tops.size === 1 && entries.every(e => e.path.includes('/'));
  const files = []; let skipped = 0;
  for (const e of entries) {
    const path = normPath(strip ? e.path.split('/').slice(1).join('/') : e.path);
    if (!path) { skipped++; continue; }
    if (e.data.length > MAX_FILE) { skipped++; continue; }
    files.push({ path, data: e.data });
  }
  if (!files.length) throw new Error('No importable files were found in the ZIP.');
  const repo = await createRepository({ name, description: description || 'Imported from ' + file.name, files, message: 'Import from ' + file.name });
  return { repo, count: files.length, skipped };
}

/* ---- demo data ---- */
const DEMO_FILES = {
  readme1: '# CodeRepo Offline\n\nA tiny demo project.\n',
  index: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CodeRepo Offline Demo</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="card">
    <h1>Offline Todo</h1>
    <form id="form">
      <input id="task" placeholder="What needs doing?" autocomplete="off" required>
      <button type="submit">Add</button>
    </form>
    <ul id="list"></ul>
  </main>
  <script src="script.js"></script>
</body>
</html>
`,
  css: `:root {
  --bg: #f4f6fb;
  --card: #ffffff;
  --text: #18202c;
  --accent: #3b6df0;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
}

.card {
  width: min(92vw, 420px);
  padding: 24px;
  border-radius: 16px;
  background: var(--card);
  box-shadow: 0 12px 40px rgba(30, 45, 80, .15);
}

form { display: flex; gap: 8px; }
input { flex: 1; padding: 10px 12px; border-radius: 10px; border: 1px solid #c9d2e3; }
button { padding: 10px 16px; border: 0; border-radius: 10px; background: var(--accent); color: #fff; font-weight: 600; }
li { padding: 10px 0; border-bottom: 1px solid #e5e9f2; list-style: none; }
li.done { text-decoration: line-through; opacity: .5; }
`,
  js: `// Offline Todo — state is kept in localStorage, no network needed.
const form = document.getElementById('form');
const input = document.getElementById('task');
const list = document.getElementById('list');

let todos = [];
try { todos = JSON.parse(localStorage.getItem('todos') || '[]'); } catch (err) { /* storage unavailable */ }

function save() {
  try { localStorage.setItem('todos', JSON.stringify(todos)); } catch (err) { /* ignore */ }
}

function render() {
  list.innerHTML = '';
  todos.forEach((todo, index) => {
    const li = document.createElement('li');
    li.textContent = todo.text;
    li.className = todo.done ? 'done' : '';
    li.addEventListener('click', () => {
      todos[index].done = !todos[index].done;
      save();
      render();
    });
    list.appendChild(li);
  });
}

form.addEventListener('submit', event => {
  event.preventDefault();
  todos.push({ text: input.value.trim(), done: false });
  input.value = '';
  save();
  render();
});

render();
`,
  readme2: `# CodeRepo Offline

A tiny demo project that lives **entirely in your browser**. Edit it, commit to it, branch it — nothing ever leaves this device.

## What is inside

- \`index.html\` — the page markup
- \`style.css\` — styles using CSS variables
- \`script.js\` — a small offline todo list

## Try it

1. Open a file and press **Edit**
2. Change something and write a commit message
3. Create a branch and open a pull request

\`\`\`js
// every commit is stored in IndexedDB
console.log('Hello from the offline side');
\`\`\`

| Feature | Status |
| --- | --- |
| Commits | Done |
| Branches | Done |
| Pull requests (simulated) | Done |

> This is an offline simulation. It never connects to any Git hosting service.
`
};
async function createDemoRepo() {
  const day = 86400000, now = Date.now();
  if (repoByName('CodeRepo-Offline')) throw new Error('The demo repository already exists.');
  let repo = await createRepository({ name: 'CodeRepo-Offline', description: 'Demo repository — a tiny offline todo web page. Safe to delete.', visibility: 'public', demo: true, starCount: 128, date: now - 21 * day, message: 'Create project structure', files: [{ path: 'README.md', data: DEMO_FILES.readme1 }] });
  const c = (msg, ops, ago, br = 'main') => commitChanges(repo, br, msg, ops, { date: now - ago * day });
  await c('Add index.html', [{ type: 'put', path: 'index.html', data: DEMO_FILES.index }], 18);
  await c('Add style.css', [{ type: 'put', path: 'style.css', data: DEMO_FILES.css }], 14);
  await c('Add script.js', [{ type: 'put', path: 'script.js', data: DEMO_FILES.js }], 9);
  await c('Update README', [{ type: 'put', path: 'README.md', data: DEMO_FILES.readme2 }], 3);
  repo = S.repos.find(r => r.id === repo.id);
  const br = await createBranch(repo, 'feature/dark-mode', 'main');
  await DB.put('branches', { ...br, createdAt: now - 2 * day });
  await c('Add dark mode styles', [{ type: 'put', path: 'style.css', data: DEMO_FILES.css.replace('* { box-sizing', '@media (prefers-color-scheme: dark) {\n  :root { --bg: #0d1117; --card: #161b22; --text: #e6edf3; }\n}\n\n* { box-sizing') }], 2, 'feature/dark-mode');
  repo = S.repos.find(r => r.id === repo.id);
  await createIssue(repo, { title: 'Typo in the README intro', body: 'The first sentence is missing a comma.', labels: ['documentation', 'good first issue'] }, now - 16 * day);
  repo = S.repos.find(r => r.id === repo.id);
  const i1 = (await DB.byRepo('issues', repo.id))[0]; i1.state = 'closed'; i1.closedAt = now - 12 * day; i1.comments.push({ id: uid(), author: S.user.username, body: 'Fixed in the latest README update.', date: now - 12 * day }); await DB.put('issues', i1);
  await createIssue(repo, { title: 'Add keyboard shortcuts', body: 'It would be great to add the todo with **Ctrl+Enter**.\n\n- [ ] Ctrl+Enter to add\n- [ ] Escape to clear', labels: ['enhancement'] }, now - 6 * day);
  repo = S.repos.find(r => r.id === repo.id);
  await createPR(repo, { title: 'Add dark mode styles', body: 'Adds a `prefers-color-scheme: dark` palette.\n\nThis is a simulated pull request — it only exists in your browser.', source: 'feature/dark-mode', target: 'main' }, now - 2 * day);
  return S.repos.find(r => r.id === repo.id);
}

/* ====================================================================
   App shell, router, dashboard, new repository
   ==================================================================== */
const V = { repo: null, branch: null, dir: '' };   // context of the repository view currently on screen
let navToken = 0;
const ACTIONS = {};
const go = h => { if (location.hash === h) render(); else location.hash = h; };
const H = {
  repo: r => `#/r/${enc1(r.name)}`,
  tree: (r, b, p = '') => `#/r/${enc1(r.name)}/tree/${pathEnc(b)}${p ? '/' + pathEnc(p) : ''}`,
  blob: (r, b, p) => `#/r/${enc1(r.name)}/blob/${pathEnc(b)}/${pathEnc(p)}`,
  edit: (r, b, p) => `#/r/${enc1(r.name)}/edit/${pathEnc(b)}/${pathEnc(p)}`,
  newFile: (r, b, d = '') => `#/r/${enc1(r.name)}/new/${pathEnc(b)}${d ? '/' + pathEnc(d) : ''}`,
  upload: (r, b, d = '') => `#/r/${enc1(r.name)}/upload/${pathEnc(b)}${d ? '/' + pathEnc(d) : ''}`,
  commits: (r, b) => `#/r/${enc1(r.name)}/commits/${pathEnc(b)}`,
  commit: (r, id) => `#/r/${enc1(r.name)}/commit/${id}`,
  sub: (r, s) => `#/r/${enc1(r.name)}/${s}`
};
function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [p, qs] = h.split('?');
  let segs = p.split('/').filter(Boolean); try { segs = segs.map(decodeURIComponent); } catch (e) { /* keep raw */ }
  return { segs, q: new URLSearchParams(qs || ''), raw: h };
}
/* Branch names may contain "/", so match the longest existing branch name at the start of the path. */
async function resolveBranchPath(repo, segs) {
  const brs = await getBranches(repo.id);
  S.cur = S.cur || {};
  if (!segs.length) { S.cur[repo.id] = repo.defaultBranch; return { branch: repo.defaultBranch, path: '', branches: brs }; }
  for (let n = segs.length; n >= 1; n--) {
    const name = segs.slice(0, n).join('/');
    if (brs.some(b => b.name === name)) { S.cur[repo.id] = name; return { branch: name, path: segs.slice(n).join('/'), branches: brs }; }
  }
  return { branch: segs[0], path: segs.slice(1).join('/'), branches: brs, missing: true };
}

/* ---------------- chrome ---------------- */
const initials = n => (n || '?').trim().slice(0, 2).toUpperCase();
function buildTopbar() {
  $('#topbar').innerHTML = `<div class="topbar-in">
    <a class="brand" href="#/" aria-label="CodeRepo Offline home"><span class="logo">${ic('branch')}</span><span class="brand-name">CodeRepo <small>Offline</small></span></a>
    <nav class="topnav" aria-label="Main"><a href="#/" data-nav="">Dashboard</a><a href="#/search" data-nav="search">Search</a><a href="#/profile" data-nav="profile">Profile</a><a href="#/settings" data-nav="settings">Settings</a></nav>
    <span class="spacer"></span>
    <button class="searchbox" data-act="palette" aria-label="Open command palette">${ic('search')}<span>Search or run a command…</span><kbd>Ctrl K</kbd></button>
    <span class="offline-pill" title="Offline Mode — everything is stored on this device"><i></i>Offline Mode</span>
    <button class="btn btn-ghost btn-icon" id="tb-search-ic" data-act="palette" aria-label="Command palette">${ic('command', 'lg')}</button>
    <button class="btn btn-ghost btn-icon" data-act="theme" aria-label="Toggle theme" id="theme-btn"></button>
    <button class="btn btn-ghost btn-icon desk" data-act="new-menu" aria-label="Create new">${ic('plus', 'lg')}</button>
    <a href="#/profile" aria-label="Profile"><span class="avatar" id="tb-avatar">${esc(initials(S.user.username))}</span></a>
  </div>`;
  $('#bottomnav').innerHTML = [['', 'home', 'Home'], ['search', 'search', 'Search'], ['new', 'plus', 'New'], ['profile', 'user', 'Profile'], ['settings', 'gear', 'Settings']]
    .map(([k, i, l]) => k === 'new' ? `<a class="bn fab" href="#/new" data-nav="new" aria-label="New repository"><span class="fab-i">${ic(i, 'lg')}</span><span>${l}</span></a>` : `<a class="bn" href="#/${k}" data-nav="${k}">${ic(i)}<span>${l}</span></a>`).join('');
  syncTheme();
}
function syncTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  const b = $('#theme-btn'); if (b) b.innerHTML = ic(t === 'dark' ? 'sun' : 'moon', 'lg');
  const m = $('meta[name=theme-color]'); if (m) m.content = t === 'dark' ? '#0b0f17' : '#f3f5fa';
}
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('cro-theme', t); } catch (e) { /* ignore */ }
  setSetting('theme', t).catch(() => {}); syncTheme();
}
const toggleTheme = () => { setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); };
function updateChrome(r) {
  const k = r.segs[0] === 'r' ? '' : (r.segs[0] || '');
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === k));
  const av = $('#tb-avatar'); if (av) av.textContent = initials(S.user.username);
}
function put(token, html) {
  if (token !== navToken) return false;
  const app = $('#app');
  app.innerHTML = `<div class="view">${html}</div>`;
  return true;
}
function showError(e) {
  $('#app').innerHTML = `<div class="view page-narrow"><div class="card"><div class="empty">${ic('alert', 'xl')}<h3>Something went wrong</h3><p>${esc(e.message || e)}</p><a class="btn btn-primary" href="#/">Back to dashboard</a></div></div></div>`;
}
const notFound = (what = 'page') => `<div class="card"><div class="empty">${ic('search', 'xl')}<h3>${esc(what)} not found</h3><p>It may have been renamed or deleted. All data is stored locally on this device.</p><a class="btn btn-primary" href="#/">Back to dashboard</a></div></div>`;

/* ---------------- router ---------------- */
async function render() {
  const token = ++navToken; closeMenu();
  const r = parseHash(); V.route = r;
  updateChrome(r);
  window.scrollTo(0, 0);
  try {
    const s = r.segs;
    if (!s.length) await viewDashboard(token);
    else if (s[0] === 'new') await viewNewRepo(token);
    else if (s[0] === 'search') await viewSearch(token, r.q.get('q') || '', r.q.get('t') || 'repos');
    else if (s[0] === 'profile') await viewProfile(token);
    else if (s[0] === 'settings') await viewGlobalSettings(token, s[1] || 'general');
    else if (s[0] === 'r' && s[1]) await viewRepoRoute(token, s);
    else put(token, notFound());
  } catch (e) { console.error(e); if (token === navToken) showError(e); }
  const app = $('#app'); if (app) app.focus({ preventScroll: true });
}

/* ---------------- global click handling ---------------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACTIONS[el.dataset.act]; if (!fn) return;
  if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
  Promise.resolve(fn(el, e)).catch(err => { console.error(err); toast(err.message || String(err), 'err', 5000); });
});
ACTIONS.theme = () => toggleTheme();
ACTIONS['new-menu'] = el => openMenu(el, { items: [
  { label: 'New repository', icon: 'repo', onClick: () => go('#/new') },
  { label: 'Import repository', icon: 'upload', onClick: () => importFlow() },
  ...(V.repo && $('#app .rh') ? [{ divider: true }, { label: 'New file', icon: 'file-plus', onClick: () => go(H.newFile(V.repo, V.branch, V.dir)) }, { label: 'Upload files', icon: 'upload', onClick: () => go(H.upload(V.repo, V.branch, V.dir)) }, { label: 'New issue', icon: 'issue', onClick: () => go(H.sub(V.repo, 'issues/new')) }] : [])
] });

/* ---------------- dashboard ---------------- */
function repoCard(r, branchesCount) {
  const lang = Object.values(LANGS).find(l => l.name === r.language);
  return `<article class="repo-card">
    <div class="rc-t">${ic(r.visibility === 'private' ? 'lock' : 'repo')}<a href="${H.repo(r)}">${esc(r.name)}</a><span class="badge">${r.visibility === 'private' ? 'Private' : 'Public'}</span>${r.demo ? '<span class="badge blue">Demo</span>' : ''}
      <span class="grow"></span><button class="kebab" data-act="card-menu" data-id="${r.id}" aria-label="Repository actions for ${esc(r.name)}">${ic('more', 'lg')}</button></div>
    <p>${r.description ? esc(r.description) : '<span class="muted">No description provided.</span>'}</p>
    <div class="rc-m">
      ${r.language ? `<span><i class="lang-dot" style="background:${lang ? lang.color : '#888'}"></i>${esc(r.language)}</span>` : ''}
      <span class="${r.starred ? 'yellow' : ''}">${ic('star')}${r.stars || 0}</span>
      <span>${ic('fork')}${r.forks || 0}</span>
      <span>${ic('clock')}Updated ${ago(r.updatedAt)}</span>
    </div></article>`;
}
function filterRepos(list, q, type, sort) {
  q = (q || '').toLowerCase().trim();
  let out = list.filter(r => (!q || r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q)) &&
    (type === 'all' || (type === 'starred' ? r.starred : r.visibility === type)));
  out.sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : sort === 'stars' ? (a, b) => b.stars - a.stars : (a, b) => b.updatedAt - a.updatedAt);
  return out;
}
async function viewDashboard(token) {
  await loadRepos();
  const [acts, issues] = await Promise.all([DB.all('activity'), DB.all('issues')]);
  const commitsN = acts.filter(a => a.type === 'commit').length, openIssues = issues.filter(i => i.state === 'open').length;
  const stars = S.repos.reduce((n, r) => n + (r.stars || 0), 0);
  const recent = [...S.repos].filter(r => r.openedAt).sort((a, b) => b.openedAt - a.openedAt).slice(0, 8);
  const hour = new Date().getHours(), greet = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const side = `<aside class="dash-side" aria-label="Sidebar">
    <div class="card side-card"><div class="row"><span class="avatar md">${esc(initials(S.user.username))}</span><div class="grow"><b class="trunc" style="display:block">${esc(S.user.name || S.user.username)}</b><span class="muted small trunc" style="display:block">@${esc(S.user.username)}</span></div></div>
      <p class="muted small" style="margin:10px 0 0">${esc(S.user.bio || '')}</p></div>
    <div class="card side-card"><div class="row between"><b>Your repositories</b><a class="btn btn-sm btn-success" href="#/new">${ic('plus')}New</a></div>
      <div class="side-list">${S.repos.slice(0, 8).map(r => `<a href="${H.repo(r)}">${ic(r.visibility === 'private' ? 'lock' : 'repo')}<span>${esc(r.name)}</span></a>`).join('') || '<span class="muted small" style="padding:6px 8px">Nothing here yet</span>'}</div></div>
    <div class="card side-card"><b>Shortcuts</b><div class="side-list"><a href="#/search">${ic('search')}<span>Global search</span></a><a href="#/profile">${ic('user')}<span>Profile &amp; activity</span></a><a href="#/settings">${ic('gear')}<span>Settings &amp; backup</span></a><a href="#" data-act="palette">${ic('command')}<span>Command palette</span></a></div></div>
  </aside>`;
  const main = `<div class="stack">
    <section class="hero"><h1>${greet}, ${esc(S.user.name || S.user.username)}</h1>
      <p>Your repositories live entirely in this browser — create, commit, branch and review code without a connection.</p>
      <div class="row wrap"><a class="btn btn-primary btn-lg" href="#/new">${ic('plus')}New repository</a><button class="btn btn-lg" data-act="import">${ic('upload')}Import</button></div></section>
    <section class="stats" aria-label="Overview">
      <div class="stat"><b>${S.repos.length}</b><span>${ic('repo')}Repositories</span></div>
      <div class="stat"><b>${commitsN}</b><span>${ic('commit')}Commits</span></div>
      <div class="stat"><b>${openIssues}</b><span>${ic('issue')}Open issues</span></div>
      <div class="stat"><b>${stars}</b><span>${ic('star')}Stars</span></div></section>
    ${recent.length ? `<section><div class="sec-h"><h2>Recently opened</h2></div><div class="recent">${recent.map(r => `<a class="recent-i" href="${H.repo(r)}"><b>${ic(r.visibility === 'private' ? 'lock' : 'repo')}<span class="trunc">${esc(r.name)}</span></b><small>Opened ${ago(r.openedAt)}</small></a>`).join('')}</div></section>` : ''}
    <section><div class="sec-h"><h2>Repositories</h2><span class="muted small" id="rc-count"></span></div>
      <div class="filters" style="margin-bottom:12px">
        <div class="input-icon">${ic('search')}<input class="input" id="rf-q" type="search" placeholder="Find a repository…" aria-label="Find a repository" autocomplete="off"></div>
        <select class="select" id="rf-type" aria-label="Type"><option value="all">All</option><option value="public">Public</option><option value="private">Private</option><option value="starred">Starred</option></select>
        <select class="select" id="rf-sort" aria-label="Sort"><option value="updated">Last updated</option><option value="name">Name</option><option value="stars">Stars</option></select></div>
      <div id="repo-list" class="repo-grid"></div></section></div>`;
  if (!put(token, `<div class="dash">${side}${main}</div>`)) return;
  const draw = () => {
    const l = filterRepos(S.repos, $('#rf-q').value, $('#rf-type').value, $('#rf-sort').value);
    $('#rc-count').textContent = plural(l.length, 'repository', 'repositories');
    $('#repo-list').innerHTML = l.length ? l.map(r => repoCard(r)).join('') : `<div class="card" style="grid-column:1/-1"><div class="empty">${ic('repo', 'xl')}<h3>${S.repos.length ? 'No matching repositories' : 'No repositories yet'}</h3><p>${S.repos.length ? 'Try a different search or filter.' : 'Create your first repository, import one, or load the demo project.'}</p>${S.repos.length ? '' : `<div class="row" style="justify-content:center;flex-wrap:wrap"><a class="btn btn-primary" href="#/new">${ic('plus')}New repository</a><button class="btn" data-act="load-demo">${ic('sparkle')}Load demo repository</button></div>`}</div></div>`;
  };
  ['rf-q', 'rf-type', 'rf-sort'].forEach(id => $('#' + id).addEventListener('input', draw)); draw();
  if (!(await getSetting('onboarded', false))) welcomeDialog();
}
function welcomeDialog() {
  setSetting('onboarded', true);
  openModal({
    title: 'Welcome to CodeRepo Offline', icon: 'sparkle', dismissible: true,
    body: `<p style="margin-top:0;color:var(--text-2)">A GitHub-style repository manager that works <b>100% offline</b>. Commits, branches, issues and pull requests are simulated locally and saved in your browser — nothing is ever sent anywhere.</p>
      <p style="margin-bottom:0;color:var(--text-2)">Want a sample repository to explore? You can remove it any time from Settings.</p>`,
    actions: [{ label: 'Start empty', value: 'empty' }, { label: 'Load demo repository', kind: 'primary', icon: 'sparkle', value: 'demo' }]
  }).then(async v => { if (v === 'demo') await ACTIONS['load-demo'](); });
}
ACTIONS['load-demo'] = async () => {
  const r = await createDemoRepo(); toast('Demo repository loaded'); go(H.repo(r));
};
ACTIONS['card-menu'] = el => {
  const r = S.repos.find(x => x.id === el.dataset.id); if (!r) return;
  openMenu(el, { items: [
    { label: 'Open', icon: 'code', onClick: () => go(H.repo(r)) },
    { label: r.starred ? 'Unstar' : 'Star', icon: 'star', onClick: () => toggleStar(r) },
    { label: r.pinned ? 'Unpin from profile' : 'Pin to profile', icon: 'pin', onClick: async () => { if (!r.pinned && S.repos.filter(x => x.pinned).length >= 6) return toast('You can pin up to 6 repositories', 'err'); await saveRepo({ ...r, pinned: !r.pinned }); toast(r.pinned ? 'Unpinned' : 'Pinned to profile'); render(); } },
    { label: 'Download ZIP', icon: 'download', onClick: () => downloadRepoZip(r) },
    { divider: true },
    { label: 'Delete…', icon: 'trash', danger: true, onClick: () => deleteRepoFlow(r) }
  ] });
};
async function toggleStar(r) {
  const nr = { ...r, starred: !r.starred, stars: Math.max(0, (r.stars || 0) + (r.starred ? -1 : 1)) };
  await saveRepo(nr); if (nr.starred) await logActivity(nr, 'star', 'Starred ' + nr.name);
  toast(nr.starred ? `Starred ${nr.name}` : `Removed star from ${nr.name}`); render();
}
async function downloadRepoZip(r, branch) {
  toast('Preparing ZIP…', 'info', 1500);
  const blob = await repoToZip(r, branch || r.defaultBranch);
  downloadBlob(blob, `${r.name}-${(branch || r.defaultBranch).replace(/\//g, '-')}.zip`); toast('Repository ZIP downloaded');
}
async function deleteRepoFlow(r) {
  const ok = await confirmDialog({ title: 'Delete repository?', danger: true, confirmLabel: 'Delete repository', typeToConfirm: r.name, message: `This permanently deletes <b>${esc(r.name)}</b> with all of its files, commits, branches, issues and pull requests from this device. This cannot be undone.` });
  if (!ok) return;
  await deleteRepository(r); toast('Repository deleted'); go('#/');
}

/* ---------------- import ---------------- */
ACTIONS.import = () => importFlow();
function importFlow() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,.zip,application/json,application/zip';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      if (/\.zip$/i.test(f.name)) {
        const guess = f.name.replace(/\.zip$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'imported';
        const name = await askRepoName('Import ZIP as repository', guess); if (!name) return;
        const { repo, count, skipped } = await importZipAsRepo(f, name);
        toast(`Imported ${plural(count, 'file')}${skipped ? ` (${skipped} skipped)` : ''}`); go(H.repo(repo));
      } else {
        let json; try { json = JSON.parse(await f.text()); } catch (e) { throw new Error('That file is not valid JSON.'); }
        if (!json || json.app !== 'CodeRepo Offline') throw new Error('This file is not a CodeRepo Offline repository export.');
        if (json.bundle && Array.isArray(json.repos)) { const n = await importBundle(json); toast(`Imported ${plural(n, 'repository', 'repositories')}`); go('#/'); render(); return; }
        let name = json.repo.name; if (validateRepoName(name)) name = await askRepoName('Import repository', name + '-imported', 'A repository with this name already exists. Choose a new name.'); if (!name) return;
        const repo = await importRepoData(json, name); toast('Repository imported'); go(H.repo(repo));
      }
    } catch (e) { alertDialog('Import failed', esc(e.message), 'alert', 'danger'); }
  };
  inp.click();
}
function askRepoName(title, value, hint) {
  return openModal({
    title, body: `${hint ? `<p class="muted" style="margin-top:0">${esc(hint)}</p>` : ''}<div class="field" style="margin:0"><label for="rn-in">Repository name</label><input class="input" id="rn-in" value="${esc(value)}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Continue', kind: 'primary', onClick: ctx => { const i = ctx.$('#rn-in'), e = validateRepoName(i.value); if (e) { ctx.error(e, i); return false; } return i.value.trim(); } }]
  });
}

/* ---------------- new repository ---------------- */
async function viewNewRepo(token) {
  await loadRepos();
  const body = `<div class="page-narrow"><div class="page-h"><h1>Create a new repository</h1></div>
    <p class="muted" style="margin-top:-6px">A repository holds your project's files and their full commit history. It is stored only on this device.</p>
    <form id="nr-form" class="card"><div class="card-b">
      <div class="field"><label for="nr-name">Repository name <span class="red">*</span></label>
        <div class="row"><span class="badge" style="height:38px;padding:0 12px;font-size:13px">${esc(S.user.username)} /</span><input class="input" id="nr-name" placeholder="my-awesome-project" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="100" required></div>
        <div class="help" id="nr-help">Letters, numbers, <code>-</code>, <code>_</code> and <code>.</code> only.</div></div>
      <div class="field"><label for="nr-desc">Description <span class="muted">(optional)</span></label><input class="input" id="nr-desc" placeholder="Short description of this project" maxlength="300"></div>
      <div class="field"><span class="lbl">Visibility</span>
        <label class="radio-card">${ic('globe', 'lg')}<span class="grow"><b>Public</b><small>Listed as public in this app.</small></span><input type="radio" name="vis" value="public" checked></label>
        <label class="radio-card">${ic('lock', 'lg')}<span class="grow"><b>Private</b><small>Marked private. (Everything is local either way.)</small></span><input type="radio" name="vis" value="private"></label></div>
      <hr>
      <label class="check"><input type="checkbox" id="nr-readme" checked><span><b>Add a README file</b><small>Creates the first commit, so you can start browsing right away.</small></span></label>
      <div class="field" style="margin-top:8px"><label for="nr-ign">.gitignore template</label><select class="select" id="nr-ign"><option value="">None</option>${Object.keys(GITIGNORES).map(k => `<option>${esc(k)}</option>`).join('')}</select></div>
      <div class="field"><label for="nr-lic">License</label><select class="select" id="nr-lic"><option value="">None</option>${LICENSES.map(k => `<option>${esc(k)}</option>`).join('')}</select></div>
      <div class="notice">${ic('info')}<span>This is an <b>offline simulation</b>. Creating a repository here does not create anything on GitHub or any server.</span></div>
    </div><div class="modal-f" style="border-radius:0 0 var(--r) var(--r)"><a class="btn" href="#/">Cancel</a><button class="btn btn-success" type="submit" id="nr-go">${ic('plus')}Create repository</button></div></form></div>`;
  if (!put(token, body)) return;
  const name = $('#nr-name'), help = $('#nr-help');
  const check = () => { const e = name.value ? validateRepoName(name.value) : ''; name.classList.toggle('invalid', !!e); help.className = e ? 'err' : 'help'; help.textContent = e || (name.value ? 'Great — this name is available.' : 'Letters, numbers, - _ and . only.'); return !e && !!name.value.trim(); };
  name.addEventListener('input', debounce(check, 120)); name.focus({ preventScroll: true });
  $('#nr-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!check()) { name.focus(); if (!name.value.trim()) { help.className = 'err'; help.textContent = validateRepoName(''); name.classList.add('invalid'); } return; }
    const btn = $('#nr-go'); btn.disabled = true;
    try {
      const repo = await createRepository({ name: name.value, description: $('#nr-desc').value, visibility: $('input[name=vis]:checked').value, readme: $('#nr-readme').checked, gitignore: $('#nr-ign').value, license: $('#nr-lic').value });
      toast('Repository created successfully'); go(H.repo(repo));
    } catch (err) { btn.disabled = false; alertDialog('Could not create repository', esc(err.message), 'alert', 'danger'); }
  });
}

/* ====================================================================
   Repository pages: header, tabs, file browser, file viewer
   ==================================================================== */
let objUrls = [];
const revokeUrls = () => { objUrls.forEach(u => URL.revokeObjectURL(u)); objUrls = []; };
const mkUrl = (bytes, type) => { const u = URL.createObjectURL(new Blob([bytes], { type })); objUrls.push(u); return u; };
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (x) { throw new Error('Copy is not available in this browser.'); } ta.remove(); }
  toast('Copied to clipboard');
}
const fileSortKey = { v: 'name' };

const TABS = [['code', 'Code', 'code'], ['issues', 'Issues', 'issue'], ['pulls', 'Pull requests', 'pr'], ['actions', 'Actions', 'play'], ['projects', 'Projects', 'project'], ['wiki', 'Wiki', 'wiki'], ['security', 'Security', 'shield'], ['insights', 'Insights', 'graph'], ['settings', 'Settings', 'gear']];
async function repoShell(repo, active, inner, opts = {}) {
  const [issues, prs] = await Promise.all([DB.byRepo('issues', repo.id), DB.byRepo('pullRequests', repo.id)]);
  const cnt = { issues: issues.filter(i => i.state === 'open').length, pulls: prs.filter(p => p.state === 'open').length };
  const tabs = TABS.map(([k, l, i]) => `<a class="rtab ${k === active ? 'on' : ''}" href="${k === 'code' ? H.repo(repo) : H.sub(repo, k)}" ${k === active ? 'aria-current="page"' : ''}>${ic(i)}${l}${cnt[k] ? `<span class="counter">${cnt[k]}</span>` : ''}</a>`).join('');
  return `<header class="rh"><div class="rh-top"><div class="grow">
      <div class="rh-title">${ic('repo', 'lg')}<a class="own" href="#/">${esc(repo.owner)}</a><span class="muted">/</span><b>${esc(repo.name)}</b>
        <span class="badge">${ic(repo.visibility === 'private' ? 'lock' : 'globe')}${repo.visibility === 'private' ? 'Private' : 'Public'}</span>${repo.demo ? '<span class="badge blue">Demo</span>' : ''}</div>
      ${repo.description ? `<p class="rh-desc">${esc(repo.description)}</p>` : ''}</div>
    <div class="rh-actions">
      <button class="btn ${repo.watching ? 'on' : ''}" data-act="watch">${ic('eye')}${repo.watching ? 'Watching' : 'Watch'}</button>
      <button class="btn" data-act="fork" title="Make a local copy of this repository">${ic('fork')}Fork <span class="count">${repo.forks || 0}</span></button>
      <button class="btn ${repo.starred ? 'on' : ''}" data-act="star">${ic('star', repo.starred ? 'fill' : '')}${repo.starred ? 'Starred' : 'Star'} <span class="count">${repo.stars || 0}</span></button>
      <a class="btn btn-icon desk" href="${H.sub(repo, 'settings')}" aria-label="Repository settings" title="Repository settings">${ic('gear')}</a>
    </div></div>
    <nav class="rtabs" aria-label="Repository">${tabs}</nav></header>${inner}`;
}
ACTIONS.watch = async () => { const r = V.repo; await saveRepo({ ...r, watching: !r.watching }); toast(r.watching ? 'Stopped watching' : 'Watching this repository'); render(); };
ACTIONS.star = async () => toggleStar(V.repo);
ACTIONS.fork = async () => {
  const r = V.repo; let n = r.name + '-fork', i = 2; while (validateRepoName(n)) n = `${r.name}-fork-${i++}`;
  const name = await askRepoName('Fork repository', n, 'Creates an independent local copy with the full history.'); if (!name) return;
  toast('Forking…', 'info', 1200);
  const copy = await importRepoData(await exportRepoData(r), name);
  await saveRepo({ ...copy, stars: 0, starred: false, forks: 0, description: r.description, demo: false });
  await saveRepo({ ...S.repos.find(x => x.id === r.id), forks: (r.forks || 0) + 1 });
  toast('Forked into ' + name); go(H.repo(copy));
};

async function viewRepoRoute(token, s) {
  if (!S.repos.length) await loadRepos();
  const repo = repoByName(s[1]);
  if (!repo) return put(token, notFound('Repository'));
  V.repo = repo; revokeUrls();
  if (Date.now() - (repo.openedAt || 0) > 30000) { repo.openedAt = Date.now(); DB.put('repositories', repo); }
  const sub = s[2] || 'tree', rest = s.slice(3);
  switch (sub) {
    case 'tree': return viewTree(token, repo, rest);
    case 'blob': return viewBlob(token, repo, rest);
    case 'edit': return viewEditor(token, repo, rest, false);
    case 'new': return viewEditor(token, repo, rest, true);
    case 'upload': return viewUpload(token, repo, rest);
    case 'commits': return viewCommits(token, repo, rest);
    case 'commit': return viewCommit(token, repo, rest[0]);
    case 'branches': return viewBranches(token, repo);
    case 'issues': return rest[0] === 'new' ? viewIssueForm(token, repo) : rest[0] ? viewIssue(token, repo, +rest[0]) : viewIssues(token, repo);
    case 'pulls': return rest[0] === 'new' ? viewPRForm(token, repo) : rest[0] ? viewPR(token, repo, +rest[0]) : viewPRs(token, repo);
    case 'actions': case 'projects': case 'wiki': case 'security': return viewPlaceholder(token, repo, sub);
    case 'insights': return viewInsights(token, repo);
    case 'settings': return viewRepoSettings(token, repo);
    default: return put(token, notFound());
  }
}

/* ---------------- branch selector ---------------- */
async function branchButton(repo, branch, kind, path = '') {
  return `<button class="btn" data-act="branch-menu" data-kind="${kind}" data-path="${esc(path)}" aria-haspopup="menu">${ic('branch')}<span class="trunc" style="max-width:150px">${esc(branch)}</span>${ic('chev-down', 'chev')}</button>`;
}
ACTIONS['branch-menu'] = async el => {
  const repo = V.repo, brs = await getBranches(repo.id), kind = el.dataset.kind, p = el.dataset.path || '';
  openMenu(el, { title: 'Switch branch', search: true, searchPlaceholder: 'Find a branch…', empty: 'No branches match',
    items: [...brs.map(b => ({ label: b.name, icon: 'branch', selected: b.name === V.branch, hint: b.name === repo.defaultBranch ? 'default' : '', onClick: () => {
      const dest = kind === 'commits' ? H.commits(repo, b.name) : kind === 'blob' ? H.tree(repo, b.name, dirName(p)) : kind === 'edit' ? H.tree(repo, b.name, dirName(p)) : kind === 'upload' ? H.upload(repo, b.name, p) : kind === 'new' ? H.newFile(repo, b.name, p) : H.tree(repo, b.name, p);
      go(dest);
    } })), { divider: true }, { label: 'View all branches', icon: 'list', onClick: () => go(H.sub(repo, 'branches')) }, { label: 'Create new branch…', icon: 'plus', onClick: () => createBranchFlow(V.branch) }] });
};
async function createBranchFlow(from) {
  const repo = V.repo, brs = await getBranches(repo.id);
  const name = await openModal({
    title: 'Create a branch', icon: 'branch',
    body: `<div class="field"><label for="cb-n">New branch name</label><input class="input" id="cb-n" placeholder="feature/my-change" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
      <div class="field" style="margin:0"><label for="cb-f">Create from</label><select class="select" id="cb-f">${brs.map(b => `<option ${b.name === from ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select><div class="help">The new branch starts at the latest commit of the selected branch.</div></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Create branch', kind: 'success', onClick: async ctx => { const i = ctx.$('#cb-n'); try { const b = await createBranch(repo, i.value, ctx.$('#cb-f').value); return b.name; } catch (e) { ctx.error(e.message, i); return false; } } }]
  });
  if (name) { toast('Branch created'); go(H.tree(repo, name, '')); }
}
ACTIONS['create-branch'] = () => createBranchFlow(V.branch || V.repo.defaultBranch);

/* ---------------- file browser ---------------- */
async function viewTree(token, repo, rest) {
  const { branch, path, branches, missing } = await resolveBranchPath(repo, rest);
  V.branch = branch; V.dir = path;
  if (missing) return put(token, await repoShell(repo, 'code', `<div class="card"><div class="empty">${ic('branch', 'xl')}<h3>Branch “${esc(branch)}” not found</h3><p>It may have been renamed or deleted.</p><a class="btn btn-primary" href="${H.tree(repo, repo.defaultBranch)}">Go to ${esc(repo.defaultBranch)}</a></div></div>`));
  const head = await headOf(repo.id, branch), tree = head.tree;
  if (tree[path]) return go(H.blob(repo, branch, path));
  if (path && !dirExists(tree, path)) return put(token, await repoShell(repo, 'code', `<div class="card"><div class="empty">${ic('folder', 'xl')}<h3>Folder not found</h3><p>“${esc(path)}” does not exist on ${esc(branch)}.</p><a class="btn btn-primary" href="${H.tree(repo, branch)}">Back to root</a></div></div>`));
  const toolbar = `<div class="toolbar">${await branchButton(repo, branch, 'tree', path)}
      <a class="btn btn-ghost btn-sm" href="${H.sub(repo, 'branches')}">${ic('branch')}<b>${branches.length}</b> ${branches.length === 1 ? 'branch' : 'branches'}</a>
      ${head.commit ? `<a class="btn btn-ghost btn-sm" href="${H.commits(repo, branch)}">${ic('history')}History</a>` : ''}
      <span class="spacer"></span>
      <div class="input-icon fs-search">${ic('search')}<input class="input" id="fs-q" type="search" placeholder="Go to file…" aria-label="Go to file" autocomplete="off" style="height:34px"></div>
      <button class="btn btn-icon" data-act="sort-menu" aria-label="Sort files">${ic('sort')}</button>
      <button class="btn" data-act="add-menu">${ic('plus')}<span>Add file</span>${ic('chev-down', 'chev')}</button>
      <button class="btn btn-primary" data-act="code-menu">${ic('code')}<span>Code</span>${ic('chev-down', 'chev')}</button></div>`;
  let body;
  if (!head.commit) {
    body = `<div class="card"><div class="empty">${ic('file-plus', 'xl')}<h3>This repository is empty</h3><p>Start by creating a file or uploading your project. Each change is saved as a commit.</p>
      <div class="row wrap" style="justify-content:center"><a class="btn btn-success" href="${H.newFile(repo, branch)}">${ic('file-plus')}Create new file</a><a class="btn" href="${H.upload(repo, branch)}">${ic('upload')}Upload files</a></div></div></div>`;
  } else {
    const { dirs, files } = listDir(tree, path);
    const key = fileSortKey.v, cmp = { name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }), modified: (a, b) => b.e.mod - a.e.mod, size: (a, b) => (b.e.size || 0) - (a.e.size || 0) }[key];
    const rows = [...dirs.sort(cmp), ...files.sort(cmp)];
    const latest = [...rows].sort((a, b) => b.e.mod - a.e.mod)[0];
    const lastC = latest ? await getCommit(repo.id, latest.e.cid) : head.commit;
    const parent = path ? `<div class="frow"><span></span><div class="fn"><a href="${H.tree(repo, branch, dirName(path))}">..</a></div><span></span><span></span><span></span><span></span></div>` : '';
    body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="${H.tree(repo, branch)}">${esc(repo.name)}</a>${path.split('/').filter(Boolean).map((seg, i, a) => `<span class="sep">/</span>${i === a.length - 1 ? `<b>${esc(seg)}</b>` : `<a href="${H.tree(repo, branch, a.slice(0, i + 1).join('/'))}">${esc(seg)}</a>`}`).join('')}</nav>
      <div id="fs-results" class="card" hidden></div>
      <div class="card ftable" id="ftable"><div class="fhead">${S.user ? `<span class="avatar sm">${esc(initials(head.commit.author.name))}</span>` : ''}<span class="msg"><b>${esc(head.commit.author.name)}</b> ${esc((lastC || head.commit).message.split('\n')[0])}</span><span class="hash">${short((lastC || head.commit).id)}</span><a class="hist" href="${H.commits(repo, branch)}">${ic('history')}<span class="desk-i">${ago(head.commit.date)}</span></a></div>
      ${parent}${rows.map(r => `<div class="frow"><span>${fileIcon(r.name, r.dir)}</span>
        <div class="fn"><a href="${r.dir ? H.tree(repo, branch, r.path) : H.blob(repo, branch, r.path)}">${esc(r.name)}</a><small>${r.dir ? plural(r.count, 'file') + ' · ' : fmtSize(r.e.size) + ' · '}${esc((r.e.msg || '').split('\n')[0])}</small></div>
        <span class="fm">${esc((r.e.msg || '').split('\n')[0])}</span><span class="fsz">${r.dir ? '' : fmtSize(r.e.size)}</span><span class="ft">${ago(r.e.mod)}</span>
        <button class="kebab" data-act="file-menu" data-path="${esc(r.path)}" data-dir="${r.dir ? 1 : 0}" aria-label="Actions for ${esc(r.name)}">${ic('more', 'lg')}</button></div>`).join('')}
      ${!rows.length ? `<div class="empty" style="padding:24px">This folder is empty.</div>` : ''}</div>`;
    const rd = [...files].find(f => /^readme(\.md|\.markdown|\.txt)?$/i.test(f.name));
    if (rd) {
      const b = await getBlob(repo.id, rd.e.sha), txt = blobText(b), isMd = /\.m(ark)?d(own)?$/i.test(rd.name);
      let inner;
      if (isMd) inner = `<div class="md">${await renderMd(txt, repo, branch, tree, path)}</div>`; else inner = `<pre style="white-space:pre-wrap;margin:0;font-size:13px;overflow-wrap:anywhere">${esc(txt)}</pre>`;
      body += `<div class="card" style="margin-top:16px"><div class="card-h">${ic('wiki')}<h3>${esc(rd.name)}</h3><span class="grow"></span><a class="btn btn-sm btn-ghost" href="${H.edit(repo, branch, rd.path)}" aria-label="Edit README">${ic('edit')}</a></div><div class="card-b">${inner}</div></div>`;
    }
  }
  const langs = computeLangs(tree);
  const side = `<aside class="rside"><div class="card"><div class="card-b about"><h3>About</h3>
      <p style="margin:0 0 10px;color:var(--text-2);overflow-wrap:anywhere">${repo.description ? esc(repo.description) : '<span class="muted">No description provided.</span>'}</p>
      <div class="a-row">${ic('star')}${repo.stars || 0} stars</div><div class="a-row">${ic('eye')}${repo.watching ? 1 : 0} watching</div><div class="a-row">${ic('fork')}${repo.forks || 0} forks</div>
      ${tree['LICENSE'] || repo.license ? `<div class="a-row">${ic('wiki')}${esc(repo.license || 'License file')}</div>` : ''}
      <div class="a-row">${ic('clock')}Created ${fmtDate(repo.createdAt)}</div>
      <div class="a-row">${ic('database')}Stored locally in IndexedDB</div></div></div>
    ${langs.length ? `<div class="card"><div class="card-b about"><h3>Languages</h3><div class="langbar">${langs.map(l => `<i style="width:${l.pct}%;background:${l.color}" title="${l.name} ${l.pct.toFixed(1)}%"></i>`).join('')}</div><div class="langlist">${langs.map(l => `<span><i class="lang-dot" style="background:${l.color}"></i><b>${l.name}</b> ${l.pct.toFixed(1)}%</span>`).join('')}</div></div></div>` : ''}</aside>`;
  if (!put(token, await repoShell(repo, 'code', `<div class="rlayout with-side"><div class="stack" style="min-width:0">${toolbar}${body}</div>${side}</div>`))) return;
  // "Go to file" search across the whole branch
  const q = $('#fs-q'), res = $('#fs-results');
  if (q) q.addEventListener('input', debounce(() => {
    const t = q.value.trim().toLowerCase(); if (!t) { res.hidden = true; $('#ftable') && ($('#ftable').hidden = false); return; }
    const m = Object.keys(tree).filter(p => p.toLowerCase().includes(t)).slice(0, 60);
    res.hidden = false; $('#ftable') && ($('#ftable').hidden = true);
    res.innerHTML = m.length ? m.map(p => `<div class="frow" style="grid-template-columns:22px minmax(0,1fr) auto"><span>${fileIcon(p)}</span><div class="fn"><a href="${H.blob(repo, branch, p)}">${esc(p)}</a></div><span class="ft">${fmtSize(tree[p].size)}</span></div>`).join('') : `<div class="empty" style="padding:22px">No files match “${esc(t)}”.</div>`;
  }, 100));
}
async function renderMd(txt, repo, branch, tree, dir) {
  const resolve = u => normPath((u.startsWith('/') ? '' : dir ? dir + '/' : '') + u.replace(/^\.\//, ''));
  const imgs = {};
  for (const m of txt.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) { const p = resolve(m[1]); if (tree[p] && !imgs[m[1]]) { const b = await getBlob(repo.id, tree[p].sha); if (b) imgs[m[1]] = mkUrl(blobBytes(b), mimeOf(p)); } }
  return renderMarkdown(txt, { img: u => imgs[u] || null, link: u => { const p = resolve(u.split('#')[0]); return tree[p] ? H.blob(repo, branch, p) : dirExists(tree, p) ? H.tree(repo, branch, p) : null; } });
}
ACTIONS['sort-menu'] = el => openMenu(el, { title: 'Sort by', items: [['name', 'Name'], ['modified', 'Last modified'], ['size', 'Size']].map(([k, l]) => ({ label: l, selected: fileSortKey.v === k, onClick: () => { fileSortKey.v = k; render(); } })) });
ACTIONS['add-menu'] = el => openMenu(el, { items: [
  { label: 'Create new file', icon: 'file-plus', onClick: () => go(H.newFile(V.repo, V.branch, V.dir)) },
  { label: 'Upload files', icon: 'upload', onClick: () => go(H.upload(V.repo, V.branch, V.dir)) },
  { label: 'Create new folder', icon: 'folder-plus', onClick: () => newFolderFlow() }] });
ACTIONS['code-menu'] = el => openMenu(el, { items: [
  { label: 'Download repository as ZIP', icon: 'zip', onClick: () => downloadRepoZip(V.repo, V.branch) },
  { label: 'Export repository data (.json)', icon: 'database', onClick: () => exportJson(V.repo) },
  { divider: true },
  { label: 'Copy local repository path', icon: 'copy', onClick: () => copyText(`local://${V.repo.owner}/${V.repo.name}.git`) },
  { label: 'Open settings', icon: 'gear', onClick: () => go(H.sub(V.repo, 'settings')) }] });
async function exportJson(repo) {
  const data = await exportRepoData(repo);
  downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${repo.name}.coderepo.json`); toast('Repository data exported');
}
async function newFolderFlow() {
  const repo = V.repo, branch = V.branch, base = V.dir;
  const r = await openModal({
    title: 'Create new folder', icon: 'folder-plus',
    body: `<div class="field"><label for="nf-n">Folder name</label><input class="input" id="nf-n" placeholder="src/components" autocapitalize="off" autocomplete="off" spellcheck="false"><div class="help">Created inside <b>/${esc(base)}</b>. Folders are saved with a <code>.gitkeep</code> file.</div></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Create folder', kind: 'success', onClick: async ctx => {
      const i = ctx.$('#nf-n'), n = normPath((base ? base + '/' : '') + i.value);
      if (!i.value.trim() || !n) { ctx.error('Please enter a valid folder name.', i); return false; }
      try { await commitChanges(repo, branch, 'Create folder ' + n, [{ type: 'put', path: n + '/.gitkeep', data: '', overwrite: false }]); return n; } catch (e) { ctx.error(e.message, i); return false; }
    } }]
  });
  if (r) { toast('Folder created'); render(); }
}
ACTIONS['file-menu'] = el => {
  const repo = V.repo, branch = V.branch, p = el.dataset.path, isDir = el.dataset.dir === '1';
  openMenu(el, { title: baseName(p), items: [
    { label: 'Open', icon: isDir ? 'folder' : 'code', onClick: () => go(isDir ? H.tree(repo, branch, p) : H.blob(repo, branch, p)) },
    ...(isDir ? [] : [{ label: 'Edit', icon: 'edit', onClick: () => go(H.edit(repo, branch, p)) }]),
    { label: 'Rename / move…', icon: 'edit', onClick: () => renameFlow(p, isDir) },
    { label: isDir ? 'Download folder as ZIP' : 'Download', icon: 'download', onClick: () => isDir ? downloadFolder(p) : downloadFile(repo, branch, p) },
    { divider: true },
    { label: isDir ? 'Delete folder…' : 'Delete file…', icon: 'trash', danger: true, onClick: () => deleteFlow(p, isDir) }] });
};
async function downloadFile(repo, branch, p) {
  const h = await headOf(repo.id, branch); const e = h.tree[p]; if (!e) throw new Error('File not found.');
  downloadBlob(new Blob([blobBytes(await getBlob(repo.id, e.sha))], { type: mimeOf(p) }), baseName(p)); toast('File downloaded');
}
async function downloadFolder(dir) {
  const repo = V.repo, h = await headOf(repo.id, V.branch), entries = [];
  for (const p of Object.keys(h.tree).filter(k => k.startsWith(dir + '/'))) entries.push({ path: baseName(dir) + p.slice(dir.length), data: blobBytes(await getBlob(repo.id, h.tree[p].sha)), mtime: h.tree[p].mod });
  downloadBlob(await makeZip(entries), baseName(dir) + '.zip'); toast('Folder downloaded');
}
async function renameFlow(p, isDir) {
  const repo = V.repo, branch = V.branch;
  const ok = await openModal({
    title: isDir ? 'Rename folder' : 'Rename file', icon: 'edit',
    body: `<div class="field"><label for="rn-p">New path</label><input class="input mono" id="rn-p" value="${esc(p)}" autocapitalize="off" autocomplete="off" spellcheck="false"><div class="help">Use “/” to move it into another folder.</div></div>
      <div class="field" style="margin:0"><label for="rn-m">Commit message</label><input class="input" id="rn-m" value="Rename ${esc(baseName(p))}"></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Commit changes', kind: 'success', onClick: async ctx => {
      const i = ctx.$('#rn-p'), to = normPath(i.value);
      if (!to) { ctx.error('That is not a valid path.', i); return false; }
      if (to === p) { ctx.error('The new path is the same as the old one.', i); return false; }
      try { await commitChanges(repo, branch, ctx.$('#rn-m').value, [{ type: isDir ? 'renameDir' : 'rename', from: p, to }]); return true; } catch (e) { ctx.error(e.message); return false; }
    } }]
  });
  if (ok) { toast('Changes saved'); if (!isDir && location.hash.includes('/blob/')) go(H.blob(repo, branch, normPath(p))); else render(); }
}
async function deleteFlow(p, isDir) {
  const repo = V.repo, branch = V.branch;
  const ok = await openModal({
    title: isDir ? 'Delete folder?' : 'Delete file?', icon: 'alert', tone: 'danger',
    body: `<p style="margin-top:0;color:var(--text-2);overflow-wrap:anywhere">${isDir ? 'Everything inside' : ''} <b>${esc(p)}</b> will be removed from <b>${esc(branch)}</b>. The history keeps earlier versions.</p>
      <div class="field" style="margin:0"><label for="dl-m">Commit message</label><input class="input" id="dl-m" value="Delete ${esc(baseName(p))}"></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Delete & commit', kind: 'solid-danger', onClick: async ctx => { try { await commitChanges(repo, branch, ctx.$('#dl-m').value, [{ type: isDir ? 'delDir' : 'del', path: p }]); return true; } catch (e) { ctx.error(e.message); return false; } } }]
  });
  if (ok) { toast(isDir ? 'Folder deleted' : 'File deleted'); go(H.tree(repo, branch, dirName(p))); }
}

/* ---------------- file viewer ---------------- */
function parseCsv(t) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
async function inlineHtml(html, repo, tree, dir) {
  const find = u => { const p = normPath((dir ? dir + '/' : '') + u); return tree[p] ? tree[p] : null; };
  const re = /<link\b[^>]*href=["']([^"']+)["'][^>]*>|<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi; let out = '', last = 0, m;
  while ((m = re.exec(html))) {
    const u = m[1] || m[2]; out += html.slice(last, m.index); last = m.index + m[0].length;
    const e = !/^(https?:)?\/\//i.test(u) && find(u);
    if (m[1] && !/stylesheet/i.test(m[0])) { out += m[0]; continue; }
    if (!e) { out += m[0]; continue; }
    const t = blobText(await getBlob(repo.id, e.sha));
    out += m[1] ? `<style>${t}</style>` : `<script>${t.replace(/<\/script/gi, '<\\/script')}</script>`;
  }
  return out + html.slice(last);
}
async function viewBlob(token, repo, rest) {
  const { branch, path, missing } = await resolveBranchPath(repo, rest);
  V.branch = branch; V.dir = dirName(path);
  const head = missing ? null : await headOf(repo.id, branch), e = head && head.tree[path];
  if (!e) return put(token, await repoShell(repo, 'code', `<div class="card"><div class="empty">${ic('file', 'xl')}<h3>File not found</h3><p>“${esc(path)}” does not exist on <b>${esc(branch)}</b>. It may have been moved, renamed or deleted.</p><a class="btn btn-primary" href="${H.tree(repo, missing ? repo.defaultBranch : branch, dirName(path))}">Back to folder</a></div></div>`));
  const blob = await getBlob(repo.id, e.sha); if (!blob) throw new Error('This file’s data is missing from local storage.');
  const name = baseName(path), ext = extOf(path), view = parseHash().q.get('v');
  const isMd = /^(md|markdown)$/.test(ext), isSvg = ext === 'svg', isCsv = ext === 'csv', isHtml = /^html?$/.test(ext), isImg = IMG_EXT.has(ext);
  const text = blob.binary ? '' : blob.content, previewable = isMd || isSvg || isCsv || isHtml;
  const mode = previewable ? (view || (isMd || isCsv ? 'preview' : 'code')) : 'code';
  const lines = blob.binary ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  const crumbs = `<nav class="crumbs"><a href="${H.tree(repo, branch)}">${esc(repo.name)}</a>${path.split('/').map((s, i, a) => `<span class="sep">/</span>${i === a.length - 1 ? `<b>${esc(s)}</b>` : `<a href="${H.tree(repo, branch, a.slice(0, i + 1).join('/'))}">${esc(s)}</a>`}`).join('')}</nav>`;
  let content = '';
  if (isImg || (isSvg && mode === 'preview')) content = `<div class="preview-pad"><img class="preview-img" alt="${esc(name)}" src="${mkUrl(blobBytes(blob), mimeOf(path))}"></div>`;
  else if (blob.binary) content = `<div class="empty">${ic('file', 'xl')}<h3>Binary file</h3><p>${fmtSize(blob.size)} — this file type can’t be shown here.</p><button class="btn btn-primary" data-act="dl-current">${ic('download')}Download</button></div>`;
  else if (mode === 'preview' && isMd) content = `<div class="preview-pad md">${await renderMd(text, repo, branch, head.tree, dirName(path))}</div>`;
  else if (mode === 'preview' && isCsv) { const rows = parseCsv(text).slice(0, 1000); content = `<div class="csv-wrap"><table class="tbl"><thead><tr>${(rows[0] || []).map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
  else if (mode === 'preview' && isHtml) content = `<div class="notice warn" style="margin:12px">${ic('info')}<span>Sandboxed preview of your own page. Scripts run in an isolated frame; linked local CSS/JS are inlined.</span></div><iframe id="html-prev" title="Preview of ${esc(name)}" sandbox="allow-scripts allow-forms allow-modals" style="width:100%;height:min(70dvh,640px);border:0;background:#fff;display:block"></iframe>`;
  else {
    const all = highlightLines(text, hlOf(path)), L = all.length > lines ? all.slice(0, lines) : all, cut = L.length > 4000;
    content = `<div class="code-scroll" id="code-scroll"><table class="code" role="presentation">${(cut ? L.slice(0, 4000) : L).map((l, i) => `<tr id="L${i + 1}"><td class="ln">${i + 1}</td><td class="lc">${l || ' '}</td></tr>`).join('')}</table></div>${cut ? `<div class="notice warn" style="margin:10px">${ic('info')}<span>Showing the first 4,000 of ${L.length} lines. Download the file to see everything.</span></div>` : ''}`;
  }
  const tgl = previewable ? `<div class="seg" role="tablist"><button class="${mode === 'preview' ? 'on' : ''}" data-act="view-mode" data-v="preview">${isHtml ? 'Preview' : isSvg ? 'Image' : isCsv ? 'Table' : 'Preview'}</button><button class="${mode === 'code' ? 'on' : ''}" data-act="view-mode" data-v="code">Code</button></div>` : '';
  const html = `${await branchButton(repo, branch, 'blob', path).then(b => `<div class="toolbar">${b}<span class="spacer"></span></div>`)}${crumbs}
    <div class="card code-box"><div class="code-h"><span class="trunc bold" style="max-width:100%">${fileIcon(name)} ${esc(name)}</span>${tgl}<span class="meta">${blob.binary ? '' : plural(lines, 'line') + ' · '}${fmtSize(blob.size)}</span>
      <div class="acts">${!blob.binary && mode === 'code' ? `<button class="btn btn-sm btn-icon" data-act="wrap" aria-label="Toggle word wrap" title="Word wrap">${ic('wrap')}</button>` : ''}
      ${!blob.binary ? `<button class="btn btn-sm" data-act="copy-file" aria-label="Copy file contents">${ic('copy')}<span class="bl">Copy</span></button>` : ''}<button class="btn btn-sm" data-act="dl-current" aria-label="Download file">${ic('download')}<span class="bl">Download</span></button>
      ${!blob.binary ? `<a class="btn btn-sm btn-primary" href="${H.edit(repo, branch, path)}">${ic('edit')}Edit</a>` : ''}
      <button class="btn btn-sm btn-icon" data-act="file-menu" data-path="${esc(path)}" data-dir="0" aria-label="More">${ic('more')}</button></div></div>${content}</div>
    <p class="muted small" style="margin-top:10px">Last changed ${ago(e.mod)} · <a href="${H.commit(repo, e.cid)}">${short(e.cid)}</a> ${esc((e.msg || '').split('\n')[0])} · <a href="${H.commits(repo, branch)}?path=${enc1(path)}">File history</a></p>`;
  if (!put(token, await repoShell(repo, 'code', html))) return;
  V.file = { repo, branch, path, text, blob };
  const fr = $('#html-prev'); if (fr) fr.srcdoc = await inlineHtml(text, repo, head.tree, dirName(path));
  const hash = location.hash.match(/#L(\d+)/); if (hash) $('#L' + hash[1])?.scrollIntoView({ block: 'center' });
}
ACTIONS['view-mode'] = el => { const q = location.hash.split('?')[0]; go(`${q}?v=${el.dataset.v}`); };
ACTIONS.wrap = () => $('#code-scroll')?.classList.toggle('wrap');
ACTIONS['copy-file'] = () => copyText(V.file.text);
ACTIONS['dl-current'] = () => downloadFile(V.file.repo, V.file.branch, V.file.path);

/* ====================================================================
   Editor, upload, commit history, branches
   ==================================================================== */
let dirtyGuard = false;
window.addEventListener('beforeunload', e => { if (dirtyGuard) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('hashchange', () => { dirtyGuard = false; });

async function viewEditor(token, repo, rest, isNew) {
  const { branch, path, missing } = await resolveBranchPath(repo, rest);
  V.branch = branch; V.dir = isNew ? path : dirName(path);
  const head = missing ? null : await headOf(repo.id, branch);
  if (!head) return put(token, await repoShell(repo, 'code', `<div class="card"><div class="empty">${ic('branch', 'xl')}<h3>Branch not found</h3><a class="btn btn-primary" href="${H.tree(repo, repo.defaultBranch)}">Go to ${esc(repo.defaultBranch)}</a></div></div>`));
  let text = '', baseSha = null, filePath = path;
  if (!isNew) {
    const e = head.tree[path];
    if (!e) return put(token, await repoShell(repo, 'code', `<div class="card"><div class="empty">${ic('file', 'xl')}<h3>File not found</h3><p>“${esc(path)}” does not exist on ${esc(branch)}.</p><a class="btn btn-primary" href="${H.tree(repo, branch, dirName(path))}">Back</a></div></div>`));
    const b = await getBlob(repo.id, e.sha);
    if (!b || b.binary) return put(token, await repoShell(repo, 'code', `<div class="card"><div class="empty">${ic('file', 'xl')}<h3>Binary files can’t be edited</h3><p>Upload a replacement file instead.</p><a class="btn btn-primary" href="${H.upload(repo, branch, dirName(path))}">Upload files</a></div></div>`));
    text = b.content; baseSha = e.sha;
  }
  const prefix = isNew && path ? path + '/' : '';
  const pre = `<div class="ed-head"><div class="ed-path">${ic(isNew ? 'file-plus' : 'edit', 'lg')}<a href="${H.tree(repo, branch)}" class="bold">${esc(repo.name)}</a><span class="muted">/</span>
      ${isNew ? `${prefix ? `<span class="mono muted">${esc(prefix)}</span>` : ''}<input class="input" id="ed-name" placeholder="name-your-file.js" autocapitalize="off" autocomplete="off" spellcheck="false" aria-label="File name">` : `<input class="input" id="ed-name" value="${esc(path)}" autocapitalize="off" autocomplete="off" spellcheck="false" aria-label="File path">`}
      <span class="badge">${ic('branch')}${esc(branch)}</span></div></div>`;
  const editor = `<div class="card ed" id="ed"><div class="ed-bar">
      <button class="btn btn-sm" data-act="ed-find">${ic('search')}<span>Find</span></button>
      <button class="btn btn-sm" data-act="ed-wrap" aria-pressed="false">${ic('wrap')}<span>Wrap</span></button>
      <button class="btn btn-sm" data-act="ed-indent">${ic('chev-right')}<span>Tab: <b id="ed-tab">2</b></span></button>
      <span class="spacer"></span><span class="muted small" id="ed-state"></span></div>
    <div class="ed-find" id="ed-findbar"><input class="input" id="f-q" placeholder="Find" aria-label="Find text" autocomplete="off"><input class="input" id="f-r" placeholder="Replace with" aria-label="Replace with" autocomplete="off"><span class="cnt" id="f-c"></span>
      <button class="btn btn-sm btn-icon" data-act="f-prev" aria-label="Previous match">${ic('chev-left')}</button><button class="btn btn-sm btn-icon" data-act="f-next" aria-label="Next match">${ic('chev-right')}</button>
      <button class="btn btn-sm" data-act="f-rep">Replace</button><button class="btn btn-sm" data-act="f-all">Replace all</button><button class="btn btn-sm" data-act="f-case" aria-pressed="false" title="Match case">Aa</button><button class="btn btn-sm btn-icon btn-ghost" data-act="ed-find" aria-label="Close find">${ic('x')}</button></div>
    <div class="ed-scroll" id="ed-scroll"><div class="ed-inner"><div class="ed-gutter" id="ed-gut" aria-hidden="true">1</div><div class="ed-code"><pre class="ed-hl" id="ed-hl" aria-hidden="true"></pre><textarea class="ed-ta" id="ed-ta" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="Code editor" wrap="off"></textarea></div></div></div>
    <div class="ed-foot"><span id="ed-pos">Ln 1, Col 1</span><span id="ed-len"></span><span>UTF-8</span><span>Esc then Tab leaves the editor</span></div></div>`;
  const commit = `<div class="card commit-box"><b>${ic('commit')} Commit changes</b>
      <div class="field" style="margin:0"><label for="c-msg">Commit message</label><input class="input" id="c-msg" maxlength="200" value="${isNew ? 'Create new file' : 'Update ' + esc(baseName(path))}" autocomplete="off"><div class="err" id="c-err" hidden></div></div>
      <div class="notice">${ic('branch')}<span>Commit directly to the <b>${esc(branch)}</b> branch.</span></div>
      <div class="row wrap end"><button class="btn" data-act="ed-cancel">Cancel</button><button class="btn btn-success" data-act="ed-commit" id="ed-save">${ic('save')}Commit changes</button></div></div>`;
  if (!put(token, await repoShell(repo, 'code', pre + editor + commit))) return;
  const ta = $('#ed-ta'), hl = $('#ed-hl'), gut = $('#ed-gut'), ed = $('#ed'), scroll = $('#ed-scroll'), nameIn = $('#ed-name');
  const E = { repo, branch, isNew, path, baseSha, tab: '  ', initial: text, matchCase: false, trap: true };
  V.ed = E; ta.value = text;
  const hlOf2 = () => hlOf(nameIn.value || path || 'x.txt');
  const paint = () => {
    const t = ta.value; hl.innerHTML = highlightLines(t, hlOf2()).join('\n') + '\n';
    const n = t.split('\n').length; gut.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
    $('#ed-len').textContent = `${plural(n, 'line')} · ${fmtSize(enc.encode(t).length)}`;
    const dirty = t !== E.initial || (!isNew && nameIn.value !== path); dirtyGuard = dirty;
    $('#ed-state').textContent = dirty ? '● Unsaved changes' : (isNew ? '' : 'No changes');
  };
  const paintSoon = debounce(paint, ta.value.length > 100000 ? 250 : 25);
  const pos = () => { const s = ta.selectionStart, b = ta.value.slice(0, s).split('\n'); $('#ed-pos').textContent = `Ln ${b.length}, Col ${b[b.length - 1].length + 1}`; };
  const insert = (str) => { ta.focus(); if (!document.execCommand('insertText', false, str)) ta.setRangeText(str, ta.selectionStart, ta.selectionEnd, 'end'); };
  ta.addEventListener('input', () => { E.trap = true; paintSoon(); pos(); });
  ['keyup', 'click', 'select', 'focus'].forEach(ev => ta.addEventListener(ev, pos));
  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape') { E.trap = false; return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); ACTIONS['ed-commit'](); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); ACTIONS['ed-find'](true); return; }
    const v = ta.value, s = ta.selectionStart, en = ta.selectionEnd;
    if (e.key === 'Tab' && E.trap && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      if (s !== en && v.slice(s, en).includes('\n') || e.shiftKey) {            // (un)indent whole lines
        const blockEnd = en > s && v[en - 1] === '\n' ? en - 1 : en, seg = v.slice(ls, blockEnd).split('\n');
        const out = seg.map(l => e.shiftKey ? l.replace(new RegExp('^( {1,' + E.tab.length + '}|\\t)'), '') : E.tab + l).join('\n');
        ta.focus(); ta.setSelectionRange(ls, blockEnd);
        if (!document.execCommand('insertText', false, out)) ta.setRangeText(out, ls, blockEnd, 'end');
        ta.setSelectionRange(e.shiftKey ? Math.max(ls, s - (seg[0].length - seg[0].replace(/^( {1,4}|\t)/, '').length)) : s + E.tab.length, ls + out.length);
      } else insert(E.tab);
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && s === en) {  // keep indentation
      const line = v.slice(v.lastIndexOf('\n', s - 1) + 1, s), ind = line.match(/^[ \t]*/)[0], extra = /[{(\[:]\s*$/.test(line) ? E.tab : '';
      if (ind || extra) { e.preventDefault(); insert('\n' + ind + extra); }
    }
  });
  nameIn.addEventListener('input', () => { nameIn.classList.remove('invalid'); paintSoon(); });
  paint(); pos();
  if (isNew) nameIn.focus({ preventScroll: true });
}
const edFind = () => { const E = V.ed, ta = $('#ed-ta'), q = $('#f-q').value; if (!q) return []; const t = ta.value, hay = E.matchCase ? t : t.toLowerCase(), nd = E.matchCase ? q : q.toLowerCase(), out = []; let i = 0; while ((i = hay.indexOf(nd, i)) >= 0) { out.push(i); i += Math.max(1, nd.length); } return out; };
function edGo(dir) {
  const ta = $('#ed-ta'), m = edFind(), q = $('#f-q').value; $('#f-c').textContent = q ? plural(m.length, 'match', 'matches') : '';
  if (!m.length) return;
  const cur = dir > 0 ? m.find(i => i >= ta.selectionEnd) ?? m[0] : [...m].reverse().find(i => i < ta.selectionStart) ?? m[m.length - 1];
  ta.focus({ preventScroll: true }); ta.setSelectionRange(cur, cur + q.length);
  const line = ta.value.slice(0, cur).split('\n').length - 1, sc = $('#ed-scroll'); sc.scrollTop = Math.max(0, line * 20 - sc.clientHeight / 2);
}
ACTIONS['ed-find'] = open => {
  const bar = $('#ed-findbar'); const on = open === true ? true : !bar.classList.contains('on');
  bar.classList.toggle('on', on); if (on) { const ta = $('#ed-ta'), sel = ta.value.slice(ta.selectionStart, ta.selectionEnd); if (sel && !sel.includes('\n')) $('#f-q').value = sel; $('#f-q').focus(); edGo(0); }
};
ACTIONS['f-next'] = () => edGo(1); ACTIONS['f-prev'] = () => edGo(-1);
ACTIONS['f-case'] = el => { V.ed.matchCase = !V.ed.matchCase; el.setAttribute('aria-pressed', V.ed.matchCase); el.classList.toggle('btn-primary', V.ed.matchCase); edGo(0); };
ACTIONS['f-rep'] = () => {
  const ta = $('#ed-ta'), q = $('#f-q').value, sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
  if (q && (V.ed.matchCase ? sel === q : sel.toLowerCase() === q.toLowerCase())) { ta.focus(); if (!document.execCommand('insertText', false, $('#f-r').value)) ta.setRangeText($('#f-r').value, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
  edGo(1);
};
ACTIONS['f-all'] = () => {
  const ta = $('#ed-ta'), q = $('#f-q').value, m = edFind(); if (!m.length) return toast('Nothing to replace', 'info');
  const r = $('#f-r').value; let out = '', last = 0; m.forEach(i => { out += ta.value.slice(last, i) + r; last = i + q.length; }); out += ta.value.slice(last);
  ta.focus(); ta.select(); if (!document.execCommand('insertText', false, out)) ta.value = out; ta.dispatchEvent(new Event('input')); toast(`Replaced ${plural(m.length, 'occurrence')}`); edGo(0);
};
ACTIONS['ed-wrap'] = el => { const on = $('#ed').classList.toggle('wrap'); el.setAttribute('aria-pressed', on); el.classList.toggle('btn-primary', on); };
ACTIONS['ed-indent'] = () => { const E = V.ed; E.tab = E.tab.length === 2 ? '    ' : '  '; $('#ed-tab').textContent = E.tab.length; };
ACTIONS['ed-cancel'] = async () => {
  const E = V.ed, dirty = $('#ed-ta').value !== E.initial;
  if (dirty && !(await confirmDialog({ title: 'Discard changes?', message: 'Your edits have not been committed and will be lost.', confirmLabel: 'Discard', danger: true }))) return;
  dirtyGuard = false; go(E.isNew ? H.tree(E.repo, E.branch, V.dir) : H.blob(E.repo, E.branch, E.path));
};
ACTIONS['ed-commit'] = async () => {
  const E = V.ed, nameIn = $('#ed-name'), err = $('#c-err'), btn = $('#ed-save');
  const fail = (m, el) => { err.hidden = false; err.textContent = m; el && el.classList.add('invalid'); el && el.focus(); };
  err.hidden = true; $$('.invalid').forEach(x => x.classList.remove('invalid'));
  const rel = normPath((E.isNew && V.dir ? V.dir + '/' : '') + nameIn.value);
  if (!nameIn.value.trim() || !rel) return fail('Please enter a valid file name.', nameIn);
  const msg = $('#c-msg').value.trim(); if (!msg) return fail('Commit message cannot be empty.', $('#c-msg'));
  btn.disabled = true;
  try {
    const cur = await headOf(E.repo.id, E.branch);
    if (!E.isNew && cur.tree[E.path]?.sha !== E.baseSha) throw new Error('This file was changed on the branch after you opened it. Copy your edits, reload, and try again.');
    const ops = []; const data = $('#ed-ta').value;
    if (E.isNew) ops.push({ type: 'put', path: rel, data, overwrite: false });
    else { if (rel !== E.path) ops.push({ type: 'rename', from: E.path, to: rel }); ops.push({ type: 'put', path: rel, data }); }
    const repo = S.repos.find(r => r.id === E.repo.id);
    await commitChanges(repo, E.branch, msg, ops);
    dirtyGuard = false; toast(E.isNew ? 'Commit created' : 'Changes saved'); go(H.blob(repo, E.branch, rel));
  } catch (e) { btn.disabled = false; fail(e.message, /exists|already/.test(e.message) ? nameIn : null); }
};

/* ---------------- upload ---------------- */
async function viewUpload(token, repo, rest) {
  const { branch, path, missing } = await resolveBranchPath(repo, rest);
  V.branch = branch; V.dir = path;
  if (missing) return put(token, await repoShell(repo, 'code', `<div class="card"><div class="empty"><h3>Branch not found</h3><a class="btn btn-primary" href="${H.tree(repo, repo.defaultBranch)}">Go to ${esc(repo.defaultBranch)}</a></div></div>`));
  const head = await headOf(repo.id, branch), q = [];
  const folderSupport = 'webkitdirectory' in document.createElement('input');
  const body = `<div class="page-narrow"><div class="page-h"><h1>Upload files</h1><span class="badge">${ic('branch')}${esc(branch)}</span></div>
    <div class="drop" id="drop"><div>${ic('upload', 'xl')}</div><h3>Drag files or folders here</h3><p class="muted" style="margin:0">or choose them from your device — stored only in this browser</p>
      <div class="row"><label class="btn btn-primary" tabindex="0" id="pick-f">${ic('file-plus')}Choose files<input type="file" id="in-files" multiple hidden></label>
      ${folderSupport ? `<label class="btn" tabindex="0" id="pick-d">${ic('folder-plus')}Choose folder<input type="file" id="in-dir" webkitdirectory multiple hidden></label>` : ''}</div></div>
    <div class="field" style="margin:14px 0 0"><label for="up-dir">Upload into folder</label><input class="input mono" id="up-dir" value="${esc(path)}" placeholder="(repository root)" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
    <label class="check" id="zip-opt" hidden><input type="checkbox" id="up-zip"><span><b>Extract ZIP archives</b><small>Unpack .zip files into the folder instead of storing the archive.</small></span></label>
    <div class="card" id="up-card" style="margin-top:14px" hidden><div class="card-h"><h3 id="up-count"></h3><span class="grow"></span><button class="btn btn-sm btn-ghost" data-act="up-clear">Clear all</button></div><div class="ulist" id="up-list"></div></div>
    <div class="card commit-box" style="margin-top:16px"><b>${ic('commit')} Commit changes</b>
      <div class="field" style="margin:0"><label for="up-msg">Commit message</label><input class="input" id="up-msg" value="Add files via upload" maxlength="200" autocomplete="off"><div class="err" id="up-err" hidden></div></div>
      <div id="up-prog" hidden><div class="row between small muted"><span id="up-ptxt">Uploading…</span><span id="up-pct">0%</span></div><div class="bar"><i id="up-bar"></i></div></div>
      <div class="row wrap end"><a class="btn" href="${H.tree(repo, branch, path)}">Cancel</a><button class="btn btn-success" id="up-go" data-act="up-commit" disabled>${ic('upload')}Commit changes</button></div></div></div>`;
  if (!put(token, await repoShell(repo, 'code', body))) return;
  const U = { repo, branch, head, q, busy: false }; V.up = U;
  const addFiles = list => {
    for (const { file, rel } of list) {
      const i = q.findIndex(x => x.rel === rel); const item = { id: uid(), file, rel, size: file.size, pct: 0, url: /^image\//.test(file.type) ? mkUrl(file, file.type) : '' };
      if (i >= 0) q[i] = item; else q.push(item);
    }
    drawQ();
  };
  const drawQ = () => {
    $('#up-card').hidden = !q.length; $('#up-go').disabled = !q.length || U.busy;
    $('#zip-opt').hidden = !q.some(x => /\.zip$/i.test(x.file.name));
    $('#up-count').textContent = `${plural(q.length, 'file')} · ${fmtSize(q.reduce((n, x) => n + x.size, 0))}`;
    const dir = normPath($('#up-dir').value);
    $('#up-list').innerHTML = q.map(x => { const full = normPath((dir ? dir + '/' : '') + x.rel), big = x.size > MAX_FILE, exists = U.head.tree[full];
      return `<div class="ufile" data-id="${x.id}"><div class="uthumb">${x.url ? `<img alt="" src="${x.url}">` : fileIcon(x.file.name)}</div><div class="un"><b title="${esc(full)}">${esc(full || x.rel)}</b><small>${fmtSize(x.size)} · ${big ? `<span class="red">Too large (max ${fmtSize(MAX_FILE)})</span>` : exists ? '<span class="yellow">Will replace existing file</span>' : '<span class="green">New file</span>'}</small><div class="bar" ${x.pct ? '' : 'hidden'}><i style="width:${x.pct}%"></i></div></div><button class="btn btn-ghost btn-icon btn-sm" data-act="up-remove" data-id="${x.id}" aria-label="Remove ${esc(x.file.name)}">${ic('x')}</button></div>`; }).join('');
  };
  U.draw = drawQ; $('#up-dir').addEventListener('input', debounce(drawQ, 120));
  $('#in-files').addEventListener('change', e => { addFiles([...e.target.files].map(f => ({ file: f, rel: f.name }))); e.target.value = ''; });
  const dirIn = $('#in-dir'); if (dirIn) dirIn.addEventListener('change', e => { addFiles([...e.target.files].map(f => ({ file: f, rel: f.webkitRelativePath || f.name }))); e.target.value = ''; });
  $$('label.btn[tabindex]').forEach(l => l.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); l.querySelector('input').click(); } }));
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); if (ev === 'dragleave' && drop.contains(e.relatedTarget)) return; drop.classList.remove('over'); }));
  drop.addEventListener('drop', async e => {
    const items = [...(e.dataTransfer.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean), out = [];
    const walk = async (en, base) => {
      if (en.isFile) await new Promise(r => en.file(f => { out.push({ file: f, rel: base + f.name }); r(); }, r));
      else if (en.isDirectory) { const rd = en.createReader(); let batch; do { batch = await new Promise(r => rd.readEntries(r, () => r([]))); for (const c of batch) await walk(c, base + en.name + '/'); } while (batch.length); }
    };
    if (items.length) for (const en of items) await walk(en, ''); else [...e.dataTransfer.files].forEach(f => out.push({ file: f, rel: f.name }));
    addFiles(out);
  });
}
const readFileProgress = (file, cb) => new Promise((res, rej) => { const r = new FileReader(); r.onprogress = e => e.lengthComputable && cb(e.loaded / e.total); r.onload = () => res(new Uint8Array(r.result)); r.onerror = () => rej(new Error('Could not read ' + file.name)); r.readAsArrayBuffer(file); });
ACTIONS['up-remove'] = el => { const U = V.up; U.q.splice(U.q.findIndex(x => x.id === el.dataset.id), 1); U.draw(); };
ACTIONS['up-clear'] = () => { V.up.q.length = 0; V.up.draw(); };
ACTIONS['up-commit'] = async () => {
  const U = V.up, err = $('#up-err'); err.hidden = true;
  const fail = m => { err.hidden = false; err.textContent = m; };
  const msg = $('#up-msg').value.trim(); if (!msg) return fail('Commit message cannot be empty.');
  const dirRaw = $('#up-dir').value.trim(), dir = normPath(dirRaw); if (dirRaw && !dir) return fail('That folder path is not valid.');
  const big = U.q.filter(x => x.size > MAX_FILE); if (big.length) return fail(`${big[0].file.name} is too large. Remove it to continue (limit ${fmtSize(MAX_FILE)} per file).`);
  if (!U.q.length) return fail('Choose at least one file.');
  U.busy = true; $('#up-go').disabled = true; $('#up-prog').hidden = false;
  const setP = (p, t) => { $('#up-bar').style.width = p + '%'; $('#up-pct').textContent = Math.round(p) + '%'; if (t) $('#up-ptxt').textContent = t; };
  try {
    const ops = [], total = U.q.length; let done = 0;
    for (const x of U.q) {
      setP(done / total * 90, `Reading ${x.file.name}…`);
      const bytes = await readFileProgress(x.file, f => { x.pct = f * 100; setP((done + f) / total * 90); const row = $(`.ufile[data-id="${x.id}"] .bar`); if (row) { row.hidden = false; row.firstElementChild.style.width = x.pct + '%'; } });
      done++;
      if (/\.zip$/i.test(x.file.name) && $('#up-zip').checked) {
        for (const en of (await readZip(bytes.buffer)).filter(e => !/(^|\/)(__MACOSX\/|\.DS_Store$)/.test(e.path))) { const p = normPath((dir ? dir + '/' : '') + en.path); if (p) ops.push({ type: 'put', path: p, data: en.data }); }
      } else { const p = normPath((dir ? dir + '/' : '') + x.rel); if (!p) throw new Error('Invalid file name: ' + x.rel); ops.push({ type: 'put', path: p, data: bytes }); }
    }
    setP(94, 'Writing commit to local storage…');
    const repo = S.repos.find(r => r.id === U.repo.id);
    await commitChanges(repo, U.branch, msg, ops);
    setP(100, 'Done'); await sleep(250);
    toast(ops.length === 1 ? 'File uploaded' : `${ops.length} files uploaded`); go(H.tree(repo, U.branch, dir));
  } catch (e) {
    U.busy = false; $('#up-go').disabled = false; $('#up-prog').hidden = true;
    fail(/quota/i.test(e.name + e.message) ? 'Browser storage is full. Free up space (delete a repository or export it first) and try again.' : e.message);
  }
};

/* ---------------- commit history ---------------- */
async function viewCommits(token, repo, rest) {
  const { branch, missing } = await resolveBranchPath(repo, rest);
  V.branch = branch; V.dir = '';
  const br = missing ? null : await getBranch(repo.id, branch), filter = parseHash().q.get('path') || '';
  if (!br) return put(token, await repoShell(repo, 'code', `<div class="card"><div class="empty"><h3>Branch not found</h3><a class="btn btn-primary" href="${H.commits(repo, repo.defaultBranch)}">Go to ${esc(repo.defaultBranch)}</a></div></div>`));
  let list = br.head ? await history(repo.id, br.head) : [];
  if (filter) list = list.filter(c => c.changes.some(x => x.path === filter || x.from === filter));
  const shown = list.slice(0, 100), groups = new Map();
  shown.forEach(c => { const k = dayKey(c.date); (groups.get(k) || groups.set(k, []).get(k)).push(c); });
  const row = c => `<div class="crow"><span class="avatar sm">${esc(initials(c.author.name))}</span><div class="cm"><a class="t" href="${H.commit(repo, c.id)}">${esc(c.message.split('\n')[0])}</a><small><b>${esc(c.author.name)}</b> committed ${ago(c.date)} ${c.parents.length > 1 ? '<span class="badge purple">merge</span>' : ''}${plural(c.changes.length, 'file')} changed</small></div><a class="hash-chip" href="${H.commit(repo, c.id)}" title="${c.id}">${short(c.id)}</a><button class="btn btn-ghost btn-icon btn-sm" data-act="copy-hash" data-h="${c.id}" aria-label="Copy commit hash">${ic('copy')}</button></div>`;
  const html = `<div class="toolbar">${await branchButton(repo, branch, 'commits')}<span class="grow"></span><span class="muted small">${plural(list.length, 'commit')}</span></div>
    ${filter ? `<div class="notice" style="margin-bottom:12px">${ic('file')}<span>History for <b class="mono">${esc(filter)}</b> · <a href="${H.commits(repo, branch)}">Clear filter</a></span></div>` : ''}
    ${shown.length ? [...groups].map(([k, cs]) => `<div class="cgroup-h">Commits on ${fmtDate(cs[0].date)}</div><div class="card clist">${cs.map(row).join('')}</div>`).join('') : `<div class="card"><div class="empty">${ic('commit', 'xl')}<h3>No commits yet</h3><p>Create or upload a file to make the first commit.</p></div></div>`}
    ${list.length > 100 ? `<p class="muted" style="text-align:center;margin-top:12px">Showing the latest 100 commits.</p>` : ''}`;
  put(token, await repoShell(repo, 'code', html));
}
ACTIONS['copy-hash'] = el => copyText(el.dataset.h);
function diffHtml(d) {
  const hunks = toHunks(d);
  return `<div class="diff-body">${hunks.map(x => x.t === '@' ? `<div class="dl hunk">${esc(x.s)}</div>` : `<div class="dl ${x.t === '+' ? 'add' : x.t === '-' ? 'del' : ''}"><span class="g">${x.t === ' ' ? '' : x.t}</span><span>${esc(x.s) || ' '}</span></div>`).join('')}</div>`;
}
async function viewCommit(token, repo, idIn) {
  const map = await allCommits(repo.id); let c = map.get(idIn);
  if (!c && idIn) { const m = [...map.values()].filter(x => x.id.startsWith(idIn)); if (m.length === 1) c = m[0]; }
  if (!c) return put(token, await repoShell(repo, 'code', notFound('Commit')));
  V.branch = c.branch || repo.defaultBranch;
  const parent = c.parents[0] ? map.get(c.parents[0]) : null, pt = parent ? parent.tree : {};
  const files = [];
  for (const ch of c.changes.slice(0, 40)) {
    const nSha = c.tree[ch.path]?.sha, oSha = pt[ch.from || ch.path]?.sha;
    const [nb, ob] = await Promise.all([nSha ? getBlob(repo.id, nSha) : null, oSha ? getBlob(repo.id, oSha) : null]);
    let body;
    if ((nb && nb.binary) || (ob && ob.binary)) body = `<div class="empty" style="padding:16px">Binary file ${ch.type === 'A' ? 'added' : ch.type === 'D' ? 'removed' : 'changed'}</div>`;
    else if (ch.type === 'R' && nSha === oSha) body = `<div class="empty" style="padding:16px">File renamed without changes</div>`;
    else if ((nb?.size || 0) + (ob?.size || 0) > 300000) body = `<div class="empty" style="padding:16px">Large diff not shown</div>`;
    else body = diffHtml(diffLines(ob ? ob.content : '', nb ? nb.content : ''));
    const d = nb && ob ? diffLines(ob.content, nb.content) : [], add = d.filter(x => x.t === '+').length, del = d.filter(x => x.t === '-').length;
    files.push(`<div class="card diff-file"><div class="diff-h"><span class="chg ${ch.type === 'R' ? 'M' : ch.type}">${ch.type === 'R' ? 'R' : ch.type}</span><span class="p">${ch.from ? esc(ch.from) + ' → ' : ''}${esc(ch.path)}</span>${add || del ? `<span class="green">+${add}</span><span class="red">−${del}</span>` : ''}${c.tree[ch.path] ? `<a class="btn btn-sm" href="${H.blob(repo, c.branch || repo.defaultBranch, ch.path)}" title="Open current version">${ic('code')}</a>` : ''}</div>${body}</div>`);
  }
  const html = `<div class="card"><div class="card-b"><h2 style="font-size:19px;overflow-wrap:anywhere">${esc(c.message.split('\n')[0])}</h2>${c.message.includes('\n') ? `<pre style="white-space:pre-wrap;color:var(--text-2);font-family:inherit;margin:8px 0 0">${esc(c.message.split('\n').slice(1).join('\n').trim())}</pre>` : ''}
    <div class="row wrap" style="margin-top:12px"><span class="avatar sm">${esc(initials(c.author.name))}</span><span><b>${esc(c.author.name)}</b> committed <span title="${fmtDateTime(c.date)}">${ago(c.date)}</span></span></div>
    <dl class="kv" style="margin:12px 0 0"><dt>Commit</dt><dd class="mono">${c.id} <button class="btn btn-ghost btn-sm btn-icon" data-act="copy-hash" data-h="${c.id}" aria-label="Copy hash">${ic('copy')}</button></dd>
      <dt>${c.parents.length > 1 ? 'Parents' : 'Parent'}</dt><dd>${c.parents.length ? c.parents.map(p => `<a class="hash-chip" href="${H.commit(repo, p)}">${short(p)}</a>`).join(' ') : '<span class="muted">Root commit</span>'}</dd>
      <dt>Branch</dt><dd><span class="badge">${ic('branch')}${esc(c.branch || '')}</span></dd></dl></div></div>
    <div class="sec-h" style="margin-top:18px"><h2>${plural(c.changes.length, 'changed file')}</h2></div>${files.join('')}${c.changes.length > 40 ? `<p class="muted">Only the first 40 files are shown.</p>` : ''}`;
  put(token, await repoShell(repo, 'code', `<nav class="crumbs"><a href="${H.commits(repo, c.branch || repo.defaultBranch)}">${ic('chev-left')}Commits</a></nav>${html}`));
}

/* ---------------- branches ---------------- */
async function viewBranches(token, repo) {
  V.branch = (S.cur && S.cur[repo.id]) || repo.defaultBranch; V.dir = '';
  const [brs, map] = [await getBranches(repo.id), await allCommits(repo.id)];
  const def = brs.find(b => b.name === repo.defaultBranch), da = def?.head ? ancestors(map, def.head) : new Set();
  const row = b => {
    const c = b.head ? map.get(b.head) : null, a = b.head ? ancestors(map, b.head) : new Set();
    const ahead = [...a].filter(i => !da.has(i)).length, behind = [...da].filter(i => !a.has(i)).length;
    return `<div class="brow"><span class="ic-wrap">${ic('branch')}</span><div class="bm"><a href="${H.tree(repo, b.name)}">${esc(b.name)}</a><small>${c ? `${esc(c.message.split('\n')[0])} · ${ago(c.date)}` : 'No commits'}</small></div>
      ${b.name === V.branch ? '<span class="badge green">current</span>' : ''}${b.name === repo.defaultBranch ? '<span class="badge blue">default</span>' : `<span class="badge" title="Commits ahead / behind ${esc(repo.defaultBranch)}"><span class="green">${ahead}↑</span> <span class="red">${behind}↓</span></span>`}
      ${b.name !== repo.defaultBranch && ahead ? `<a class="btn btn-sm desk-i" href="${H.sub(repo, 'pulls/new')}?source=${enc1(b.name)}&target=${enc1(repo.defaultBranch)}">${ic('pr')}Pull request</a>` : ''}
      <button class="kebab" data-act="branch-row-menu" data-name="${esc(b.name)}" aria-label="Actions for ${esc(b.name)}">${ic('more', 'lg')}</button></div>`;
  };
  put(token, await repoShell(repo, 'code', `<div class="toolbar"><h2 style="font-size:18px" class="grow">Branches</h2><button class="btn btn-success" data-act="create-branch">${ic('plus')}New branch</button></div>
    <div class="card"><div class="card-h"><h3>${plural(brs.length, 'branch', 'branches')}</h3></div>${brs.map(row).join('')}</div>`));
}
ACTIONS['branch-row-menu'] = el => {
  const repo = V.repo, name = el.dataset.name;
  openMenu(el, { title: name, items: [
    { label: 'View files', icon: 'code', onClick: () => go(H.tree(repo, name)) },
    { label: 'View commits', icon: 'history', onClick: () => go(H.commits(repo, name)) },
    { label: 'New branch from here…', icon: 'plus', onClick: () => createBranchFlow(name) },
    { label: 'Rename…', icon: 'edit', onClick: () => renameBranchFlow(name) },
    ...(name !== repo.defaultBranch ? [{ label: 'Make default', icon: 'check', onClick: async () => { await setDefaultBranch(repo, name); toast(`Default branch is now ${name}`); render(); } }] : []),
    { divider: true },
    { label: 'Delete branch…', icon: 'trash', danger: true, onClick: () => deleteBranchFlow(name) }] });
};
async function renameBranchFlow(name) {
  const repo = V.repo;
  const r = await openModal({ title: 'Rename branch', icon: 'edit', body: `<div class="field" style="margin:0"><label for="rb-n">New name for <b>${esc(name)}</b></label><input class="input mono" id="rb-n" value="${esc(name)}" autocapitalize="off" autocomplete="off" spellcheck="false"></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Rename branch', kind: 'primary', onClick: async ctx => { const i = ctx.$('#rb-n'); try { await renameBranch(S.repos.find(x => x.id === repo.id), name, i.value); return i.value.trim(); } catch (e) { ctx.error(e.message, i); return false; } } }] });
  if (r) { toast('Branch renamed'); render(); }
}
async function deleteBranchFlow(name) {
  const repo = V.repo;
  if (name === repo.defaultBranch) return alertDialog('Cannot delete default branch', `“${esc(name)}” is the default branch. Make another branch the default first.`, 'alert', 'warn');
  if (name === V.branch) return alertDialog('Cannot delete current branch', `You are currently on “${esc(name)}”. Switch to another branch first.`, 'alert', 'warn');
  if (!(await confirmDialog({ title: 'Delete branch?', danger: true, confirmLabel: 'Delete branch', message: `Delete <b>${esc(name)}</b>? Commits that only exist on this branch become unreachable.` }))) return;
  try { await deleteBranch(repo, name, ''); toast('Branch deleted'); render(); } catch (e) { alertDialog('Could not delete branch', esc(e.message), 'alert', 'danger'); }
}

/* ====================================================================
   Issues, pull requests
   ==================================================================== */
const stIcon = i => i.state === 'open' ? `<span class="green">${ic('issue', 'st')}</span>` : `<span class="purple">${ic('issue-closed', 'st')}</span>`;
const prIcon = p => p.state === 'open' ? `<span class="green">${ic('pr', 'st')}</span>` : p.state === 'merged' ? `<span class="purple">${ic('merge', 'st')}</span>` : `<span class="red">${ic('pr', 'st')}</span>`;
const prBadge = p => p.state === 'open' ? `<span class="badge green">${ic('pr')}Open</span>` : p.state === 'merged' ? `<span class="badge purple">${ic('merge')}Merged</span>` : `<span class="badge red">${ic('pr')}Closed</span>`;
const issueBadge = i => i.state === 'open' ? `<span class="badge green">${ic('issue')}Open</span>` : `<span class="badge purple">${ic('issue-closed')}Closed</span>`;
const mdBox = t => t ? `<div class="md">${renderMarkdown(t)}</div>` : '<span class="muted">No description provided.</span>';
const commentHtml = (c, kind = '') => `<div class="cmt"><span class="avatar">${esc(initials(c.author))}</span><div class="box"><div class="box-h"><b>${esc(c.author)}</b> commented ${ago(c.date)}${kind ? `<span class="badge">${kind}</span>` : ''}</div><div class="box-b">${mdBox(c.body)}</div></div></div>`;
function mdEditor(id, label, ph = 'Leave a comment (Markdown supported)') {
  return `<div class="field" style="margin:0"><div class="row between" style="margin-bottom:6px"><label class="lbl" for="${id}" style="margin:0">${label}</label><div class="seg" data-md="${id}"><button type="button" class="on" data-act="md-tab" data-m="write">Write</button><button type="button" data-act="md-tab" data-m="preview">Preview</button></div></div>
    <textarea class="textarea" id="${id}" placeholder="${ph}"></textarea><div class="md preview-box card" id="${id}-pv" hidden style="padding:12px;min-height:90px"></div></div>`;
}
ACTIONS['md-tab'] = el => { const seg = el.parentElement, id = seg.dataset.md, ta = $('#' + id), pv = $('#' + id + '-pv'); $$('button', seg).forEach(b => b.classList.toggle('on', b === el)); const pre = el.dataset.m === 'preview'; pv.hidden = !pre; ta.hidden = pre; if (pre) pv.innerHTML = ta.value.trim() ? renderMarkdown(ta.value) : '<span class="muted">Nothing to preview</span>'; };
const sorters = { newest: (a, b) => b.createdAt - a.createdAt, oldest: (a, b) => a.createdAt - b.createdAt, comments: (a, b) => b.comments.length - a.comments.length, updated: (a, b) => b.updatedAt - a.updatedAt };

async function listView(token, repo, kind) {
  V.branch = V.branch || repo.defaultBranch;
  const isPR = kind === 'pulls', all = (await DB.byRepo(isPR ? 'pullRequests' : 'issues', repo.id));
  const st = { state: 'open', q: '', label: '', sort: 'newest' };
  const body = `<div class="ibar"><div class="input-icon">${ic('search')}<input class="input" id="il-q" type="search" placeholder="Search ${isPR ? 'pull requests' : 'issues'}…" aria-label="Search" autocomplete="off"></div>
      <div class="row wrap">${!isPR ? `<select class="select" id="il-l" aria-label="Filter by label" style="width:auto;min-width:130px"><option value="">All labels</option>${LABELS.map(l => `<option>${l.name}</option>`).join('')}</select>` : ''}
      <select class="select" id="il-s" aria-label="Sort" style="width:auto;min-width:130px"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="updated">Recently updated</option><option value="comments">Most commented</option></select>
      <a class="btn btn-success" href="${H.sub(repo, isPR ? 'pulls/new' : 'issues/new')}">${ic('plus')}New ${isPR ? 'pull request' : 'issue'}</a></div></div>
    ${isPR ? `<div class="notice" style="margin-bottom:12px">${ic('info')}<span><b>Offline simulation.</b> Pull requests here only merge local branches inside this browser. Nothing is sent to GitHub.</span></div>` : ''}
    <div class="card ilist"><div class="ilist-h" id="il-h"></div><div id="il-rows"></div></div>`;
  if (!put(token, await repoShell(repo, kind, body))) return;
  const draw = () => {
    const q = st.q.toLowerCase(), base = all.filter(i => (!q || i.title.toLowerCase().includes(q) || String(i.number) === q.replace('#', '') || (i.body || '').toLowerCase().includes(q)) && (!st.label || (i.labels || []).includes(st.label)));
    const openN = base.filter(i => i.state === 'open').length, closedN = base.length - openN;
    $('#il-h').innerHTML = `<button class="${st.state === 'open' ? 'on' : ''}" data-s="open">${ic(isPR ? 'pr' : 'issue')}${openN} Open</button><button class="${st.state === 'closed' ? 'on' : ''}" data-s="closed">${ic('check')}${closedN} Closed</button>`;
    const rows = base.filter(i => st.state === 'open' ? i.state === 'open' : i.state !== 'open').sort(sorters[st.sort]);
    $('#il-rows').innerHTML = rows.length ? rows.map(i => `<div class="irow">${isPR ? prIcon(i) : stIcon(i)}<div class="im"><a class="t" href="${H.sub(repo, kind + '/' + i.number)}">${esc(i.title)}</a> ${(i.labels || []).map(labelChip).join(' ')}
      <small>#${i.number} ${i.state === 'merged' ? 'merged' : i.state === 'closed' ? 'closed' : 'opened'} ${ago(i.state === 'merged' ? i.mergedAt : i.closedAt || i.createdAt)} by ${esc(i.author)}${isPR ? ` · <span class="mono">${esc(i.source)} → ${esc(i.target)}</span>` : ''}${i.comments.length ? ` · ${ic('copy')} ${i.comments.length}` : ''}</small></div></div>`).join('')
      : `<div class="empty">${ic(isPR ? 'pr' : 'issue', 'xl')}<h3>${all.length ? 'No results match your filters' : isPR ? 'No pull requests yet' : 'No issues yet'}</h3><p>${all.length ? 'Try clearing the search or switching tabs.' : isPR ? 'Create a branch, commit a change and open a pull request to merge it.' : 'Track bugs, tasks and ideas for this repository.'}</p>${all.length ? '' : `<a class="btn btn-primary" href="${H.sub(repo, isPR ? 'pulls/new' : 'issues/new')}">${ic('plus')}New ${isPR ? 'pull request' : 'issue'}</a>`}</div>`;
  };
  $('#il-h').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) { st.state = b.dataset.s; draw(); } });
  $('#il-q').addEventListener('input', debounce(e => { st.q = e.target.value; draw(); }, 100));
  $('#il-s').addEventListener('change', e => { st.sort = e.target.value; draw(); });
  $('#il-l') && $('#il-l').addEventListener('change', e => { st.label = e.target.value; draw(); });
  draw();
}
const viewIssues = (t, r) => listView(t, r, 'issues');
const viewPRs = (t, r) => listView(t, r, 'pulls');

async function viewIssueForm(token, repo) {
  const body = `<div class="page-narrow"><div class="page-h"><h1>New issue</h1></div><form id="ni" class="card"><div class="card-b stack">
    <div class="field" style="margin:0"><label for="ni-t">Title</label><input class="input" id="ni-t" maxlength="200" placeholder="Short, descriptive title" autocomplete="off"></div>
    ${mdEditor('ni-b', 'Description', 'Describe the issue… Markdown is supported')}
    <div><span class="lbl">Labels</span><div class="labelpick">${LABELS.map(l => `<label><input type="checkbox" value="${l.name}">${labelChip(l.name)}</label>`).join('')}</div></div>
    <div class="err" id="ni-e" hidden></div></div>
    <div class="modal-f" style="border-radius:0 0 var(--r) var(--r)"><a class="btn" href="${H.sub(repo, 'issues')}">Cancel</a><button class="btn btn-success" type="submit">Submit new issue</button></div></form></div>`;
  if (!put(token, await repoShell(repo, 'issues', body))) return;
  $('#ni').addEventListener('submit', async e => {
    e.preventDefault();
    try { const it = await createIssue(V.repo, { title: $('#ni-t').value, body: $('#ni-b').value, labels: $$('.labelpick input:checked').map(x => x.value) }); toast('Issue created'); go(H.sub(V.repo, 'issues/' + it.number)); }
    catch (err) { $('#ni-e').hidden = false; $('#ni-e').textContent = err.message; $('#ni-t').classList.add('invalid'); $('#ni-t').focus(); }
  });
}
async function viewIssue(token, repo, n) {
  const it = (await DB.byRepo('issues', repo.id)).find(i => i.number === n);
  if (!it) return put(token, await repoShell(repo, 'issues', notFound('Issue')));
  V.issue = it;
  const body = `<div class="ititle"><h1>${esc(it.title)} <span>#${it.number}</span></h1><button class="btn btn-sm" data-act="issue-edit">${ic('edit')}Edit</button></div>
    <div class="imeta">${issueBadge(it)}<span><b>${esc(it.author)}</b> opened this issue ${ago(it.createdAt)} · ${plural(it.comments.length, 'comment')}</span></div>
    <div class="rlayout with-side"><div class="thread" style="min-width:0">${commentHtml({ author: it.author, body: it.body, date: it.createdAt }, 'Author')}${it.comments.map(c => commentHtml(c)).join('')}
      <div class="card"><div class="card-b stack">${mdEditor('ic-b', 'Add a comment')}<div class="err" id="ic-e" hidden></div><div class="row wrap end">
        <button class="btn ${it.state === 'open' ? 'btn-danger' : ''}" data-act="issue-toggle">${ic(it.state === 'open' ? 'issue-closed' : 'issue')}${it.state === 'open' ? 'Close issue' : 'Reopen issue'}</button><button class="btn btn-success" data-act="issue-comment">Comment</button></div></div></div></div>
      <aside class="rside"><div class="card"><div class="card-b"><div class="row between"><b>Labels</b><button class="btn btn-sm btn-ghost" data-act="issue-labels">${ic('edit')}</button></div><div class="row wrap" style="margin-top:8px;gap:6px">${(it.labels || []).map(labelChip).join('') || '<span class="muted small">None yet</span>'}</div></div></div>
        <div class="card"><div class="card-b"><b>Actions</b><div class="stack" style="margin-top:8px"><button class="btn btn-danger btn-block" data-act="issue-delete">${ic('trash')}Delete issue</button></div></div></div></aside></div>`;
  put(token, await repoShell(repo, 'issues', `<nav class="crumbs"><a href="${H.sub(repo, 'issues')}">${ic('chev-left')}All issues</a></nav>` + body));
}
ACTIONS['issue-comment'] = async () => { const t = $('#ic-b').value.trim(); if (!t) { $('#ic-e').hidden = false; $('#ic-e').textContent = 'Write something first.'; return; } await addComment(V.issue, t); toast('Comment added'); render(); };
ACTIONS['issue-toggle'] = async () => { const t = $('#ic-b')?.value.trim(); if (t) await addComment(V.issue, t); const to = V.issue.state === 'open' ? 'closed' : 'open'; await setIssueState(V.repo, V.issue, to); toast(to === 'closed' ? 'Issue closed' : 'Issue reopened'); render(); };
ACTIONS['issue-delete'] = async () => { if (!(await confirmDialog({ title: 'Delete this issue?', danger: true, confirmLabel: 'Delete issue', message: 'The issue and all of its comments will be permanently removed.' }))) return; await DB.del('issues', V.issue.id); toast('Issue deleted'); go(H.sub(V.repo, 'issues')); };
ACTIONS['issue-edit'] = async () => {
  const it = V.issue;
  const ok = await openModal({ title: 'Edit issue', wide: true, body: `<div class="field"><label for="ie-t">Title</label><input class="input" id="ie-t" value="${esc(it.title)}" maxlength="200"></div><div class="field" style="margin:0"><label for="ie-b">Description</label><textarea class="textarea" id="ie-b" style="min-height:160px">${esc(it.body)}</textarea></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Save changes', kind: 'primary', onClick: async ctx => { const t = ctx.$('#ie-t'); if (!t.value.trim()) { ctx.error('Title is required.', t); return false; } it.title = t.value.trim(); it.body = ctx.$('#ie-b').value; await saveIssue(it); return true; } }] });
  if (ok) { toast('Changes saved'); render(); }
};
ACTIONS['issue-labels'] = async () => {
  const it = V.issue;
  const ok = await openModal({ title: 'Labels', body: `<div class="labelpick">${LABELS.map(l => `<label><input type="checkbox" value="${l.name}" ${(it.labels || []).includes(l.name) ? 'checked' : ''}>${labelChip(l.name)}</label>`).join('')}</div>`, actions: [{ label: 'Cancel' }, { label: 'Apply', kind: 'primary', onClick: async ctx => { it.labels = ctx.$$('input:checked').map(x => x.value); await saveIssue(it); return true; } }] });
  if (ok) { toast('Labels updated'); render(); }
};

async function viewPRForm(token, repo) {
  const brs = await getBranches(repo.id), q = parseHash().q;
  const opts = sel => brs.map(b => `<option ${b.name === sel ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
  const tgt = q.get('target') || repo.defaultBranch, src = q.get('source') || (brs.find(b => b.name !== tgt) || brs[0]).name;
  const body = `<div class="page-narrow"><div class="page-h"><h1>Open a pull request</h1></div>
    <div class="notice" style="margin-bottom:14px">${ic('info')}<span><b>Offline simulation.</b> This pull request exists only in your browser and does not communicate with GitHub.</span></div>
    <form id="np" class="card"><div class="card-b stack">
      <div class="row wrap"><div class="field grow" style="margin:0"><label for="np-s">Source branch (compare)</label><select class="select" id="np-s">${opts(src)}</select></div><span class="muted" style="margin-top:22px">${ic('chev-right')}</span><div class="field grow" style="margin:0"><label for="np-t">Destination branch (base)</label><select class="select" id="np-t">${opts(tgt)}</select></div></div>
      <div id="np-sum" class="notice">${ic('info')}<span>Comparing…</span></div>
      <div class="field" style="margin:0"><label for="np-title">Title</label><input class="input" id="np-title" maxlength="200" autocomplete="off"></div>
      ${mdEditor('np-b', 'Description', 'Describe your changes…')}<div class="err" id="np-e" hidden></div></div>
      <div class="modal-f" style="border-radius:0 0 var(--r) var(--r)"><a class="btn" href="${H.sub(repo, 'pulls')}">Cancel</a><button class="btn btn-success" type="submit" id="np-go">${ic('pr')}Create pull request</button></div></form></div>`;
  if (!put(token, await repoShell(repo, 'pulls', body))) return;
  let touched = false; $('#np-title').addEventListener('input', () => touched = true);
  const upd = async () => {
    const s = $('#np-s').value, t = $('#np-t').value, box = $('#np-sum'), go_ = $('#np-go');
    if (s === t) { box.className = 'notice warn'; box.innerHTML = `${ic('alert')}<span>Choose two different branches.</span>`; go_.disabled = true; return; }
    const c = await compareBranches(repo, s, t);
    if (!c.ahead.length) { box.className = 'notice warn'; box.innerHTML = `${ic('alert')}<span><b>${esc(t)}</b> already contains everything from <b>${esc(s)}</b>. Commit something on <b>${esc(s)}</b> first.</span>`; go_.disabled = true; return; }
    go_.disabled = false; box.className = 'notice'; box.innerHTML = `${ic('check')}<span>Able to merge: <b>${plural(c.ahead.length, 'commit')}</b> and <b>${plural(c.files.length, 'changed file')}</b>.</span>`;
    if (!touched) $('#np-title').value = c.ahead.length === 1 ? c.ahead[0].message.split('\n')[0] : s.replace(/[-_/]/g, ' ').replace(/^./, m => m.toUpperCase());
  };
  $('#np-s').addEventListener('change', upd); $('#np-t').addEventListener('change', upd); upd();
  $('#np').addEventListener('submit', async e => {
    e.preventDefault();
    try { const pr = await createPR(S.repos.find(r => r.id === repo.id), { title: $('#np-title').value, body: $('#np-b').value, source: $('#np-s').value, target: $('#np-t').value }); toast('Pull request created'); go(H.sub(repo, 'pulls/' + pr.number)); }
    catch (err) { $('#np-e').hidden = false; $('#np-e').textContent = err.message; }
  });
}
async function mergePreview(repo, source, target) {
  const c = await compareBranches(repo, source, target); if (!c.srcCommit) return { conflicts: [], cmp: c };
  const base = [...c.sa].filter(i => c.ta.has(i)).map(i => c.map.get(i)).sort((a, b) => b.date - a.date)[0], B = base ? base.tree : {}, Sx = c.srcCommit.tree, T = c.tgtCommit ? c.tgtCommit.tree : {}, conflicts = [];
  for (const p of new Set([...Object.keys(B), ...Object.keys(Sx), ...Object.keys(T)])) { const b = B[p]?.sha, s = Sx[p]?.sha, t = T[p]?.sha; if (s !== t && t !== b && s !== b) conflicts.push(p); }
  return { conflicts, cmp: c };
}
async function viewPR(token, repo, n) {
  const pr = (await DB.byRepo('pullRequests', repo.id)).find(p => p.number === n);
  if (!pr) return put(token, await repoShell(repo, 'pulls', notFound('Pull request')));
  V.pr = pr; const tab = parseHash().q.get('tab') || 'conversation', base = H.sub(repo, 'pulls/' + n);
  const brSrc = await getBranch(repo.id, pr.source), brTgt = await getBranch(repo.id, pr.target);
  let merge = '', cmp = null, mp = { conflicts: [] };
  if (pr.state === 'open' && brSrc && brTgt) { mp = await mergePreview(repo, pr.source, pr.target); cmp = mp.cmp; }
  if (pr.state === 'open') {
    merge = !brSrc || !brTgt ? `<div class="card merge-box"><div class="notice danger">${ic('alert')}<span>The ${!brSrc ? 'source' : 'destination'} branch no longer exists, so this pull request cannot be merged.</span></div><button class="btn btn-danger" data-act="pr-close">Close pull request</button></div>`
      : !cmp.ahead.length ? `<div class="card merge-box"><div class="notice warn">${ic('info')}<span><b>${esc(pr.target)}</b> already contains all commits from <b>${esc(pr.source)}</b>.</span></div><button class="btn btn-danger" data-act="pr-close">Close pull request</button></div>`
      : mp.conflicts.length ? `<div class="card merge-box"><div class="notice danger">${ic('alert')}<span><b>This branch has conflicts.</b> Both branches changed: <span class="mono">${mp.conflicts.slice(0, 4).map(esc).join(', ')}</span>. Resolve them on one of the branches, then try again.</span></div><button class="btn btn-danger" data-act="pr-close">Close pull request</button></div>`
      : `<div class="card merge-box"><div class="notice">${ic('check')}<span><b>No conflicts.</b> ${plural(cmp.ahead.length, 'commit')} from <b>${esc(pr.source)}</b> can be merged into <b>${esc(pr.target)}</b> (local simulation).</span></div>
        <div class="field" style="margin:0"><label for="pm-msg">Merge commit message</label><input class="input" id="pm-msg" value="Merge pull request #${pr.number} from ${esc(pr.source)}" maxlength="200"></div><div class="err" id="pm-e" hidden></div>
        <div class="row wrap end"><button class="btn btn-danger" data-act="pr-close">Close pull request</button><button class="btn btn-success" data-act="pr-merge">${ic('merge')}Merge pull request</button></div></div>`;
  } else if (pr.state === 'merged') merge = `<div class="card merge-box"><div class="notice" style="background:var(--purple-soft);border-color:transparent">${ic('merge')}<span><b>Pull request merged</b> ${ago(pr.mergedAt)} into <b>${esc(pr.target)}</b>. <a href="${H.commit(repo, pr.mergeCommit)}">View merge commit</a></span></div>${brSrc && pr.source !== repo.defaultBranch ? `<div><button class="btn" data-act="pr-delbranch">${ic('trash')}Delete branch ${esc(pr.source)}</button></div>` : ''}</div>`;
  else merge = `<div class="card merge-box"><div class="notice danger">${ic('alert')}<span>This pull request is closed.</span></div>${brSrc && brTgt ? `<div><button class="btn" data-act="pr-reopen">${ic('undo')}Reopen pull request</button></div>` : ''}</div>`;
  let main;
  if (tab === 'commits') {
    const list = pr.state === 'merged' ? (pr.commitIds || []) : (cmp ? cmp.ahead : []);
    const cs = pr.state === 'merged' ? (await Promise.all(list.map(id => getCommit(repo.id, id)))).filter(Boolean) : list;
    main = `<div class="card clist">${cs.length ? cs.map(c => `<div class="crow"><span class="avatar sm">${esc(initials(c.author.name))}</span><div class="cm"><a class="t" href="${H.commit(repo, c.id)}">${esc(c.message.split('\n')[0])}</a><small>${ago(c.date)}</small></div><a class="hash-chip" href="${H.commit(repo, c.id)}">${short(c.id)}</a></div>`).join('') : '<div class="empty">No commits to show.</div>'}</div>`;
  } else if (tab === 'files') {
    if (cmp) {
      const parts = [];
      for (const ch of cmp.files.slice(0, 30)) { const [nb, ob] = await Promise.all([cmp.srcCommit.tree[ch.path] ? getBlob(repo.id, cmp.srcCommit.tree[ch.path].sha) : null, cmp.tgtCommit?.tree[ch.path] ? getBlob(repo.id, cmp.tgtCommit.tree[ch.path].sha) : null]);
        const bin = (nb && nb.binary) || (ob && ob.binary); parts.push(`<div class="card diff-file"><div class="diff-h"><span class="chg ${ch.type}">${ch.type}</span><span class="p">${esc(ch.path)}</span></div>${bin ? '<div class="empty" style="padding:16px">Binary file</div>' : diffHtml(diffLines(ob ? ob.content : '', nb ? nb.content : ''))}</div>`); }
      main = parts.join('') || '<div class="card"><div class="empty">No file changes.</div></div>';
    } else main = pr.state === 'merged' ? `<div class="card"><div class="empty"><p>This pull request was merged. <a href="${H.commit(repo, pr.mergeCommit)}">Open the merge commit</a> to see its file changes.</p></div></div>` : '<div class="card"><div class="empty">Branches are unavailable.</div></div>';
  } else main = `<div class="thread">${commentHtml({ author: pr.author, body: pr.body, date: pr.createdAt }, 'Author')}${pr.comments.map(c => commentHtml(c)).join('')}${merge}
    <div class="card"><div class="card-b stack">${mdEditor('ic-b', 'Add a comment')}<div class="err" id="ic-e" hidden></div><div class="row end"><button class="btn btn-success" data-act="pr-comment">Comment</button></div></div></div></div>`;
  const tabs = `<div class="rtabs" style="margin-top:6px">${[['conversation', 'Conversation', 'copy'], ['commits', 'Commits', 'commit'], ['files', 'Files changed', 'file']].map(([k, l, i]) => `<a class="rtab ${tab === k ? 'on' : ''}" href="${base}?tab=${k}">${ic(i)}${l}</a>`).join('')}</div>`;
  put(token, await repoShell(repo, 'pulls', `<nav class="crumbs"><a href="${H.sub(repo, 'pulls')}">${ic('chev-left')}All pull requests</a></nav>
    <div class="ititle"><h1>${esc(pr.title)} <span>#${pr.number}</span></h1></div>
    <div class="imeta">${prBadge(pr)}<span class="pr-flow"><b>${esc(pr.author)}</b> wants to merge <span class="br">${esc(pr.source)}</span> ${ic('chev-right')} <span class="br">${esc(pr.target)}</span></span></div>
    <div class="notice" style="margin-bottom:6px">${ic('info')}<span>Offline simulation — merging only updates local branches. Nothing is sent to GitHub.</span></div>${tabs}${main}`));
}
ACTIONS['pr-comment'] = async () => { const t = $('#ic-b').value.trim(); if (!t) { $('#ic-e').hidden = false; $('#ic-e').textContent = 'Write something first.'; return; } V.pr.comments.push({ id: uid(), author: S.user.username, body: t, date: Date.now() }); V.pr.updatedAt = Date.now(); await DB.put('pullRequests', V.pr); toast('Comment added'); render(); };
ACTIONS['pr-close'] = async () => { V.pr.state = 'closed'; V.pr.closedAt = Date.now(); await DB.put('pullRequests', V.pr); toast('Pull request closed'); render(); };
ACTIONS['pr-reopen'] = async () => { V.pr.state = 'open'; await DB.put('pullRequests', V.pr); toast('Pull request reopened'); render(); };
ACTIONS['pr-merge'] = async () => {
  const pr = V.pr, repo = S.repos.find(r => r.id === V.repo.id), msg = $('#pm-msg').value.trim();
  if (!msg) { $('#pm-e').hidden = false; $('#pm-e').textContent = 'Merge commit message cannot be empty.'; return; }
  try {
    const cmp = await compareBranches(repo, pr.source, pr.target); pr.commitIds = cmp.ahead.map(c => c.id);
    const c = await mergeBranchesInto(repo, pr.source, pr.target, msg);
    pr.state = 'merged'; pr.mergedAt = Date.now(); pr.mergeCommit = c.id; pr.updatedAt = Date.now();
    await DB.batch([{ s: 'pullRequests', put: pr }, { s: 'activity', put: { id: uid(), repoId: repo.id, repoName: repo.name, type: 'pr', text: `Merged pull request #${pr.number}: ${pr.title}`, date: Date.now() } }]);
    toast('Pull request merged'); render();
  } catch (e) { $('#pm-e').hidden = false; $('#pm-e').textContent = e.message; }
};
ACTIONS['pr-delbranch'] = async () => { try { await deleteBranch(S.repos.find(r => r.id === V.repo.id), V.pr.source, V.branch === V.pr.source ? V.pr.source : ''); toast('Branch deleted'); render(); } catch (e) { alertDialog('Could not delete branch', esc(e.message), 'alert', 'danger'); } };

/* ====================================================================
   Actions (local checks), Projects, Wiki, Security, Insights, repo settings
   ==================================================================== */
async function viewPlaceholder(token, repo, which) {
  V.branch = V.branch || repo.defaultBranch;
  const head = await headOf(repo.id, repo.defaultBranch);
  const kind = { actions: 'actions', projects: 'projects', wiki: 'wiki', security: 'security' }[which];
  const fn = { actions: renderActions, projects: renderProjects, wiki: renderWiki, security: renderSecurity }[which];
  const inner = await fn(repo, head);
  put(token, await repoShell(repo, kind, inner));
  if (which === 'projects') bindBoard(repo);
}
const offlineNote = t => `<div class="notice" style="margin-bottom:14px">${ic('info')}<span>${t}</span></div>`;

/* ---- Actions: local checks ---- */
async function runChecks(repo, tree) {
  const out = [], add = (name, status, detail) => out.push({ name, status, detail });
  const has = re => Object.keys(tree).some(p => re.test(p));
  add('README present', has(/^readme(\.\w+)?$/i) ? 'pass' : 'warn', has(/^readme(\.\w+)?$/i) ? 'Found a README at the repository root.' : 'Add a README.md to describe the project.');
  add('.gitignore present', tree['.gitignore'] ? 'pass' : 'warn', tree['.gitignore'] ? 'Found .gitignore.' : 'Consider adding a .gitignore file.');
  add('License present', has(/^licen[sc]e(\.\w+)?$/i) ? 'pass' : 'warn', has(/^licen[sc]e/i) ? 'Found a LICENSE file.' : 'No LICENSE file found.');
  const bad = [], jsBad = [], big = [], noTitle = [];
  for (const [p, e] of Object.entries(tree)) {
    const ext = extOf(p); if (e.size > 1048576) big.push(p);
    if (!['json', 'js', 'mjs', 'html', 'htm'].includes(ext) || e.size > 1048576) continue;
    const t = blobText(await getBlob(repo.id, e.sha));
    if (ext === 'json') { try { JSON.parse(t); } catch (x) { bad.push(`${p} (${x.message})`); } }
    else if (ext === 'js') { try { new Function(t); } catch (x) { if (!/import|export|await/i.test(x.message)) jsBad.push(`${p} (${x.message})`); } }
    else if (!/<title>[^<]+<\/title>/i.test(t)) noTitle.push(p);
  }
  add('JSON files are valid', bad.length ? 'fail' : 'pass', bad.length ? bad.join('; ') : 'All JSON files parse correctly.');
  add('JavaScript compiles', jsBad.length ? 'fail' : 'pass', jsBad.length ? jsBad.join('; ') : 'No syntax errors found (compile-only; code is never executed).');
  add('HTML pages have a <title>', noTitle.length ? 'warn' : 'pass', noTitle.length ? noTitle.join(', ') : 'All HTML pages have a title.');
  add('No large files (> 1 MB)', big.length ? 'warn' : 'pass', big.length ? big.join(', ') : 'Repository files are small.');
  return out;
}
const stClass = { pass: ['green', 'check'], warn: ['yellow', 'alert'], fail: ['red', 'x'] };
const checkList = items => items.map(c => `<div class="irow"><span class="${stClass[c.status][0]}">${ic(stClass[c.status][1], 'st')}</span><div class="im"><b>${esc(c.name)}</b><small>${esc(c.detail)}</small></div><span class="badge ${stClass[c.status][0]}">${c.status}</span></div>`).join('');
async function renderActions(repo, head) {
  const last = await getSetting('checks:' + repo.id, null);
  return `${offlineNote('<b>Workflows can’t run offline.</b> Instead, run local checks on the default branch — everything happens in your browser.')}
    <div class="card"><div class="card-h">${ic('play')}<h3>Local checks</h3><span class="grow"></span><button class="btn btn-sm btn-success" data-act="run-checks" ${head && head.commit ? '' : 'disabled'}>${ic('play')}Run checks</button></div>
    <div id="checks-body" class="ilist">${last ? `<div class="card-b muted small">Last run ${ago(last.date)} on <b>${esc(last.branch)}</b></div>${checkList(last.items)}` : `<div class="empty">${ic('play', 'xl')}<h3>No runs yet</h3><p>${head && head.commit ? 'Click “Run checks” to validate README, JSON, JavaScript syntax and more.' : 'Commit some files first.'}</p></div>`}</div></div>`;
}
ACTIONS['run-checks'] = async el => {
  el.disabled = true; const repo = V.repo, h = await headOf(repo.id, repo.defaultBranch);
  const items = await runChecks(repo, h.tree); await setSetting('checks:' + repo.id, { date: Date.now(), branch: repo.defaultBranch, items });
  const f = items.filter(i => i.status === 'fail').length; toast(f ? `${f} check${f > 1 ? 's' : ''} failed` : 'All checks passed', f ? 'err' : 'ok'); render();
};

/* ---- Security: secret scan ---- */
const SECRET_RES = [['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/], ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/], ['Token-like string', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/], ['Hard-coded credential', /\b(?:api[_-]?key|secret|passwd|password|token)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i]];
async function renderSecurity(repo, head) {
  const last = await getSetting('scan:' + repo.id, null);
  const body = last ? (last.findings.length ? last.findings.map(f => `<div class="irow"><span class="red">${ic('alert', 'st')}</span><div class="im"><b>${esc(f.kind)}</b><small class="mono">${esc(f.path)}:${f.line} — ${esc(f.snippet)}</small></div></div>`).join('') : `<div class="empty">${ic('shield', 'xl')}<h3>No secrets found</h3><p>Scanned ${plural(last.files, 'file')} ${ago(last.date)}.</p></div>`) : `<div class="empty">${ic('shield', 'xl')}<h3>Not scanned yet</h3><p>Look for private keys, access tokens and hard-coded passwords in the default branch.</p></div>`;
  return `${offlineNote('<b>Local security scan.</b> Online dependency and advisory services aren’t available offline, but you can scan your files for leaked secrets.')}
    <div class="card"><div class="card-h">${ic('shield')}<h3>Secret scanning</h3><span class="grow"></span><button class="btn btn-sm btn-success" data-act="run-scan" ${head && head.commit ? '' : 'disabled'}>${ic('search')}Scan now</button></div><div class="ilist">${body}</div></div>
    <div class="card" style="margin-top:14px"><div class="card-b"><b>Security policy</b><p class="muted" style="margin:6px 0 10px">${head && head.tree['SECURITY.md'] ? 'This repository has a SECURITY.md.' : 'No SECURITY.md found. Add one to explain how to report vulnerabilities.'}</p>${head && head.tree['SECURITY.md'] ? `<a class="btn btn-sm" href="${H.blob(repo, repo.defaultBranch, 'SECURITY.md')}">View policy</a>` : `<a class="btn btn-sm" href="${H.newFile(repo, repo.defaultBranch)}">${ic('file-plus')}Create SECURITY.md</a>`}</div></div>`;
}
ACTIONS['run-scan'] = async el => {
  el.disabled = true; const repo = V.repo, h = await headOf(repo.id, repo.defaultBranch), findings = []; let files = 0;
  for (const [p, e] of Object.entries(h.tree)) {
    const b = await getBlob(repo.id, e.sha); if (!b || b.binary || b.size > 1048576) continue; files++;
    b.content.split('\n').forEach((ln, i) => SECRET_RES.forEach(([k, re]) => { const m = ln.match(re); if (m && findings.length < 100) findings.push({ kind: k, path: p, line: i + 1, snippet: m[0].slice(0, 6) + '…' + '•'.repeat(6) }); }));
  }
  await setSetting('scan:' + repo.id, { date: Date.now(), findings, files }); toast(findings.length ? `${plural(findings.length, 'potential secret')} found` : 'No secrets found', findings.length ? 'err' : 'ok'); render();
};

/* ---- Projects: kanban board (persisted in settings) ---- */
async function renderProjects(repo) {
  const b = await getSetting('board:' + repo.id, null) || { cols: [{ id: 'todo', name: 'To do', cards: [] }, { id: 'doing', name: 'In progress', cards: [] }, { id: 'done', name: 'Done', cards: [] }] };
  V.board = b;
  return `${offlineNote('A simple local project board. Cards are saved in this browser.')}<div class="board">${b.cols.map((c, ci) => `<section class="col" aria-label="${esc(c.name)}"><header><b>${esc(c.name)}</b><span class="counter">${c.cards.length}</span></header>
    ${c.cards.map(cd => `<div class="kcard"><p>${esc(cd.text)}</p><div class="row end">${ci > 0 ? `<button class="btn btn-sm btn-icon btn-ghost" data-act="card-move" data-c="${cd.id}" data-d="-1" aria-label="Move left">${ic('chev-left')}</button>` : ''}${ci < b.cols.length - 1 ? `<button class="btn btn-sm btn-icon btn-ghost" data-act="card-move" data-c="${cd.id}" data-d="1" aria-label="Move right">${ic('chev-right')}</button>` : ''}<button class="btn btn-sm btn-icon btn-ghost" data-act="card-del" data-c="${cd.id}" aria-label="Delete card">${ic('trash')}</button></div></div>`).join('')}
    <form class="kadd" data-col="${c.id}"><input class="input" placeholder="Add a card…" aria-label="New card in ${esc(c.name)}" maxlength="200"><button class="btn btn-sm btn-icon" type="submit" aria-label="Add card">${ic('plus')}</button></form></section>`).join('')}</div>`;
}
const saveBoard = async () => { await setSetting('board:' + V.repo.id, V.board); render(); };
function bindBoard() { $$('.kadd').forEach(f => f.addEventListener('submit', async e => { e.preventDefault(); const i = $('input', f), t = i.value.trim(); if (!t) return; V.board.cols.find(c => c.id === f.dataset.col).cards.push({ id: uid(), text: t }); await saveBoard(); })); }
ACTIONS['card-move'] = async el => { const cols = V.board.cols, ci = cols.findIndex(c => c.cards.some(k => k.id === el.dataset.c)), k = cols[ci].cards.find(x => x.id === el.dataset.c); cols[ci].cards = cols[ci].cards.filter(x => x !== k); cols[ci + +el.dataset.d].cards.push(k); await saveBoard(); };
ACTIONS['card-del'] = async el => { V.board.cols.forEach(c => c.cards = c.cards.filter(x => x.id !== el.dataset.c)); await saveBoard(); };

/* ---- Wiki (persisted in settings) ---- */
async function renderWiki(repo) {
  const pages = await getSetting('wiki:' + repo.id, []), sel = parseHash().q.get('p'), cur = pages.find(p => p.id === sel) || pages[0];
  V.wiki = pages;
  return `${offlineNote('Wiki pages are stored locally and support Markdown.')}<div class="rlayout with-side"><div class="card" style="order:2;min-width:0">${cur ? `<div class="card-h"><h3>${esc(cur.title)}</h3><span class="grow"></span><button class="btn btn-sm" data-act="wiki-edit" data-id="${cur.id}">${ic('edit')}Edit</button><button class="btn btn-sm btn-danger btn-icon" data-act="wiki-del" data-id="${cur.id}" aria-label="Delete page">${ic('trash')}</button></div><div class="card-b md">${renderMarkdown(cur.body)}</div>` : `<div class="empty">${ic('wiki', 'xl')}<h3>This wiki is empty</h3><p>Document how the project works.</p><button class="btn btn-primary" data-act="wiki-new">${ic('plus')}Create the first page</button></div>`}</div>
    <aside class="rside" style="order:1"><div class="card"><div class="card-h"><h3>Pages</h3><span class="grow"></span><button class="btn btn-sm btn-success" data-act="wiki-new">${ic('plus')}New</button></div><div class="side-list" style="padding:6px">${pages.map(p => `<a href="${H.sub(repo, 'wiki')}?p=${p.id}" ${cur && cur.id === p.id ? 'style="background:var(--surface-3);color:var(--text)"' : ''}>${ic('file')}<span>${esc(p.title)}</span></a>`).join('') || '<span class="muted small" style="padding:8px">No pages</span>'}</div></div></aside></div>`;
}
async function wikiForm(page) {
  return openModal({ title: page ? 'Edit page' : 'New page', wide: true, body: `<div class="field"><label for="w-t">Title</label><input class="input" id="w-t" value="${page ? esc(page.title) : ''}" maxlength="100"></div><div class="field" style="margin:0"><label for="w-b">Content (Markdown)</label><textarea class="textarea" id="w-b" style="min-height:220px">${page ? esc(page.body) : ''}</textarea></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Save page', kind: 'primary', onClick: ctx => { const t = ctx.$('#w-t'); if (!t.value.trim()) { ctx.error('Title is required.', t); return false; } return { title: t.value.trim(), body: ctx.$('#w-b').value }; } }] });
}
ACTIONS['wiki-new'] = async () => { const r = await wikiForm(); if (!r) return; const p = { id: uid(), ...r, updatedAt: Date.now() }; await setSetting('wiki:' + V.repo.id, [...V.wiki, p]); toast('Page created'); go(H.sub(V.repo, 'wiki') + '?p=' + p.id); };
ACTIONS['wiki-edit'] = async el => { const p = V.wiki.find(x => x.id === el.dataset.id), r = await wikiForm(p); if (!r) return; Object.assign(p, r, { updatedAt: Date.now() }); await setSetting('wiki:' + V.repo.id, V.wiki); toast('Changes saved'); render(); };
ACTIONS['wiki-del'] = async el => { if (!(await confirmDialog({ title: 'Delete page?', danger: true, confirmLabel: 'Delete', message: 'This wiki page will be permanently deleted.' }))) return; await setSetting('wiki:' + V.repo.id, V.wiki.filter(x => x.id !== el.dataset.id)); toast('Page deleted'); go(H.sub(V.repo, 'wiki')); };

/* ---- Insights ---- */
async function viewInsights(token, repo) {
  V.branch = V.branch || repo.defaultBranch;
  const [h, issues, prs, acts] = [await headOf(repo.id, repo.defaultBranch), await DB.byRepo('issues', repo.id), await DB.byRepo('pullRequests', repo.id), await DB.byRepo('commits', repo.id)];
  const tree = h ? h.tree : {}, weeks = Array(12).fill(0), now = Date.now(), W = 7 * 864e5;
  acts.forEach(c => { const w = Math.floor((now - c.date) / W); if (w >= 0 && w < 12) weeks[11 - w]++; });
  const max = Math.max(1, ...weeks), langs = computeLangs(tree), size = Object.values(tree).reduce((n, e) => n + (e.size || 0), 0);
  const brs = await getBranches(repo.id);
  put(token, await repoShell(repo, 'insights', `<div class="stats"><div class="stat"><b>${acts.length}</b><span>${ic('commit')}Commits</span></div><div class="stat"><b>${Object.keys(tree).length}</b><span>${ic('file')}Files</span></div><div class="stat"><b>${brs.length}</b><span>${ic('branch')}Branches</span></div><div class="stat"><b>${fmtSize(size)}</b><span>${ic('database')}Size</span></div></div>
    <div class="rlayout" style="margin-top:14px;grid-template-columns:minmax(0,1fr)"><div class="card"><div class="card-h"><h3>Commit activity — last 12 weeks</h3></div><div class="card-b"><div class="bars" role="img" aria-label="Commits per week">${weeks.map((n, i) => `<i style="height:${Math.max(3, n / max * 100)}%" title="${n} commits"></i>`).join('')}</div><div class="row between small muted" style="margin-top:6px"><span>12 weeks ago</span><span>This week</span></div></div></div>
      <div class="stats"><div class="stat"><b>${issues.filter(i => i.state === 'open').length}</b><span>${ic('issue')}Open issues</span></div><div class="stat"><b>${issues.filter(i => i.state === 'closed').length}</b><span>${ic('issue-closed')}Closed issues</span></div><div class="stat"><b>${prs.filter(p => p.state === 'open').length}</b><span>${ic('pr')}Open PRs</span></div><div class="stat"><b>${prs.filter(p => p.state === 'merged').length}</b><span>${ic('merge')}Merged PRs</span></div></div>
      ${langs.length ? `<div class="card"><div class="card-h"><h3>Languages</h3></div><div class="card-b"><div class="langbar">${langs.map(l => `<i style="width:${l.pct}%;background:${l.color}"></i>`).join('')}</div><div class="langlist">${langs.map(l => `<span><i class="lang-dot" style="background:${l.color}"></i><b>${l.name}</b> ${l.pct.toFixed(1)}%</span>`).join('')}</div></div></div>` : ''}</div>`));
}

/* ---- Repository settings ---- */
async function viewRepoSettings(token, repo) {
  V.branch = V.branch || repo.defaultBranch;
  const brs = await getBranches(repo.id);
  const body = `<div class="page-narrow" style="margin:0"><section class="set-sec"><h2>General</h2>
    <div class="field"><label for="rs-n">Repository name</label><div class="row"><input class="input" id="rs-n" value="${esc(repo.name)}" autocapitalize="off" autocomplete="off" spellcheck="false"><button class="btn" data-act="rs-rename">Rename</button></div><div class="err" id="rs-ne" hidden></div></div>
    <div class="field"><label for="rs-d">Description</label><div class="row"><input class="input" id="rs-d" value="${esc(repo.description)}" maxlength="300"><button class="btn" data-act="rs-desc">Save</button></div></div>
    <div class="set-row"><div><b>Visibility</b><small>Currently <b>${repo.visibility}</b>. This only changes how it is labelled in this app.</small></div><button class="btn" data-act="rs-vis">Make ${repo.visibility === 'public' ? 'private' : 'public'}</button></div>
    <div class="set-row"><div><b>Default branch</b><small>The branch shown first and used as the base for pull requests.</small></div><select class="select" id="rs-b" style="width:auto;min-width:140px" aria-label="Default branch">${brs.map(b => `<option ${b.name === repo.defaultBranch ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div></section>
    <section class="set-sec"><h2>Export &amp; import</h2>
    <div class="set-row"><div><b>Download as ZIP</b><small>All files on the default branch.</small></div><button class="btn" data-act="rs-zip">${ic('zip')}Download ZIP</button></div>
    <div class="set-row"><div><b>Export repository data</b><small>Full history, branches, issues and pull requests as a .json file.</small></div><button class="btn" data-act="rs-export">${ic('download')}Export</button></div>
    <div class="set-row"><div><b>Import repository</b><small>Add a repository from a .json export or a .zip archive as a new repository.</small></div><button class="btn" data-act="import">${ic('upload')}Import…</button></div></section>
    <section class="set-sec"><h2 class="red">Danger zone</h2><div class="danger-zone">
    <div class="set-row"><div><b>Clear repository data</b><small>Removes all files, commits, branches, issues and pull requests but keeps the repository itself.</small></div><button class="btn btn-danger" data-act="rs-clear">Clear data…</button></div>
    <div class="set-row"><div><b>Delete this repository</b><small>Permanently removes everything from this device.</small></div><button class="btn btn-danger" data-act="rs-delete">Delete repository…</button></div></div></section></div>`;
  if (!put(token, await repoShell(repo, 'settings', body))) return;
  $('#rs-b').addEventListener('change', async e => { try { await setDefaultBranch(S.repos.find(r => r.id === repo.id), e.target.value); toast(`Default branch is now ${e.target.value}`); render(); } catch (err) { toast(err.message, 'err'); } });
}
ACTIONS['rs-rename'] = async () => {
  const repo = V.repo, i = $('#rs-n'), e = $('#rs-ne'), v = i.value.trim(), err = validateRepoName(v, repo.id);
  if (err) { e.hidden = false; e.textContent = err; i.classList.add('invalid'); return; } if (v === repo.name) return toast('That is already the name', 'info');
  if (!(await confirmDialog({ title: 'Rename repository?', confirmLabel: 'Rename', message: `Rename <b>${esc(repo.name)}</b> to <b>${esc(v)}</b>? Links to the old name will stop working.` }))) return;
  const nr = { ...repo, name: v }; await saveRepo(nr);
  for (const a of await DB.byRepo('activity', repo.id)) await DB.put('activity', { ...a, repoName: v });
  toast('Repository renamed'); go(H.sub(nr, 'settings'));
};
ACTIONS['rs-desc'] = async () => { await saveRepo({ ...V.repo, description: $('#rs-d').value.trim() }); toast('Changes saved'); render(); };
ACTIONS['rs-vis'] = async () => { const r = V.repo, to = r.visibility === 'public' ? 'private' : 'public'; if (!(await confirmDialog({ title: `Make repository ${to}?`, confirmLabel: `Make ${to}`, message: `<b>${esc(r.name)}</b> will be labelled <b>${to}</b>.` }))) return; await saveRepo({ ...r, visibility: to }); toast('Visibility changed'); render(); };
ACTIONS['rs-zip'] = () => downloadRepoZip(V.repo, V.repo.defaultBranch);
ACTIONS['rs-export'] = () => exportJson(V.repo);
ACTIONS['rs-delete'] = () => deleteRepoFlow(V.repo);
ACTIONS['rs-clear'] = async () => {
  const r = V.repo;
  if (!(await confirmDialog({ title: 'Clear all repository data?', danger: true, confirmLabel: 'Clear data', typeToConfirm: r.name, message: `All files, commits, branches, issues and pull requests of <b>${esc(r.name)}</b> will be permanently erased. The empty repository remains.` }))) return;
  await DB.purgeRepo(r.id, ['files', 'commits', 'branches', 'issues', 'pullRequests', 'activity']);
  await DB.batch([{ s: 'branches', put: { key: r.id + ':main', repoId: r.id, name: 'main', head: null, createdAt: Date.now() } }]);
  await saveRepo({ ...r, defaultBranch: 'main', language: '', counter: 0, updatedAt: Date.now() }); toast('Repository data cleared'); go(H.repo(r));
};

/* ====================================================================
   Profile, global search, app settings, command palette, startup
   ==================================================================== */
const ACT_ICON = { commit: 'commit', repo: 'repo', branch: 'branch', issue: 'issue', pr: 'pr', star: 'star' };
async function repoPickModal(title = 'Choose a repository') {
  if (!S.repos.length) { await alertDialog('No repositories', 'Create a repository first.', 'repo'); return null; }
  return openModal({ title, body: `<div class="side-list">${S.repos.map(r => `<a href="#" data-pick="${r.id}">${ic(r.visibility === 'private' ? 'lock' : 'repo')}<span>${esc(r.name)}</span></a>`).join('')}</div>`, actions: [{ label: 'Cancel' }],
    onOpen: ctx => ctx.el.addEventListener('click', e => { const a = e.target.closest('[data-pick]'); if (a) { e.preventDefault(); ctx.close(S.repos.find(r => r.id === a.dataset.pick)); } }) });
}

/* ---------------- profile ---------------- */
async function viewProfile(token) {
  await loadRepos();
  const [acts, issues] = await Promise.all([DB.all('activity'), DB.all('issues')]);
  const counts = {}; acts.filter(a => ['commit', 'issue', 'pr'].includes(a.type)).forEach(a => { const k = dayKey(a.date); counts[k] = (counts[k] || 0) + 1; });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - (52 * 7 + today.getDay()));
  let cells = '', total = 0, months = '', lastM = -1;
  for (let i = 0; i < 53 * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i); if (d > today) break;
    const n = counts[dayKey(d)] || 0; total += n;
    const lv = n === 0 ? '' : n < 2 ? 'l1' : n < 4 ? 'l2' : n < 6 ? 'l3' : 'l4';
    if (d.getDay() === 0 && d.getMonth() !== lastM) { lastM = d.getMonth(); months += `<span style="position:absolute;left:${Math.floor(i / 7) * 14}px">${d.toLocaleString(undefined, { month: 'short' })}</span>`; }
    cells += `<i class="${lv}" title="${n} contribution${n === 1 ? '' : 's'} on ${fmtDate(d.getTime())}"></i>`;
  }
  const pins = S.repos.filter(r => r.pinned).slice(0, 6), shown = pins.length ? pins : S.repos.slice(0, 4);
  const feed = [...acts].sort((a, b) => b.date - a.date).slice(0, 25);
  const u = S.user;
  const html = `<div class="profile"><aside class="p-side"><div class="p-head"><span class="avatar xl">${esc(initials(u.username))}</span></div>
      <div><h1>${esc(u.name || u.username)}</h1><div class="un">${esc(u.username)}</div></div>
      <p class="bio" style="margin:0">${esc(u.bio || '')}</p><button class="btn btn-block" data-act="profile-edit">${ic('edit')}Edit profile</button>
      <div class="p-follow">${ic('users')}<b>${u.followers || 0}</b> followers · <b>${u.following || 0}</b> following</div>
      <div class="p-follow">${ic('repo')}<b>${S.repos.length}</b> ${S.repos.length === 1 ? 'repository' : 'repositories'}</div>
      ${u.location ? `<div class="p-follow">${ic('globe')}${esc(u.location)}</div>` : ''}<div class="p-follow">${ic('clock')}Joined ${fmtDate(u.createdAt)}</div>
      <div class="notice" style="width:100%">${ic('info')}<span>Everything on this profile is stored locally on this device.</span></div></aside>
    <div class="stack" style="min-width:0"><section><div class="sec-h"><h2>${pins.length ? 'Pinned' : 'Popular repositories'}</h2><button class="btn btn-sm btn-ghost" data-act="pins-edit">${ic('pin')}Customize pins</button></div>
      <div class="pins">${shown.map(r => repoCard(r)).join('') || `<div class="card"><div class="empty">${ic('repo', 'xl')}<p>No repositories yet.</p><a class="btn btn-primary" href="#/new">New repository</a></div></div>`}</div></section>
      <section class="card"><div class="card-h"><h3>${total} contributions in the last year</h3></div><div class="card-b"><div class="cal-wrap" id="cal-wrap"><div class="cal-months" style="width:${53 * 14}px">${months}</div><div class="cal" role="img" aria-label="Contribution calendar">${cells}</div></div>
      <div class="cal-legend">Less <i></i><i class="l1" style="background:color-mix(in srgb,var(--green) 35%,var(--surface-3))"></i><i style="background:color-mix(in srgb,var(--green) 60%,var(--surface-3))"></i><i style="background:color-mix(in srgb,var(--green) 82%,var(--surface-3))"></i><i style="background:var(--green)"></i> More</div></div></section>
      <section class="card"><div class="card-h"><h3>Activity</h3></div><div class="card-b feed">${feed.map(a => { const r = S.repos.find(x => x.id === a.repoId); return `<div class="feed-i"><span class="fi">${ic(ACT_ICON[a.type] || 'commit')}</span><div class="ft2">${esc(a.text.split('\n')[0])} ${r ? `in <a href="${H.repo(r)}">${esc(r.name)}</a>` : a.repoName ? `in ${esc(a.repoName)}` : ''}<small>${ago(a.date)}</small></div></div>`; }).join('') || '<div class="empty" style="padding:20px">No activity yet. Make a commit to get started.</div>'}</div></section></div></div>`;
  if (!put(token, html)) return;
  const w = $('#cal-wrap'); if (w) w.scrollLeft = w.scrollWidth;
}
ACTIONS['profile-edit'] = async () => {
  const u = S.user;
  const r = await openModal({ title: 'Edit profile', body: `<div class="field"><label for="pe-n">Name</label><input class="input" id="pe-n" value="${esc(u.name || '')}" maxlength="60"></div>
    <div class="field"><label for="pe-u">Username</label><input class="input" id="pe-u" value="${esc(u.username)}" maxlength="39" autocapitalize="off" spellcheck="false"><div class="help">Letters, numbers and hyphens.</div></div>
    <div class="field"><label for="pe-b">Bio</label><textarea class="textarea" id="pe-b" maxlength="200" style="min-height:70px">${esc(u.bio || '')}</textarea></div>
    <div class="field"><label for="pe-l">Location</label><input class="input" id="pe-l" value="${esc(u.location || '')}" maxlength="60"></div>
    <div class="row"><div class="field grow" style="margin:0"><label for="pe-f">Followers</label><input class="input" type="number" min="0" id="pe-f" value="${u.followers || 0}"></div><div class="field grow" style="margin:0"><label for="pe-g">Following</label><input class="input" type="number" min="0" id="pe-g" value="${u.following || 0}"></div></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Save profile', kind: 'primary', onClick: async ctx => {
      const un = ctx.$('#pe-u'); if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(un.value.trim())) { ctx.error('Username can only contain letters, numbers and hyphens.', un); return false; }
      const nu = { ...u, name: ctx.$('#pe-n').value.trim(), username: un.value.trim(), bio: ctx.$('#pe-b').value.trim(), location: ctx.$('#pe-l').value.trim(), followers: Math.max(0, +ctx.$('#pe-f').value || 0), following: Math.max(0, +ctx.$('#pe-g').value || 0) };
      await DB.batch([{ s: 'users', put: nu }, ...S.repos.map(x => ({ s: 'repositories', put: { ...x, owner: nu.username } }))]); S.user = nu; await loadRepos(); return true;
    } }] });
  if (r) { buildTopbar(); toast('Changes saved'); render(); }
};
ACTIONS['pins-edit'] = async () => {
  const r = await openModal({ title: 'Pin repositories', body: `<p class="muted" style="margin-top:0">Choose up to 6 repositories to show on your profile.</p>${S.repos.map(r => `<label class="check"><input type="checkbox" value="${r.id}" ${r.pinned ? 'checked' : ''}><span><b>${esc(r.name)}</b><small>${esc(r.description || 'No description')}</small></span></label>`).join('') || '<p class="muted">No repositories yet.</p>'}`,
    actions: [{ label: 'Cancel' }, { label: 'Save pins', kind: 'primary', onClick: async ctx => { const ids = ctx.$$('input:checked').map(i => i.value); if (ids.length > 6) { ctx.error('You can pin up to 6 repositories.'); return false; } await DB.batch(S.repos.map(x => ({ s: 'repositories', put: { ...x, pinned: ids.includes(x.id) } }))); await loadRepos(); return true; } }] });
  if (r) { toast('Changes saved'); render(); }
};

/* ---------------- global search ---------------- */
const rxEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hlText = (s, q) => { s = String(s); if (!q) return esc(s); const re = new RegExp('(' + rxEsc(q) + ')', 'ig'); return s.split(re).map((p, i) => i % 2 ? `<mark>${esc(p)}</mark>` : esc(p)).join(''); };
async function searchAll(q) {
  const ql = q.toLowerCase(), out = { repos: [], files: [], commits: [], issues: [], pulls: [] };
  if (!ql) return out;
  const byId = new Map(S.repos.map(r => [r.id, r]));
  out.repos = S.repos.filter(r => r.name.toLowerCase().includes(ql) || (r.description || '').toLowerCase().includes(ql));
  let reads = 0;
  for (const r of S.repos) {
    const h = await headOf(r.id, r.defaultBranch); if (!h) continue;
    for (const [p, e] of Object.entries(h.tree)) {
      if (out.files.length >= 120) break;
      if (p.toLowerCase().includes(ql)) { out.files.push({ repo: r, path: p, line: 0, text: '' }); continue; }
      if (e.size > 200000 || reads > 600 || !hlOf(p) && !/^(txt|csv|log|cfg|conf)$/.test(extOf(p))) continue;
      reads++; const b = await getBlob(r.id, e.sha); if (!b || b.binary) continue;
      const i = b.content.toLowerCase().indexOf(ql); if (i < 0) continue;
      const ls = b.content.lastIndexOf('\n', i) + 1, le = b.content.indexOf('\n', i), ln = b.content.slice(0, i).split('\n').length;
      out.files.push({ repo: r, path: p, line: ln, text: b.content.slice(ls, le < 0 ? undefined : le).trim().slice(0, 180) });
    }
  }
  for (const c of await DB.all('commits')) { const r = byId.get(c.repoId); if (r && (c.message.toLowerCase().includes(ql) || c.id.startsWith(ql) || c.author.name.toLowerCase().includes(ql))) out.commits.push({ repo: r, c }); }
  out.commits.sort((a, b) => b.c.date - a.c.date); out.commits = out.commits.slice(0, 100);
  for (const i of await DB.all('issues')) { const r = byId.get(i.repoId); if (r && (i.title.toLowerCase().includes(ql) || (i.body || '').toLowerCase().includes(ql) || ('#' + i.number) === ql)) out.issues.push({ repo: r, i }); }
  for (const p of await DB.all('pullRequests')) { const r = byId.get(p.repoId); if (r && (p.title.toLowerCase().includes(ql) || (p.body || '').toLowerCase().includes(ql))) out.pulls.push({ repo: r, p }); }
  return out;
}
async function viewSearch(token, q0, t0) {
  await loadRepos();
  const html = `<div class="page-h"><h1>Search</h1></div><form id="sf" class="row" style="margin-bottom:14px"><div class="input-icon grow">${ic('search')}<input class="input" id="sq" type="search" value="${esc(q0)}" placeholder="Search repositories, files, commits, issues and pull requests" aria-label="Search" autocomplete="off" style="height:42px"></div><button class="btn btn-primary" style="height:42px" type="submit">Search</button></form><div id="sr"></div>`;
  if (!put(token, html)) return;
  let q = q0, tab = t0, data = null;
  const TABS_S = [['repos', 'Repositories', 'repo'], ['files', 'Code & files', 'file'], ['commits', 'Commits', 'commit'], ['issues', 'Issues', 'issue'], ['pulls', 'Pull requests', 'pr']];
  const draw = () => {
    const box = $('#sr'); if (!box) return;
    if (!q.trim()) { box.innerHTML = `<div class="card"><div class="empty">${ic('search', 'xl')}<h3>Search everything offline</h3><p>Type to search repository names, file names and contents, commit messages, issues and pull requests across all local repositories.</p></div></div>`; return; }
    if (!data) { box.innerHTML = '<div class="boot"><div class="spinner"></div></div>'; return; }
    const n = k => data[k].length;
    const results = {
      repos: () => data.repos.map(r => `<div class="sres"><a class="t" href="${H.repo(r)}">${ic('repo')} ${hlText(r.name, q)}</a><p>${hlText(r.description || 'No description', q)}</p><small>Updated ${ago(r.updatedAt)} · ${r.stars || 0} stars</small></div>`),
      files: () => data.files.map(f => `<div class="sres"><a class="t mono" href="${H.blob(f.repo, f.repo.defaultBranch, f.path)}${f.line ? '#L' + f.line : ''}">${hlText(f.path, q)}</a> <small>in ${esc(f.repo.name)}</small>${f.text ? `<p class="mono" style="white-space:pre-wrap">${f.line}: ${hlText(f.text, q)}</p>` : ''}</div>`),
      commits: () => data.commits.map(({ repo, c }) => `<div class="sres"><a class="t" href="${H.commit(repo, c.id)}">${hlText(c.message.split('\n')[0], q)}</a><p class="mono">${short(c.id)}</p><small>${esc(repo.name)} · ${esc(c.author.name)} · ${ago(c.date)}</small></div>`),
      issues: () => data.issues.map(({ repo, i }) => `<div class="sres"><a class="t" href="${H.sub(repo, 'issues/' + i.number)}">${stIcon(i)} ${hlText(i.title, q)}</a><p>${hlText((i.body || '').slice(0, 160), q)}</p><small>${esc(repo.name)} #${i.number} · ${i.state} · ${ago(i.createdAt)}</small></div>`),
      pulls: () => data.pulls.map(({ repo, p }) => `<div class="sres"><a class="t" href="${H.sub(repo, 'pulls/' + p.number)}">${prIcon(p)} ${hlText(p.title, q)}</a><p>${hlText((p.body || '').slice(0, 160), q)}</p><small>${esc(repo.name)} #${p.number} · ${p.state} · ${ago(p.createdAt)}</small></div>`)
    };
    const rows = results[tab]();
    box.innerHTML = `<div class="sgrid"><nav class="snav" aria-label="Result types">${TABS_S.map(([k, l, i]) => `<a href="#" data-t="${k}" class="${k === tab ? 'on' : ''}"><span>${ic(i)} ${l}</span><span class="counter">${n(k)}</span></a>`).join('')}</nav>
      <div class="card">${rows.length ? rows.join('') : `<div class="empty">${ic('search', 'xl')}<h3>No ${TABS_S.find(x => x[0] === tab)[1].toLowerCase()} match “${esc(q)}”</h3><p>Try a different keyword or check another category.</p></div>`}</div></div>`;
  };
  const run = async () => { data = null; draw(); const my = q; const r = await searchAll(q.trim()); if (my !== q || token !== navToken) return; data = r; if (!data[tab].length) { const first = TABS_S.find(([k]) => data[k].length); if (first) tab = first[0]; } draw(); };
  const sync = () => history.replaceState(null, '', `#/search?q=${enc1(q)}&t=${tab}`);
  $('#sf').addEventListener('submit', e => { e.preventDefault(); q = $('#sq').value; sync(); run(); });
  $('#sq').addEventListener('input', debounce(() => { if ($('#sq').value !== q) { q = $('#sq').value; sync(); run(); } }, 350));
  $('#sr').addEventListener('click', e => { const a = e.target.closest('[data-t]'); if (a) { e.preventDefault(); tab = a.dataset.t; sync(); draw(); } });
  if (q) run(); else draw();
  if (!q) $('#sq').focus({ preventScroll: true });
}

/* ---------------- global settings ---------------- */
async function importBundle(json) {
  let n = 0;
  for (const item of json.repos) { let name = item.repo.name; for (let i = 2; validateRepoName(name); i++) name = `${item.repo.name}-${i}`; await importRepoData(item, name); n++; }
  return n;
}
async function viewGlobalSettings(token, sec) {
  const est = await DB.estimate(), demo = S.repos.find(r => r.demo), theme = document.documentElement.getAttribute('data-theme');
  const nav = [['general', 'General', 'gear'], ['data', 'Data & storage', 'database'], ['keys', 'Shortcuts', 'command'], ['about', 'About', 'info']];
  const sections = {
    general: `<section class="set-sec"><h2>General</h2>
      <div class="set-row"><div><b>Appearance</b><small>Choose a dark or light interface.</small></div><div class="seg"><button class="${theme === 'dark' ? 'on' : ''}" data-act="set-theme" data-t="dark">${ic('moon')} Dark</button><button class="${theme === 'light' ? 'on' : ''}" data-act="set-theme" data-t="light">${ic('sun')} Light</button></div></div>
      <div class="set-row"><div><b>Profile</b><small>Name, username, bio and pinned repositories.</small></div><a class="btn" href="#/profile">${ic('user')}Open profile</a></div>
      <div class="set-row"><div><b>Demo repository</b><small>${demo ? 'A sample repository is installed.' : 'Install a small sample project to explore every feature.'}</small></div>${demo ? `<button class="btn btn-danger" data-act="remove-demo">${ic('trash')}Remove demo data</button>` : `<button class="btn" data-act="load-demo2">${ic('sparkle')}Load demo repository</button>`}</div></section>`,
    data: `<section class="set-sec"><h2>Data &amp; storage</h2>
      <div class="notice" style="margin-bottom:12px">${ic('database')}<span>${persistent ? 'All data is saved in this browser’s IndexedDB (<span class="mono">CodeRepoOfflineDB</span>) and survives refreshes and restarts.' : '<b>Storage is unavailable</b> — data will be lost when you close this tab.'}</span></div>
      ${est && est.quota ? `<div class="set-row"><div><b>Storage used</b><small>${fmtSize(est.usage)} of about ${fmtSize(est.quota)} available to this site</small><div class="bar"><i style="width:${Math.max(1, est.usage / est.quota * 100)}%"></i></div></div></div>` : ''}
      <div class="set-row"><div><b>Back up everything</b><small>Download all repositories as one .json file.</small></div><button class="btn" data-act="export-all">${ic('download')}Export all</button></div>
      <div class="set-row"><div><b>Import</b><small>Restore a backup or add a repository from .json / .zip.</small></div><button class="btn" data-act="import">${ic('upload')}Import…</button></div></section>
      <section class="set-sec"><h2 class="red">Danger zone</h2><div class="danger-zone"><div class="set-row"><div><b>Erase all local data</b><small>Deletes every repository, profile and setting stored by this app on this device.</small></div><button class="btn btn-danger" data-act="erase-all">Erase everything…</button></div></div></section>`,
    keys: `<section class="set-sec"><h2>Keyboard shortcuts</h2>${[['Ctrl / ⌘ + K', 'Open the command palette'], ['Ctrl / ⌘ + S', 'Commit while editing a file'], ['Ctrl / ⌘ + F', 'Find &amp; replace in the editor'], ['Tab / Shift + Tab', 'Indent / outdent in the editor'], ['Esc', 'Close dialogs and menus (in the editor: then Tab leaves the editor)']].map(([k, d]) => `<div class="set-row"><div>${d}</div><kbd>${k}</kbd></div>`).join('')}</section>`,
    about: `<section class="set-sec"><h2>About CodeRepo Offline</h2><p style="color:var(--text-2)">A GitHub-inspired repository manager that runs entirely in your browser with plain HTML, CSS and JavaScript. Repositories, files, commits, branches, issues and pull requests are <b>simulated locally</b> and saved in IndexedDB.</p>
      <div class="notice warn">${ic('alert')}<span>This is <b>not</b> GitHub and it never connects to GitHub or any server. Commits are not pushed anywhere. It is an independent project and is not affiliated with or endorsed by GitHub.</span></div>
      <dl class="kv" style="margin-top:14px"><dt>Version</dt><dd>1.0.0</dd><dt>Database</dt><dd class="mono">CodeRepoOfflineDB v${DB_VERSION}</dd><dt>Network</dt><dd>No requests are made by this app</dd></dl></section>`
  };
  const html = `<div class="page-h"><h1>Settings</h1></div><div class="sgrid2"><nav class="snav2" aria-label="Settings sections">${nav.map(([k, l, i]) => `<a href="#/settings/${k}" class="${k === sec ? 'on' : ''}">${ic(i)}${l}</a>`).join('')}</nav><div style="min-width:0">${sections[sec] || sections.general}</div></div>`;
  put(token, html);
}
ACTIONS['set-theme'] = el => { setTheme(el.dataset.t); render(); };
ACTIONS['load-demo2'] = async () => { const r = await createDemoRepo(); toast('Demo repository loaded'); go(H.repo(r)); };
ACTIONS['remove-demo'] = async () => {
  const d = S.repos.filter(r => r.demo); if (!d.length) return;
  if (!(await confirmDialog({ title: 'Remove demo data?', danger: true, confirmLabel: 'Remove demo', message: 'The demo repository and its files, commits, issues and pull requests will be deleted. Your own repositories are not affected.' }))) return;
  for (const r of d) await deleteRepository(r); toast('Demo data removed'); render();
};
ACTIONS['export-all'] = async () => {
  const items = []; for (const r of S.repos) items.push(await exportRepoData(r));
  downloadBlob(new Blob([JSON.stringify({ app: 'CodeRepo Offline', version: 1, bundle: true, exportedAt: Date.now(), user: S.user, repos: items })], { type: 'application/json' }), `coderepo-backup-${dayKey(Date.now())}.json`); toast('Backup downloaded');
};
ACTIONS['erase-all'] = async () => {
  if (!(await confirmDialog({ title: 'Erase all local data?', danger: true, confirmLabel: 'Erase everything', typeToConfirm: 'ERASE', message: 'This permanently deletes all repositories, files, commits, issues, pull requests, your profile and settings stored by this app. Export a backup first if you might need it.' }))) return;
  for (const s of Object.keys(STORES)) await DB.clear(s);
  try { localStorage.removeItem('cro-theme'); } catch (e) { /* ignore */ }
  location.hash = '#/'; location.reload();
};

/* ---------------- command palette ---------------- */
const inRepo = () => V.repo && /^#\/r\//.test(location.hash);
async function needRepo(fn) { const r = inRepo() ? V.repo : await repoPickModal('Choose a repository'); if (r) { if (!inRepo()) { V.repo = r; V.branch = r.defaultBranch; V.dir = ''; } fn(S.repos.find(x => x.id === r.id) || r); } }
function paletteCommands() {
  const b = () => V.branch || V.repo.defaultBranch;
  return [
    { l: 'Create repository', i: 'plus', run: () => go('#/new'), k: 'new repo' },
    { l: 'Search everything', i: 'search', run: () => go('#/search'), k: 'find' },
    { l: 'Create file', i: 'file-plus', run: () => needRepo(r => go(H.newFile(r, b(), inRepo() ? V.dir || '' : ''))), k: 'new file' },
    { l: 'Upload file', i: 'upload', run: () => needRepo(r => go(H.upload(r, b(), V.dir || ''))), k: 'upload files' },
    { l: 'Create branch', i: 'branch', run: () => needRepo(r => createBranchFlow(b())), k: 'new branch' },
    { l: 'View commits', i: 'history', run: () => needRepo(r => go(H.commits(r, b()))), k: 'history log' },
    { l: 'View branches', i: 'branch', run: () => needRepo(r => go(H.sub(r, 'branches'))) },
    { l: 'New issue', i: 'issue', run: () => needRepo(r => go(H.sub(r, 'issues/new'))) },
    { l: 'New pull request', i: 'pr', run: () => needRepo(r => go(H.sub(r, 'pulls/new'))) },
    { l: 'Download repository as ZIP', i: 'zip', run: () => needRepo(r => downloadRepoZip(r, b())) },
    { l: 'Open repository settings', i: 'gear', run: () => needRepo(r => go(H.sub(r, 'settings'))) },
    { l: 'Open settings', i: 'gear', run: () => go('#/settings'), k: 'preferences' },
    { l: 'Toggle theme', i: 'moon', run: toggleTheme, k: 'dark light' },
    { l: 'Go to dashboard', i: 'home', run: () => go('#/') },
    { l: 'Open profile', i: 'user', run: () => go('#/profile') },
    { l: 'Import repository', i: 'upload', run: importFlow }
  ];
}
function openPalette() {
  if ($('.palette')) return;
  const cmds = paletteCommands();
  let sel = 0, items = [];
  const p = openModal({ bare: true, cls: 'palette-back', noFocus: true, noEnter: true, body: `<div class="p-in">${ic('command', 'lg')}<input id="pal-q" placeholder="Type a command or search…" aria-label="Command palette" autocomplete="off" spellcheck="false"></div><div class="p-list" id="pal-l" role="listbox"></div><div class="p-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span><span><kbd>Enter</kbd> run</span><span><kbd>Esc</kbd> close</span></div>`,
    onOpen: ctx => {
      ctx.el.classList.add('palette'); const q = ctx.$('#pal-q'), list = ctx.$('#pal-l');
      const score = (t, s) => { t = t.toLowerCase(); if (!s) return 1; if (t.includes(s)) return 3 - t.indexOf(s) / 100; let i = 0; for (const ch of t) if (ch === s[i]) i++; return i === s.length ? 1 : 0; };
      const draw = () => {
        const s = q.value.trim().toLowerCase(), cmdOnly = s.startsWith('>'), term = cmdOnly ? s.slice(1).trim() : s;
        const c = cmds.map(x => ({ ...x, sc: score(x.l + ' ' + (x.k || ''), term) })).filter(x => x.sc).sort((a, b) => b.sc - a.sc);
        const rp = cmdOnly ? [] : S.repos.map(r => ({ l: r.name, i: r.visibility === 'private' ? 'lock' : 'repo', run: () => go(H.repo(r)), h: 'Repository', sc: score(r.name, term) })).filter(x => x.sc && term).sort((a, b) => b.sc - a.sc).slice(0, 6);
        const srch = term && !cmdOnly ? [{ l: `Search for “${q.value.trim()}”`, i: 'search', run: () => go('#/search?q=' + enc1(q.value.trim())), h: 'Search' }] : [];
        items = [...c, ...rp, ...srch]; sel = Math.min(sel, Math.max(0, items.length - 1));
        let html = '', last = '';
        items.forEach((x, n) => { const sec = c.includes(x) ? 'Commands' : rp.includes(x) ? 'Repositories' : 'Search'; if (sec !== last) { html += `<div class="p-sec">${sec}</div>`; last = sec; } html += `<button class="mi ${n === sel ? 'sel' : ''}" role="option" data-n="${n}">${ic(x.i)}<span class="mi-t">${esc(x.l)}</span>${x.h ? `<span class="mi-h">${x.h}</span>` : ''}</button>`; });
        list.innerHTML = html || '<div class="menu-empty">No matching commands</div>';
        list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
      };
      const run = n => { const it = items[n]; if (!it) return; ctx.close(); setTimeout(() => Promise.resolve(it.run()).catch(e => toast(e.message, 'err')), 30); };
      q.addEventListener('input', () => { sel = 0; draw(); });
      q.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, items.length); draw(); } else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % Math.max(1, items.length); draw(); } else if (e.key === 'Enter') { e.preventDefault(); run(sel); } });
      list.addEventListener('click', e => { const b = e.target.closest('[data-n]'); if (b) run(+b.dataset.n); });
      list.addEventListener('mousemove', e => { const b = e.target.closest('[data-n]'); if (b && +b.dataset.n !== sel) { sel = +b.dataset.n; $$('.mi', list).forEach((m, i) => m.classList.toggle('sel', i === sel)); } });
      draw(); setTimeout(() => q.focus(), 20);
    } });
  return p;
}
ACTIONS.palette = () => openPalette();
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('.palette') ? $('.modal-back.palette-back')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) : openPalette(); } });

/* ---------------- startup ---------------- */
async function init() {
  try { await openDB(); }
  catch (e) { persistent = false; console.warn('IndexedDB unavailable, using memory:', e); }
  await loadUser();
  try { const t = localStorage.getItem('cro-theme') || await getSetting('theme', null); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) { /* ignore */ }
  buildTopbar(); await loadRepos();
  window.addEventListener('hashchange', render);
  window.addEventListener('online', () => {}); // intentionally no network features
  await render();
  if (!persistent) openModal({ title: 'Storage unavailable', icon: 'alert', tone: 'warn', body: '<p style="margin:0;color:var(--text-2)">Your browser blocked IndexedDB (private mode or restricted storage). The app works, but <b>nothing will be saved</b> after you close or reload this tab. Use the export options to keep your work.</p>', actions: [{ label: 'I understand', kind: 'primary' }] });
  if (location.protocol.startsWith('http') && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.addEventListener('unhandledrejection', e => { console.error(e.reason); toast((e.reason && e.reason.message) || 'Something went wrong', 'err', 5000); });
init().catch(e => { console.error(e); $('#app').innerHTML = `<div class="view page-narrow"><div class="card"><div class="empty"><h3>Could not start</h3><p>${esc(e.message)}</p></div></div></div>`; });
})();
