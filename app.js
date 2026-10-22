'use strict';
const $ = s => document.querySelector(s);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const LS = localStorage, K = 'brankas.v1';
let items = [], key = null, salt = null, edit = false, tt, hid = 0;

/* ---------- crypto (AES-GCM + PBKDF2) ---------- */
const b64 = b => { let s = ''; new Uint8Array(b).forEach(c => s += String.fromCharCode(c)); return btoa(s); };
const ub = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function derive(pw, sl) {
  const m = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sl, iterations: 250000, hash: 'SHA-256' }, m, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function enc(k, obj, sl) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify(obj)));
  return { enc: true, salt: b64(sl), iv: b64(iv), ct: b64(ct) };
}
async function dec(k, o) {
  const p = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub(o.iv) }, k, ub(o.ct));
  return JSON.parse(new TextDecoder().decode(p));
}

/* ---------- storage ---------- */
async function save() {
  const o = key ? await enc(key, items, salt) : { enc: false, data: items };
  o.v = 1; LS[K] = JSON.stringify(o);
  navigator.storage?.persist?.();
}

/* ---------- ui helpers ---------- */
function toast(t) {
  const x = $('#toast'); x.textContent = t;
  try { x.hidePopover(); } catch {}
  try { x.showPopover(); } catch {}
  clearTimeout(tt); tt = setTimeout(() => { try { x.hidePopover(); } catch {} }, 1800);
}
function ask(title, { text = '', input = null, btns = ['Batal', 'OK'] } = {}) {
  return new Promise(res => {
    const d = $('#dlg2'); d.replaceChildren(); d.append(el('h3', null, title));
    if (text) d.append(el('p', null, text));
    let inp; if (input) { inp = el('input'); inp.type = input; inp.autocomplete = 'off'; d.append(inp); }
    const b = el('div', 'btns');
    btns.forEach((t, n) => {
      const x = el('button', n === btns.length - 1 ? 'pri' : null, t);
      x.addEventListener('click', () => { d.close(); res({ n, v: inp ? inp.value : '' }); });
      b.append(x);
    });
    d.append(b); d.oncancel = () => res({ n: -1, v: '' }); d.showModal(); if (inp) inp.focus();
  });
}
async function copy(t) {
  try { await navigator.clipboard.writeText(t); }
  catch { const a = el('textarea'); a.value = t; document.body.append(a); a.select(); document.execCommand('copy'); a.remove(); }
  toast('Disalin');
}

/* ---------- list ---------- */
function card(i) {
  const c = el('article', 'card');
  c.append(el('h2', null, i.title || '(tanpa judul)'));
  if (edit) { c.classList.add('ed'); c.addEventListener('click', () => editor(i)); }
  i.fields.forEach(f => {
    const r = el('div', 'row'), t = el('div', 'rt');
    const v = el('span', 'val', f.s ? '••••••••' : f.v);
    t.append(el('small', null, f.l || '—'), v); r.append(t);
    if (f.s) {
      const e = el('button', 'ic', '👁'); e.setAttribute('aria-label', 'Tampilkan');
      e.addEventListener('click', ev => { ev.stopPropagation(); const sh = v.dataset.sh === '1'; v.textContent = sh ? '••••••••' : f.v; v.dataset.sh = sh ? '0' : '1'; });
      r.append(e);
    }
    const cp = el('button', 'ic', 'Salin');
    cp.addEventListener('click', ev => { ev.stopPropagation(); copy(f.v); });
    r.append(cp); c.append(r);
  });
  return c;
}
function render() {
  const q = $('#q').value.toLowerCase(), L = $('#list'); L.replaceChildren();
  const rs = items.filter(i => !q || (i.title + ' ' + i.fields.map(f => f.l + ' ' + (f.s ? '' : f.v)).join(' ')).toLowerCase().includes(q))
    .sort((a, b) => a.title.localeCompare(b.title));
  if (!rs.length) { L.append(el('p', 'empty', items.length ? 'Tidak ada hasil.' : 'Belum ada data. Pilih Edit, lalu tekan +.')); return; }
  rs.forEach(i => L.append(card(i)));
}

