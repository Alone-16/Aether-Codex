// ═══════════════════════════════════════════════════════
//  NOTES SECTION — Google-Keep-style notes, lists & images
// ═══════════════════════════════════════════════════════

import {
  VAULT_CRYPTO_KEY,
  VAULT_CRYPTO_SALT,
  VAULT_UNLOCKED,
  _b64,
  _unb64,
} from '../shared/crypto.js';

const NOTES_KEY     = 'ac_v4_notes';
const NOTES_ENC_KEY = 'ac_v4_notes_enc';

function loadNotes()  { return ls.get(NOTES_KEY) || []; }
function saveNotes(d) { NDATA = d; window.NDATA = d; ls.set(NOTES_KEY, d); ls.setStr(K.SAVED, String(Date.now())); if (typeof window.scheduleDriveSync === 'function') window.scheduleDriveSync('notes'); }

let NDATA          = loadNotes();
window.NDATA = NDATA;
let NSEARCH        = '';
let NPANEL         = null;
let NEDIT_ID       = null;
let NOTES_UNLOCKED = false;
let NDATA_PRIVATE  = [];
let _noteAutoSaveTimer = null;

const NOTE_COLORS = {
  default: { bg:'var(--surf2)', brd:'var(--brd)', label:'Default' },
  green:   { bg:'rgba(74,222,128,.1)', brd:'rgba(74,222,128,.28)', label:'Green'   },
  yellow:  { bg:'rgba(251,191,36,.1)', brd:'rgba(251,191,36,.28)', label:'Yellow'  },
  blue:    { bg:'rgba(56,189,248,.1)', brd:'rgba(56,189,248,.28)', label:'Blue'    },
  pink:    { bg:'rgba(244,114,182,.1)', brd:'rgba(244,114,182,.28)', label:'Pink'    },
  white:   { bg:'rgba(255,255,255,.06)', brd:'var(--brd2)', label:'White'   },
};

// ── Encrypted private notes (reuse vault crypto) ──
async function saveNotesEncrypted(data) {
  if (!VAULT_CRYPTO_KEY || !VAULT_CRYPTO_SALT) return;
  try {
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const buf = await crypto.subtle.encrypt(
      {name:'AES-GCM', iv}, VAULT_CRYPTO_KEY,
      new TextEncoder().encode(JSON.stringify(data))
    );
    ls.set(NOTES_ENC_KEY, {salt:_b64(VAULT_CRYPTO_SALT), iv:_b64(iv), data:_b64(buf), v:1});
    ls.setStr(K.SAVED, String(Date.now()));
    if (typeof window.scheduleDriveSync === 'function') window.scheduleDriveSync('notes');
  } catch(e) { console.warn('Notes encrypt failed:', e); }
}

async function _decryptPrivateNotes() {
  const stored = ls.get(NOTES_ENC_KEY);
  if (!stored?.data || !VAULT_CRYPTO_KEY) return [];
  try {
    const buf = await crypto.subtle.decrypt(
      {name:'AES-GCM', iv:_unb64(stored.iv)}, VAULT_CRYPTO_KEY, _unb64(stored.data)
    );
    return JSON.parse(new TextDecoder().decode(buf));
  } catch { return []; }
}

function unlockPrivateNotes() {
  const _afterUnlock = () => {
    _decryptPrivateNotes().then(data => {
      NDATA_PRIVATE  = data;
      NOTES_UNLOCKED = true;
      renderNotesBody();
    });
  };

  if (VAULT_UNLOCKED && VAULT_CRYPTO_KEY) { _afterUnlock(); return; }

  const hasPw  = ls.str('ac_vault_pw_set');
  const hasEnc = !!ls.get('ac_v4_vault_enc');
  if (hasPw && hasEnc) showVaultPasswordUnlock(_afterUnlock);
  else                 showVaultPasswordSetup(_afterUnlock);
}