/* ---------- editor (hanya mode Edit) ---------- */
function editor(i) {
  const d = i ? structuredClone(i) : { id: crypto.randomUUID(), title: '', fields: [{ l: 'User', v: '', s: false }, { l: 'Password', v: '', s: true }] };
  const dlg = $('#dlg'); dlg.replaceChildren();
  const ti = el('input'); ti.placeholder = 'Judul (mis. Instagram, Wi-Fi rumah)'; ti.value = d.title;
  const fl = el('div', 'form');
  const row = x => {
    const r = el('div', 'frow');
    const l = el('input'); l.placeholder = 'Label (User, PIN, …)'; l.value = x.l; l.setAttribute('list', 'labels');
    const v = el('textarea'); v.rows = 1; v.placeholder = 'Isi'; v.value = x.v;
    const s = el('label', 'chk'), cb = el('input'); cb.type = 'checkbox'; cb.checked = x.s; s.append(cb, 'Rahasia (disembunyikan)');
    const del = el('button', 'ic', '✕'); del.type = 'button'; del.addEventListener('click', () => r.remove());
    r.append(l, del, v, s); r._g = () => ({ l: l.value.trim(), v: v.value, s: cb.checked });
    fl.append(r);
  };
  d.fields.forEach(row);
  const b = el('div', 'btns');
  const mk = (t, c, f) => { const x = el('button', c, t); x.addEventListener('click', f); b.append(x); };
  if (i) mk('Hapus', 'dg', async () => {
    const r = await ask('Hapus "' + d.title + '"?', { btns: ['Batal', 'Hapus'] }); if (r.n < 1) return;
    items = items.filter(x => x.id !== d.id); await save(); dlg.close(); render();
  });
  mk('+ Kolom', '', () => row({ l: '', v: '', s: false }));
  mk('Batal', '', () => dlg.close());
  mk('Simpan', 'pri', async () => {
    const t = ti.value.trim(); if (!t) return toast('Judul wajib diisi');
    d.title = t; d.t = Date.now(); d.fields = [...fl.children].map(r => r._g()).filter(f => f.l || f.v);
    const n = items.findIndex(x => x.id === d.id); n < 0 ? items.push(d) : items[n] = d;
    await save(); dlg.close(); render();
  });
  const f = el('div', 'form'); f.append(el('h3', null, i ? 'Edit data' : 'Tambah data'), ti, fl, b);
  dlg.append(f); dlg.showModal();
}

/* ---------- ekspor / impor ---------- */
async function exportData() {
  const r = await ask('Ekspor data', { text: 'Isi password untuk mengenkripsi file (disarankan). Kosongkan untuk file JSON biasa.', input: 'password', btns: ['Batal', 'Ekspor'] });
  if (r.n < 1) return;
  let o;
  if (r.v) { const s = crypto.getRandomValues(new Uint8Array(16)); o = await enc(await derive(r.v, s), items, s); }
  else o = { enc: false, data: items };
  o.app = 'brankas'; o.v = 1;
  const a = el('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(o, null, 1)], { type: 'application/json' }));
  a.download = 'brankas-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function importData() { if (!edit) return toast('Pindah ke mode Edit dulu'); const f = $('#file'); f.value = ''; f.click(); }
$('#file').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const o = JSON.parse(await file.text()); let data;
    if (o.enc) {
      const r = await ask('File terenkripsi', { text: 'Masukkan password file ini.', input: 'password', btns: ['Batal', 'Buka'] }); if (r.n < 1) return;
      data = await dec(await derive(r.v, ub(o.salt)), o);
    } else data = o.data;
    if (!Array.isArray(data)) throw 0;
    data = data.filter(x => x && typeof x.title === 'string' && Array.isArray(x.fields)).map(x => ({
      id: String(x.id || crypto.randomUUID()), title: x.title, t: x.t || 0,
      fields: x.fields.map(f => ({ l: String(f.l ?? ''), v: String(f.v ?? ''), s: !!f.s }))
    }));
    const r = await ask('Impor ' + data.length + ' data', { text: 'Gabungkan dengan data saat ini, atau ganti semuanya?', btns: ['Batal', 'Gabungkan', 'Ganti semua'] });
    if (r.n < 1) return;
    if (r.n === 2) items = data;
    else { const m = new Map(items.map(x => [x.id, x])); data.forEach(x => m.set(x.id, x)); items = [...m.values()]; }
    await save(); render(); toast('Impor selesai');
  } catch { toast('File tidak valid atau password salah'); }
});

/* ---------- password master & kunci ---------- */
async function setMaster() {
  const a = await ask(key ? 'Ubah password master' : 'Pasang password master', { text: 'Data dienkripsi di perangkat ini. Jika lupa, data tidak bisa dipulihkan — simpan ekspor cadangan.', input: 'password', btns: ['Batal', 'Lanjut'] });
  if (a.n < 1) return; if (a.v.length < 6) return toast('Minimal 6 karakter');
  const b = await ask('Ulangi password', { input: 'password', btns: ['Batal', 'Simpan'] });
  if (b.n < 1) return; if (b.v !== a.v) return toast('Password tidak sama');
  salt = crypto.getRandomValues(new Uint8Array(16)); key = await derive(a.v, salt); await save(); buildMenu(); toast('Password master aktif');
}
async function removeMaster() {
  const r = await ask('Hapus password master?', { text: 'Data akan disimpan tanpa enkripsi.', btns: ['Batal', 'Hapus'] });
  if (r.n < 1) return; key = null; await save(); buildMenu();
}
function showLock() { document.body.classList.add('locked'); $('#lpw').value = ''; $('#lerr').textContent = ''; $('#lpw').focus(); }
function lockNow() { key = null; items = []; mode(false); showLock(); }
$('#lform').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const o = JSON.parse(LS[K]), s = ub(o.salt), k = await derive($('#lpw').value, s);
    items = await dec(k, o); key = k; salt = s;
    document.body.classList.remove('locked'); $('#lpw').value = ''; render(); buildMenu();
  } catch { $('#lerr').textContent = 'Password salah'; }
});

/* ---------- mode & menu ---------- */
function mode(e) {
  edit = e; $('#mEdit').classList.toggle('on', e); $('#mView').classList.toggle('on', !e);
  document.body.classList.toggle('edit', e); $('#fab').hidden = !e; buildMenu(); render();
}
function buildMenu() {
  const m = $('#menu'); m.replaceChildren();
  const add = (t, f) => { const b = el('button', null, t); b.addEventListener('click', () => { m.hidden = true; f(); }); m.append(b); };
  add('Ekspor data', exportData);
  add('Impor data' + (edit ? '' : ' (butuh mode Edit)'), importData);
  add(key ? 'Ubah password master' : 'Pasang password master', setMaster);
  if (key) { add('Hapus password master', removeMaster); add('Kunci sekarang', lockNow); }
}
$('#mView').addEventListener('click', () => mode(false));
$('#mEdit').addEventListener('click', () => mode(true));
$('#fab').addEventListener('click', () => editor());
$('#q').addEventListener('input', render);
$('#menuBtn').addEventListener('click', e => { e.stopPropagation(); $('#menu').hidden = !$('#menu').hidden; });
document.addEventListener('click', e => { if (!e.target.closest('#menu')) $('#menu').hidden = true; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hid = Date.now(); if (edit) mode(false); }
  else if (key && Date.now() - hid > 60000) lockNow();
});

/* ---------- start ---------- */
(() => {
  let o = null; try { o = LS[K] ? JSON.parse(LS[K]) : null; } catch {}
  if (o && o.enc) showLock(); else { items = o && Array.isArray(o.data) ? o.data : []; render(); }
  buildMenu();
})();
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