function lockPrivateNotes() {
  NOTES_UNLOCKED = false;
  NDATA_PRIVATE  = [];
  if (NEDIT_ID && NDATA_PRIVATE.some(n => n.id === NEDIT_ID)) closeNotePanel();
  else renderNotesBody();
}

// ── Main render ──
function renderNotes(c) {
  c.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:18px">
      <div>
        <div class="page-ttl" style="margin-bottom:0">✎ <em>Notes</em></div>
        <div style="font-size:12px;color:var(--mu);margin-top:3px">Your thoughts, checklists &amp; ideas</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        ${NOTES_UNLOCKED
          ? `<button onclick="lockPrivateNotes()" style="height:28px;border-radius:5px;background:rgba(var(--ac-rgb),.1);border:1px solid rgba(var(--ac-rgb),.25);color:var(--ac);font-size:11px;font-weight:700;padding:0 10px;cursor:pointer">🔓 Lock Private</button>`
          : ''}
        <button class="nb-btn ac" onclick="openNewNote('text')">✎ Text</button>
        <button class="nb-btn" onclick="openNewNote('checklist')">☑ List</button>
        <button class="nb-btn" onclick="openNewNote('image')">🖼 Image</button>
      </div>
    </div>
    <div id="notes-body"></div>`;
  renderNotesBody();
}

function renderNotesBody() {
  const el = document.getElementById('notes-body'); if (!el) return;
  const q  = NSEARCH.toLowerCase();

  const flt = n =>
    !q || (n.title||'').toLowerCase().includes(q) ||
    (n.body||'').toLowerCase().includes(q) ||
    (n.items||[]).some(i => (i.text||'').toLowerCase().includes(q));

  const pub  = NDATA.filter(flt);
  const priv = NOTES_UNLOCKED ? NDATA_PRIVATE.filter(flt) : [];
  const all  = [...pub, ...priv].sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));

  const pinned  = all.filter(n =>  n.pinned);
  const regular = all.filter(n => !n.pinned);

  const hasPriv = !!ls.get(NOTES_ENC_KEY) || NDATA_PRIVATE.length > 0;

  let html = '';

  if (pinned.length) {
    html += `
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:var(--mu);margin-bottom:10px">📌 Pinned</div>
      <div class="notes-masonry" style="margin-bottom:24px">${pinned.map(noteCardHtml).join('')}</div>`;
  }
  if (regular.length) {
    if (pinned.length)
      html += `<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:var(--mu);margin-bottom:10px">Others</div>`;
    html += `<div class="notes-masonry">${regular.map(noteCardHtml).join('')}</div>`;
  }

  if (hasPriv && !NOTES_UNLOCKED) {
    html += `
      <div style="margin-top:${all.length?'20':'0'}px;${all.length?'padding-top:16px;border-top:1px solid var(--brd)':''}">
        <div style="text-align:center;padding:24px 16px;background:rgba(124,58,237,.04);border:1px solid rgba(124,58,237,.14);border-radius:8px">
          <div style="font-size:24px;margin-bottom:8px">🔒</div>
          <div style="font-size:13px;font-weight:600;color:var(--tx);margin-bottom:4px">Private notes are locked</div>
          <div style="font-size:12px;color:var(--mu);margin-bottom:14px">Enter your vault password to view encrypted notes</div>
          <button onclick="unlockPrivateNotes()" style="background:rgba(var(--ac-rgb),.18);color:var(--ac);border:1px solid rgba(var(--ac-rgb),.3);border-radius:5px;padding:8px 20px;font-size:12px;font-weight:700;cursor:pointer">🔐 Unlock Private</button>
        </div>
      </div>`;
  }

  if (!all.length && !hasPriv) {
    html = `<div class="empty">
      <div style="font-size:40px;margin-bottom:10px;opacity:.3">✎</div>
      <p style="font-size:14px;margin-bottom:14px">No notes yet — create your first one!</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button onclick="openNewNote('text')" style="background:var(--ac);color:#fff;border:none;border-radius:5px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer">+ Text Note</button>
        <button onclick="openNewNote('checklist')" style="background:var(--surf);color:var(--tx);border:1px solid var(--brd);border-radius:5px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer">+ Checklist</button>
        <button onclick="openNewNote('image')" style="background:var(--surf);color:var(--tx);border:1px solid var(--brd);border-radius:5px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer">+ Image Note</button>
      </div>
    </div>`;
  } else if (!all.length && q) {
    html = `<div class="empty"><div class="empty-ico" style="font-size:28px">✎</div><p>No notes match your search</p></div>`;
  }

  el.innerHTML = html;
}

// ── Note card ──
function noteCardHtml(n) {
  const col      = NOTE_COLORS[n.color||'default'];
  const isActive = NEDIT_ID === n.id;
  const typeIco  = n.type === 'checklist' ? '☑' : n.type === 'image' ? '🖼' : '✎';

  let body = '';
  if (n.type === 'image' && n.imageUrl) {
    body += `<img src="${esc(n.imageUrl)}" style="width:100%;border-radius:5px;margin-bottom:6px;max-height:150px;object-fit:cover" onerror="this.style.display='none'">`;
  }
  if (n.type === 'checklist' && (n.items||[]).length) {
    const done = n.items.filter(i=>i.checked).length;
    body += `<div style="font-size:10px;font-weight:600;color:var(--mu);margin-bottom:5px">${done}/${n.items.length} done</div>`;
    body += n.items.slice(0,6).map(i =>
      `<div style="display:flex;align-items:flex-start;gap:5px;margin-bottom:3px">
        <span style="font-size:11px;flex-shrink:0;margin-top:1px;color:var(--mu)">${i.checked?'☑':'☐'}</span>
        <span style="font-size:12px;line-height:1.4;color:${i.checked?'var(--mu)':'var(--tx)'};${i.checked?'text-decoration:line-through;':''}">${esc(i.text||'')}</span>
      </div>`
    ).join('');
    if (n.items.length > 6) body += `<div style="font-size:11px;color:var(--mu);margin-top:3px">+${n.items.length-6} more</div>`;
  } else if (n.body) {
    const prev = n.body.slice(0, 160);
    body += `<div style="font-size:12px;color:var(--tx2);line-height:1.55;white-space:pre-wrap;word-break:break-word">${esc(prev)}${n.body.length>160?'…':''}</div>`;
  }

  const dateStr = n.updatedAt
    ? new Date(n.updatedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'})
    : '';

  return `<div class="note-card${isActive?' note-card-active':''}"
    style="background:${col.bg};border:1px solid ${col.brd}"
    onclick="openNoteDetail('${n.id}')">
    <div style="display:flex;align-items:center;gap:3px;margin-bottom:${n.title?'6':'2'}px;min-height:14px">
      ${n.pinned   ? '<span style="font-size:11px">📌</span>' : ''}
      ${n.locked   ? '<span style="font-size:11px">🔒</span>' : ''}
      <span style="margin-left:auto;font-size:10px;color:var(--mu);opacity:.55">${typeIco}</span>
    </div>
    ${n.title ? `<div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:6px;line-height:1.3">${esc(n.title)}</div>` : ''}
    <div>${body}</div>
    ${dateStr ? `<div style="font-size:10px;color:var(--mu);margin-top:8px;opacity:.65">${dateStr}</div>` : ''}
    <div class="note-hover-actions" onclick="event.stopPropagation()">
      <button onclick="quickNotePin('${n.id}')" title="${n.pinned?'Unpin':'Pin'}"
        style="width:22px;height:22px;border-radius:4px;background:rgba(0,0,0,.08);border:none;cursor:pointer;font-size:10px">${n.pinned?'📌':'📌'}</button>
      <button onclick="quickNoteDelete('${n.id}')" title="Delete"
        style="width:22px;height:22px;border-radius:4px;background:rgba(251,113,133,.12);border:none;cursor:pointer;font-size:10px;color:#fb7185">🗑</button>
    </div>
  </div>`;
}

// ── Open / Create ──
function openNoteDetail(id) {
  const note = NDATA.find(n=>n.id===id) || NDATA_PRIVATE.find(n=>n.id===id);
  if (!note) return;
  NEDIT_ID = id; NPANEL = 'edit';
  _openNotePanel(note);
  renderNotesBody();
}

function openNewNote(type='text') {
  const note = {
    id: uid(), type,
    title: '', body: '',
    items: type==='checklist' ? [{id:uid(),text:'',checked:false}] : [],
    imageUrl: '',
    color: 'default', pinned: false, locked: false,
    addedAt: Date.now(), updatedAt: Date.now(),
  };
  NDATA.unshift(note);
  saveNotes(NDATA);
  NEDIT_ID = note.id; NPANEL = 'add';
  _openNotePanel(note);
  renderNotesBody();
}

function _openNotePanel(note) {
  document.getElementById('rpanel').classList.add('open');
  document.getElementById('poverlay').classList.add('show');
  document.getElementById('content').classList.add('pushed');
  document.getElementById('poverlay').onclick = closeNotePanel;
  renderNotePanelEdit(note);
}

// ── Panel editor ──
function renderNotePanelEdit(note) {
  const col    = NOTE_COLORS[note.color||'default'];
  const swatches = Object.entries(NOTE_COLORS).map(([k,v]) =>
    `<button onclick="changeNoteColor('${k}')" title="${v.label}"
      style="width:20px;height:20px;border-radius:50%;background:${v.bg};border:2px solid ${(note.color||'default')===k?'var(--tx)':v.brd};cursor:pointer;transition:all .12s;flex-shrink:0"></button>`
  ).join('');

  let editorHtml = '';

  if (note.type === 'image') {
    editorHtml += `
      <div class="fg">
        <label class="flbl">Image URL</label>
        <input class="fin" id="nf-img" type="url" placeholder="https://..."
          value="${esc(note.imageUrl||'')}" oninput="onNoteImgInput(this.value)">
        <div id="nf-img-wrap" style="${note.imageUrl?'':'display:none'}">
          <img id="nf-img-preview" src="${esc(note.imageUrl||'')}"
            style="width:100%;border-radius:6px;margin-top:8px;max-height:220px;object-fit:cover"
            onerror="this.style.display='none'" onload="this.style.display='block'">
        </div>
      </div>`;
  }

  if (note.type === 'checklist') {
    editorHtml += `
      <div class="fg">
        <label class="flbl">Items</label>
        <div id="nf-items">${(note.items||[]).map((item,i) => _checklistItemHtml(item,i)).join('')}</div>
        <button onclick="addChecklistItem()"
          style="width:100%;padding:8px;border:1px dashed var(--brd);border-radius:5px;color:var(--mu);background:none;font-size:12px;cursor:pointer;margin-top:6px;text-align:left">
          + Add item
        </button>
      </div>`;
  }

  if (note.type === 'text' || note.type === 'image') {
    editorHtml += `
      <div class="fg" ${note.type==='image'?'style="margin-top:8px"':''}>
        <label class="flbl">${note.type==='image'?'Caption':'Content'}</label>
        <textarea class="fin" id="nf-body" oninput="scheduleNoteAutoSave()"
          placeholder="${note.type==='image'?'Add a caption...':'Start writing...'}"
          style="min-height:${note.type==='image'?'70':'180'}px;resize:vertical;font-size:13px;line-height:1.6">${esc(note.body||'')}</textarea>
      </div>`;
  }

  document.getElementById('panel-inner').innerHTML = `
    <div class="ph" style="background:${col.bg};border-color:${col.brd}">
      <div style="flex:1;min-width:0">
        <input id="nf-title" placeholder="${note.type==='checklist'?'List title...':'Note title...'}"
          value="${esc(note.title||'')}" oninput="scheduleNoteAutoSave()"
          style="background:transparent;border:none;outline:none;width:100%;font-size:15px;font-weight:700;color:var(--tx);font-family:var(--fd);padding:0">
        <div style="display:flex;align-items:center;gap:5px;margin-top:9px;flex-wrap:wrap">
          ${swatches}
          <div id="note-save-ind" style="font-size:10px;color:#4ade80;margin-left:auto;opacity:0;transition:opacity .3s">✓ Saved</div>
        </div>
      </div>
      <button onclick="closeNotePanel()"
        style="width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,.1);border:none;font-size:14px;cursor:pointer;flex-shrink:0;margin-left:10px">✕</button>
    </div>
    <div class="form-wrap">${editorHtml}</div>
    <div class="panel-actions" style="background:${col.bg};border-top:1px solid ${col.brd}">
      <button class="btn-del" onclick="quickNoteDelete('${note.id}')">🗑</button>
      <button class="btn-cancel" onclick="toggleNotePin('${note.id}')" style="color:${note.pinned?'#fbbf24':'var(--tx2)'}">
        ${note.pinned?'📌 Pinned':'📌 Pin'}
      </button>
      <button class="btn-cancel" onclick="toggleNoteLock('${note.id}')" style="color:${note.locked?'#a78bfa':'var(--tx2)'}">
        ${note.locked?'🔒 Locked':'🔓 Lock'}
      </button>
    </div>`;

  setTimeout(() => { const t=document.getElementById('nf-title'); if(t&&!note.title)t.focus(); }, 80);
}

function onNoteImgInput(url) {
  scheduleNoteAutoSave();
  const wrap = document.getElementById('nf-img-wrap');
  const prev = document.getElementById('nf-img-preview');
  if (!wrap || !prev) return;
  if (url) { wrap.style.display = 'block'; prev.src = url; }
  else wrap.style.display = 'none';
}

// ── Auto-save ──
function scheduleNoteAutoSave() {
  clearTimeout(_noteAutoSaveTimer);
  _noteAutoSaveTimer = setTimeout(commitNoteAutoSave, 700);
}

function commitNoteAutoSave() {
  const id = NEDIT_ID; if (!id) return;
  const isPriv = NDATA_PRIVATE.some(n=>n.id===id);
  const arr    = isPriv ? NDATA_PRIVATE : NDATA;
  const idx    = arr.findIndex(n=>n.id===id); if (idx<0) return;
  const note   = {...arr[idx]};

  const titleEl = document.getElementById('nf-title');
  const bodyEl  = document.getElementById('nf-body');
  const imgEl   = document.getElementById('nf-img');

  if (titleEl) note.title    = titleEl.value;
  if (bodyEl)  note.body     = bodyEl.value;
  if (imgEl)   note.imageUrl = imgEl.value;
  if (note.type === 'checklist') note.items = _collectChecklistItems();
  note.updatedAt = Date.now();

  arr[idx] = note;
  if (isPriv) saveNotesEncrypted(NDATA_PRIVATE);
  else        saveNotes(NDATA);

  const ind = document.getElementById('note-save-ind');
  if (ind) { ind.style.opacity='1'; setTimeout(()=>{ if(ind)ind.style.opacity='0'; }, 1500); }
}

// ── Checklist helpers ──
function _checklistItemHtml(item, idx) {
  return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px" id="cli-${item.id}">
    <input type="checkbox" ${item.checked?'checked':''} onchange="_onCBToggle(this,'${item.id}')"
      style="width:14px;height:14px;cursor:pointer;accent-color:var(--ac);flex-shrink:0">
    <input class="fin" value="${esc(item.text||'')}" placeholder="Item..."
      oninput="scheduleNoteAutoSave()"
      style="flex:1;padding:5px 7px;font-size:13px;${item.checked?'text-decoration:line-through;color:var(--mu);':''}">
    <button onclick="_removeCLItem('${item.id}')"
      style="width:20px;height:20px;border-radius:3px;background:none;border:1px solid var(--brd);color:var(--mu);font-size:10px;cursor:pointer;flex-shrink:0">✕</button>
  </div>`;
}

function _onCBToggle(cb, itemId) {
  const row = document.getElementById(`cli-${itemId}`);
  if (row) {
    const inp = row.querySelector('input:not([type="checkbox"])');
    if (inp) { inp.style.textDecoration = cb.checked?'line-through':'none'; inp.style.color = cb.checked?'var(--mu)':''; }
  }
  scheduleNoteAutoSave();
}

function addChecklistItem() {
  commitNoteAutoSave();
  const id = NEDIT_ID; if (!id) return;
  const isPriv = NDATA_PRIVATE.some(n=>n.id===id);
  const arr    = isPriv ? NDATA_PRIVATE : NDATA;
  const idx    = arr.findIndex(n=>n.id===id); if (idx<0) return;
  const item   = {id:uid(), text:'', checked:false};
  if (!arr[idx].items) arr[idx].items = [];
  arr[idx].items.push(item);
  arr[idx].updatedAt = Date.now();
  if (isPriv) saveNotesEncrypted(arr); else saveNotes(arr);
  const container = document.getElementById('nf-items');
  if (container) {
    const d = document.createElement('div');
    d.innerHTML = _checklistItemHtml(item, arr[idx].items.length-1);
    container.appendChild(d.firstElementChild);
    setTimeout(() => { const inp = container.lastElementChild?.querySelector('input:not([type="checkbox"])'); if(inp)inp.focus(); }, 40);
  }
}

function _removeCLItem(itemId) {
  const el = document.getElementById(`cli-${itemId}`);
  if (el) el.remove();
  scheduleNoteAutoSave();
}

function _collectChecklistItems() {
  const items = [];
  document.querySelectorAll('#nf-items > div[id^="cli-"]').forEach(el => {
    const cb  = el.querySelector('input[type="checkbox"]');
    const inp = el.querySelector('input:not([type="checkbox"])');
    if (!inp) return;
    items.push({id:el.id.replace('cli-',''), text:inp.value, checked:cb?.checked||false});
  });
  return items;
}

// ── Note actions ──
function changeNoteColor(color) {
  const id = NEDIT_ID; if (!id) return;
  const isPriv = NDATA_PRIVATE.some(n=>n.id===id);
  const arr    = isPriv ? NDATA_PRIVATE : NDATA;
  const idx    = arr.findIndex(n=>n.id===id); if (idx<0) return;
  commitNoteAutoSave();
  arr[idx].color = color; arr[idx].updatedAt = Date.now();
  if (isPriv) saveNotesEncrypted(arr); else saveNotes(arr);
  renderNotePanelEdit(arr[idx]);
  renderNotesBody();
}

function toggleNotePin(id) {
  const isPriv = NDATA_PRIVATE.some(n=>n.id===id);
  const arr    = isPriv ? NDATA_PRIVATE : NDATA;
  const idx    = arr.findIndex(n=>n.id===id); if (idx<0) return;
  commitNoteAutoSave();
  arr[idx].pinned = !arr[idx].pinned; arr[idx].updatedAt = Date.now();
  if (isPriv) saveNotesEncrypted(arr); else saveNotes(arr);
  renderNotePanelEdit(arr[idx]);
  renderNotesBody();
}

function quickNotePin(id) {
  const isPriv = NDATA_PRIVATE.some(n=>n.id===id);
  const arr    = isPriv ? NDATA_PRIVATE : NDATA;
  const note   = arr.find(n=>n.id===id); if (!note) return;
  note.pinned = !note.pinned; note.updatedAt = Date.now();
  if (isPriv) saveNotesEncrypted(arr); else saveNotes(arr);
  renderNotesBody();
}

function quickNoteDelete(id) {
  showConfirm('Delete this note permanently?', () => {
    clearTimeout(_noteAutoSaveTimer);
    const pi = NDATA_PRIVATE.findIndex(n=>n.id===id);
    const ni = NDATA.findIndex(n=>n.id===id);
    if (pi >= 0) { NDATA_PRIVATE.splice(pi,1); saveNotesEncrypted(NDATA_PRIVATE); }
    else if (ni >= 0) { NDATA.splice(ni,1); saveNotes(NDATA); }
    if (NEDIT_ID === id) {
      NEDIT_ID = null; NPANEL = null;
      document.getElementById('rpanel').classList.remove('open');
      document.getElementById('poverlay').classList.remove('show');
      document.getElementById('content').classList.remove('pushed');
      document.getElementById('poverlay').onclick = closePanel;
    }
    renderNotesBody();
  }, {title:'Delete Note?', okLabel:'Delete'});
}

function toggleNoteLock(id) {
  const note = NDATA.find(n=>n.id===id) || NDATA_PRIVATE.find(n=>n.id===id);
  if (!note) return;
  if (!note.locked) {
    // Lock it — need vault unlocked
    if (!VAULT_UNLOCKED || !VAULT_CRYPTO_KEY) {
      const hasPw  = ls.str('ac_vault_pw_set');
      const hasEnc = !!ls.get('ac_v4_vault_enc');
      const proceed = () => _doNoteLock(id, true);
      if (hasPw && hasEnc) showVaultPasswordUnlock(proceed);
      else                 showVaultPasswordSetup(proceed);
    } else {
      _doNoteLock(id, true);
    }
  } else {
    if (!NOTES_UNLOCKED) { showAlert('Unlock private notes first.', {title:'Unlock Required'}); return; }
    _doNoteLock(id, false);
  }
}

function _doNoteLock(id, lock) {
  commitNoteAutoSave();
  if (lock) {
    const note = NDATA.find(n=>n.id===id); if (!note) return;
    NDATA = NDATA.filter(n=>n.id!==id); saveNotes(NDATA);
    note.locked = true; note.updatedAt = Date.now();
    NDATA_PRIVATE.unshift(note);
    NOTES_UNLOCKED = true;
    saveNotesEncrypted(NDATA_PRIVATE);
    renderNotePanelEdit(note);
  } else {
    const note = NDATA_PRIVATE.find(n=>n.id===id); if (!note) return;
    NDATA_PRIVATE = NDATA_PRIVATE.filter(n=>n.id!==id); saveNotesEncrypted(NDATA_PRIVATE);
    note.locked = false; note.updatedAt = Date.now();
    NDATA.unshift(note); saveNotes(NDATA);
    renderNotePanelEdit(note);
  }
  renderNotesBody();
}

function closeNotePanel() {
  clearTimeout(_noteAutoSaveTimer);
  commitNoteAutoSave();
  NEDIT_ID = null; NPANEL = null;
  document.getElementById('rpanel').classList.remove('open');
  document.getElementById('poverlay').classList.remove('show');
  document.getElementById('content').classList.remove('pushed');
  document.getElementById('poverlay').onclick = closePanel;
  render();
}


// ── Register all notes functions as globals ───────────────────────────────
Object.assign(window, {
  renderNotes, renderNotesBody,
  noteCardHtml,
  openNoteDetail, openNewNote,
  renderNotePanelEdit,
  onNoteImgInput, scheduleNoteAutoSave, commitNoteAutoSave,
  addChecklistItem,
  changeNoteColor, toggleNotePin, quickNotePin, quickNoteDelete, toggleNoteLock,
  closeNotePanel,
  unlockPrivateNotes, lockPrivateNotes,
  saveNotes,
});
