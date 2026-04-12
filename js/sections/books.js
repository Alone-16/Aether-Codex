// ═══════════════════════════════════════════════════════
//  BOOKS DATA & STATE
// ═══════════════════════════════════════════════════════
const BOOKS_KEY = 'ac_v4_books';

function loadBooks()  { return ls.get(BOOKS_KEY) || []; }
function saveBooks(d) { BDATA = d; window.BDATA = d; ls.set(BOOKS_KEY, d); ls.setStr(K.SAVED, String(Date.now())); window.scheduleDriveSync(); }

let BDATA      = loadBooks();
window.BDATA = BDATA;
let BOOKS_PAGE = 'list';
let BSEARCH    = '';
let BGENRE     = 'novel'; // sub-category: novel | audiobook
let BPANEL     = null;
let BPEDIT     = null;
let BFORM_TL   = [];
let BCOLLAPSED = {};

const BOOK_GENRES = [
  { id:'novel',     name:'Novel',     color:'#1a1a2e' },
  { id:'audiobook', name:'Audiobook', color:'#6366f1' },
  { id:'manga',     name:'Manga',     color:'#dc2626' },
  { id:'light_novel', name:'Light Novel', color:'#7c3aed' },
];

const BS_LABEL = { reading:'📖 Reading', completed:'✓ Completed', want:'◎ Want to Read', on_hold:'⏸ On Hold', dropped:'✗ Dropped' };
const BS_COLOR = { reading:'#38bdf8', completed:'#4ade80', want:'#a78bfa', on_hold:'#fbbf24', dropped:'#fb7185' };
const BS_ORDER = ['reading','want','on_hold','completed','dropped'];
const BS_SECTION = {
  reading:   ['#38bdf8','READING'],
  want:      ['#a78bfa','WANT TO READ'],
  on_hold:   ['#fbbf24','ON HOLD'],
  completed: ['#4ade80','COMPLETED'],
  dropped:   ['#fb7185','DROPPED'],
};

function bstag(s) {
  return `<span class="stag" style="background:${BS_COLOR[s]}1a;color:${BS_COLOR[s]};font-family:var(--fb)">${BS_LABEL[s]||s}</span>`;
}

// ═══════════════════════════════════════════════════════
//  BOOKS RENDER
// ═══════════════════════════════════════════════════════
function renderBooks(c) {
  const tabs = ['List','Dashboard','Upcoming'];
  const genreOpts = BOOK_GENRES.map(g =>
    `<button class="stab${BGENRE===g.id?' active':''}" onclick="setBGenre('${g.id}')" style="font-family:var(--fb)">${g.name}</button>`
  ).join('');

  c.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div class="sub-tabs" style="font-family:var(--fb)">
          ${tabs.map((t,i) => `<button class="stab${BOOKS_PAGE===['list','dashboard','upcoming'][i]?' active':''}" onclick="setBooksPage('${['list','dashboard','upcoming'][i]}')" style="font-family:var(--fb)">${t}</button>`).join('')}
        </div>
        <div class="sub-tabs">${genreOpts}</div>
      </div>
      <button class="nb-btn ac" onclick="openAddBook()" style="font-family:var(--fb);font-weight:700">+ Add Book</button>
    </div>
    <div id="books-body"></div>`;
  renderBooksBody();
}

function setBooksPage(p) { BOOKS_PAGE=p; BSEARCH=''; document.getElementById('srch').value=''; renderBooksBody(); }
function setBGenre(g)    { BGENRE=g; renderBooksBody(); }

function renderBooksBody() {
  const el = document.getElementById('books-body'); if (!el) return;
  if (BOOKS_PAGE==='list')       renderBooksList(el);
  else if (BOOKS_PAGE==='dashboard') renderBooksDash(el);
  else if (BOOKS_PAGE==='upcoming')  renderBooksUpcoming(el);
  document.querySelectorAll('.stab').forEach((t,i) => {
    if (['list','dashboard','upcoming'].includes(['list','dashboard','upcoming'][i]))
      t.classList.toggle('active', ['list','dashboard','upcoming'][i] === BOOKS_PAGE);
  });
}

// ── LIST ──
function filteredBooks() {
  let d = BDATA.filter(b => b.genreId === BGENRE);
  if (BSEARCH) d = d.filter(b => b.title.toLowerCase().includes(BSEARCH) || (b.author||'').toLowerCase().includes(BSEARCH));
  const fst = document.getElementById('fstatus')?.value || '';
  if (fst) d = d.filter(b => b.status === fst);
  return d.sort((a,b) => a.title.localeCompare(b.title));
}

function bookEntryStats(b) {
  const vols = b.volumes || [];
  if (!vols.length) {
    const cur = parseInt(b.currentPage||0), tot = parseInt(b.totalPages||0);
    const pct = tot ? Math.round(cur/tot*100) : 0;
    return { cur, tot, pct };
  }
  let cur=0, tot=0;
  vols.forEach(v => { cur += parseInt(v.pagesRead||0); tot += parseInt(v.totalPages||0); });
  return { cur, tot, pct: tot ? Math.round(cur/tot*100) : 0 };
}

function renderBooksList(c) {
  const data = filteredBooks();
  if (!data.length) {
    c.innerHTML = `<div class="empty" style="font-family:var(--fb)"><div class="empty-ico">📚</div><p>No books yet — add your first one!</p></div>`;
    return;
  }
  const byS = {};
  BS_ORDER.forEach(s => { byS[s] = data.filter(b => b.status === s); });
  let html = '';
  BS_ORDER.forEach(s => {
    const rows = byS[s]; if (!rows?.length) return;
    const [col,lbl] = BS_SECTION[s];
    const coll = BCOLLAPSED['b_'+s];
    html += `<div class="ss-section">
      <div class="ss-head" onclick="toggleBColl('${s}')">
        <span class="ss-lbl" style="color:${col};font-family:var(--fd);letter-spacing:1px">${lbl}</span>
        <span class="ss-cnt">${rows.length}</span>
        <span class="ss-line" style="background:${col}33"></span>
        <span class="ss-arr${coll?' coll':''}">▾</span>
      </div>
      <div class="ss-rows${coll?' coll':''}">
        ${rows.map(b => bookRowHtml(b)).join('')}
      </div>
    </div>`;
  });
  c.innerHTML = html;
}

function bookRowHtml(b) {
  const isA = BPANEL && BPEDIT === b.id;
  const st = bookEntryStats(b);
  const col = BS_COLOR[b.status] || 'var(--ac)';
  const vols = b.volumes || [];
  const activeVol = vols.find(v => v.status === 'reading') || vols[vols.length-1];
  const hasBar = st.tot > 0 || st.cur > 0;

  return `<div class="row${isA?' active-row':''}" id="brow-${b.id}"
    style="border:2px solid var(--brd);border-radius:8px;box-shadow:2px 2px 0 var(--brd);margin-bottom:3px"
    onclick="openBookDetail('${b.id}')">
    <div class="row-bar" style="background:${col}"></div>
    <div class="row-info">
      <div class="row-title" style="font-family:var(--fb);font-weight:700">${esc(b.title)}</div>
      <div class="row-meta">
        ${bstag(b.status)}
        ${b.author?`<span style="font-size:11px;color:var(--tx2);font-family:var(--fb)">${esc(b.author)}</span>`:''}
        ${vols.length?`<span style="font-size:10px;color:var(--mu)">${vols.length} vol${vols.length!==1?'s':''}</span>`:''}
      </div>
    </div>
    <div class="row-r">
      ${hasBar?`<div class="row-prog">
        <div class="prog-bar"><div class="prog-fill" style="width:${st.pct}%;background:${col}"></div></div>
        <span class="prog-txt" style="font-family:var(--fb)">${st.cur}${st.tot?'/'+st.tot:''}p</span>
      </div>`:''}
      <div class="row-btns" onclick="event.stopPropagation()">
        ${b.status==='reading'&&hasBar?`<div class="ep-inline">
          <button class="ep-pm" onclick="quickBookPage('${b.id}',-10)">−</button>
          <span class="ep-val" style="font-family:var(--fb)">${st.cur}</span>
          <button class="ep-pm" onclick="quickBookPage('${b.id}',10)">+</button>
        </div>`:''}
        <button class="rbt" onclick="openEditBook('${b.id}')">✏</button>
        <button class="rbt del" onclick="askDelBook('${b.id}')">✕</button>
      </div>
    </div>
  </div>`;
}

function toggleBColl(s) { BCOLLAPSED['b_'+s] = !BCOLLAPSED['b_'+s]; renderBooksBody(); }

function quickBookPage(id, delta) {
  const b = BDATA.find(x=>x.id===id); if(!b) return;
  const vols = b.volumes||[];
  if (vols.length) {
    const av = vols.find(v=>v.status==='reading') || vols[vols.length-1];
    if (av) {
      const cur = Math.max(0, parseInt(av.pagesRead||0)+delta);
      av.pagesRead = av.totalPages ? Math.min(cur, parseInt(av.totalPages)) : cur;
      if (av.totalPages && av.pagesRead >= parseInt(av.totalPages) && av.status==='reading') av.status='completed';
    }
  } else {
    b.currentPage = Math.max(0, parseInt(b.currentPage||0)+delta);
    if (b.totalPages && b.currentPage >= parseInt(b.totalPages) && b.status==='reading') { b.status='completed'; b.endDate=today(); }
  }
  b.updatedAt = Date.now(); saveBooks(BDATA); renderBooksBody();
  if (BPANEL==='detail' && BPEDIT===id) renderBookDetailPanel(BDATA.find(x=>x.id===id));
}

// ── DETAIL PANEL ──
function openBookDetail(id) {
  BPANEL='detail'; BPEDIT=id;
  document.getElementById('rpanel').classList.add('open');
  document.getElementById('poverlay').classList.add('show');
  document.getElementById('content').classList.add('pushed');
  const b = BDATA.find(x=>x.id===id); if(b) renderBookDetailPanel(b);
}

function renderBookDetailPanel(b) {
  const st = bookEntryStats(b);
  const vols = b.volumes||[];
  const volsHtml = vols.length ? vols.map((v,i) => {
    const cur = parseInt(v.pagesRead||0), tot = parseInt(v.totalPages||0);
    const pct = tot ? Math.round(cur/tot*100) : 0;
    return `<div style="background:var(--surf2);border:2px solid var(--brd);border-radius:7px;box-shadow:2px 2px 0 var(--brd);padding:10px 12px;margin-bottom:5px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <span style="font-family:var(--fb);font-weight:700;font-size:13px">${esc(v.name||`Volume ${i+1}`)}</span>
        ${bstag(v.status||'want')}
      </div>
      <div style="font-size:11px;color:var(--tx2);font-family:var(--fb)">${cur}${tot?'/'+tot:''}p${v.rating?' · ★'+v.rating:''}</div>
      ${tot?`<div style="height:3px;background:var(--surf3);border-radius:2px;margin-top:6px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${BS_COLOR[v.status]||'var(--ac)'};border-radius:2px"></div></div>`:''}
    </div>`;
  }).join('') : `<div style="color:var(--mu);font-size:13px;font-family:var(--fb)">No volumes — tracking as single book</div>`;

  document.getElementById('panel-inner').innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title" style="font-family:var(--fd);letter-spacing:1px;font-size:18px">${esc(b.title)}</div>
        <div class="pbadges">
          ${bstag(b.status)}
          ${b.author?`<span style="font-size:11px;color:var(--tx2);font-family:var(--fb)">by ${esc(b.author)}</span>`:''}
          ${b.favorite?'<span style="color:#fbbf24">★</span>':''}
        </div>
      </div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    <div class="pstats">
      <div class="pstat"><div class="pstat-v" style="font-family:var(--fd)">${st.tot||'—'}</div><div class="pstat-l">Pages</div></div>
      <div class="pstat"><div class="pstat-v" style="font-family:var(--fd)">${st.cur}</div><div class="pstat-l">Read</div></div>
      <div class="pstat"><div class="pstat-v" style="font-family:var(--fd)">${st.pct}%</div><div class="pstat-l">Progress</div><div class="pprog"><div class="pprog-fill" style="width:${st.pct}%"></div></div></div>
      <div class="pstat"><div class="pstat-v" style="font-family:var(--fd)">${b.rating||'—'}</div><div class="pstat-l">Rating</div></div>
    </div>
    ${(b.startDate||b.endDate)?`<div style="padding:7px 16px;border-bottom:1px solid var(--brd);display:flex;gap:14px;font-size:11px;font-family:var(--fb);color:var(--tx2)">
      ${b.startDate?`<span>Started: <b>${fmtDate(b.startDate)}</b></span>`:''}
      ${b.endDate?`<span>Finished: <b>${fmtDate(b.endDate)}</b></span>`:''}
    </div>`:''}
    <div class="sec-div"><span class="sec-div-lbl" style="font-family:var(--fd);letter-spacing:1px">Volumes / Series</span><div class="sec-div-line"></div></div>
    <div style="padding:0 16px 8px">${volsHtml}</div>
    ${b.notes?`<div class="sec-div"><span class="sec-div-lbl" style="font-family:var(--fd)">Notes</span><div class="sec-div-line"></div></div>
    <div class="pnotes"><div class="pnotes-box" style="font-family:var(--fb)">${esc(b.notes)}</div></div>`:''}
    <div class="panel-actions">
      <button class="btn-del" onclick="askDelBook('${b.id}')">Delete</button>
      <button class="btn-cancel" onclick="openEditBook('${b.id}')">Edit</button>
    </div>`;
}

// ── FORM ──
function openAddBook()    { BPANEL='add';  BPEDIT=null; openBookForm(null); }
function openEditBook(id) { BPANEL='edit'; BPEDIT=id;   openBookForm(BDATA.find(x=>x.id===id)); }

function openBookForm(b) {
  document.getElementById('rpanel').classList.add('open');
  document.getElementById('poverlay').classList.add('show');
  document.getElementById('content').classList.add('pushed');
  BFORM_TL = b ? JSON.parse(JSON.stringify(b.volumes||[])) : [];
  renderBookFormPanel(b);
}

function renderBookFormPanel(b) {
  const isEdit = !!b;
  const status = b ? b.status : 'want';
  const genreId = b ? b.genreId : BGENRE;
  const gOpts = BOOK_GENRES.map(g => `<option value="${g.id}" ${genreId===g.id?'selected':''}>${g.name}</option>`).join('');

  document.getElementById('panel-inner').innerHTML = `
    <div class="ph">
      <div class="ph-title" style="font-family:var(--fd);letter-spacing:1px;font-size:18px">${isEdit?'Edit Book':'Add New Book'}</div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    <div class="form-wrap" style="font-family:var(--fb)">
      <div class="fg">
        <label class="flbl">Title *</label>
        <input class="fin" id="bf-title" placeholder="e.g. Dune" value="${esc(b?b.title:'')}">
      </div>
      <div class="fg-row">
        <div class="fg"><label class="flbl">Author</label>
          <input class="fin" id="bf-author" placeholder="Author name" value="${esc(b?b.author||'':'')}">
        </div>
        <div class="fg"><label class="flbl">Type</label>
          <select class="fin" id="bf-genre">${gOpts}</select>
        </div>
      </div>
      <div class="fg-row">
        <div class="fg"><label class="flbl">Status</label>
          <select class="fin" id="bf-status">
            <option value="want"      ${status==='want'?'selected':''}>◎ Want to Read</option>
            <option value="reading"   ${status==='reading'?'selected':''}>📖 Reading</option>
            <option value="completed" ${status==='completed'?'selected':''}>✓ Completed</option>
            <option value="on_hold"   ${status==='on_hold'?'selected':''}>⏸ On Hold</option>
            <option value="dropped"   ${status==='dropped'?'selected':''}>✗ Dropped</option>
          </select>
        </div>
        <div class="fg"><label class="flbl">Rating (0-10)</label>
          <input class="fin" type="number" id="bf-rating" min="0" max="10" step="0.5" placeholder="—" value="${b?b.rating||'':''}">
        </div>
      </div>
      <div class="fg-row">
        <div class="fg"><label class="flbl">Current Page</label>
          <input class="fin" type="number" id="bf-cur" min="0" placeholder="0" value="${b?b.currentPage||'':''}">
        </div>
        <div class="fg"><label class="flbl">Total Pages</label>
          <input class="fin" type="number" id="bf-tot" min="0" placeholder="e.g. 412" value="${b?b.totalPages||'':''}">
        </div>
      </div>
      <div class="fg-row">
        <div class="fg"><label class="flbl">Start Date</label>
          <input class="fin" type="date" id="bf-start" value="${b?b.startDate||'':''}">
        </div>
        <div class="fg"><label class="flbl">Finish Date</label>
          <input class="fin" type="date" id="bf-end" value="${b?b.endDate||'':''}">
        </div>
      </div>
      <div class="fg" style="display:flex;align-items:center;gap:8px;padding-top:4px">
        <input type="checkbox" id="bf-fav" ${b&&b.favorite?'checked':''} style="width:14px;height:14px;cursor:pointer;accent-color:var(--ac)">
        <label for="bf-fav" class="flbl" style="margin:0;cursor:pointer">★ Favorite</label>
      </div>
      <div class="fg"><label class="flbl">Notes</label>
        <textarea class="fin" id="bf-notes" placeholder="Your thoughts...">${esc(b?b.notes||'':'')}</textarea>
      </div>
      <div class="f-sec" style="font-family:var(--fd);letter-spacing:1px">Volumes / Series</div>
      <div id="bftl-list">${BFORM_TL.map((v,i) => bookVolHtml(v,i)).join('')}</div>
      <div class="ftl-add-row">
        <button class="ftl-add" onclick="addBookVol()" style="font-family:var(--fb);font-weight:700">+ Add Volume</button>
      </div>
    </div>
    <div class="panel-actions">
      ${isEdit?`<button class="btn-del" onclick="askDelBook('${b.id}')">Delete</button>`:''}
      <button class="btn-cancel" onclick="closePanel()">Cancel</button>
      <button class="btn-save" onclick="saveBook('${b?b.id:''}')">Save</button>
    </div>`;
}

function bookVolHtml(v, i) {
  const vs = v.status||'want';
  return `<div class="ftl-item" style="border:2px solid var(--brd);box-shadow:2px 2px 0 var(--brd)" data-idx="${i}" data-vid="${v.id||''}">
    <button class="ftl-rm" onclick="removeBookVol(${i})">✕</button>
    <div class="ftl-head">
      <span class="ftl-drag">⠿</span>
      <span class="tl-type-pill tp-s" style="font-family:var(--fb)">Vol ${i+1}</span>
    </div>
    <div class="fg-row" style="margin-bottom:7px">
      <div class="fg"><label class="flbl">Volume Name</label>
        <input class="fin" data-fi="name" value="${esc(v.name||'')}" placeholder="e.g. Volume 1"></div>
      <div class="fg"><label class="flbl">Status</label>
        <select class="fin" data-fi="status">
          <option value="want"      ${vs==='want'?'selected':''}>◎ Want</option>
          <option value="reading"   ${vs==='reading'?'selected':''}>📖 Reading</option>
          <option value="completed" ${vs==='completed'?'selected':''}>✓ Done</option>
          <option value="on_hold"   ${vs==='on_hold'?'selected':''}>⏸ Hold</option>
          <option value="dropped"   ${vs==='dropped'?'selected':''}>✗ Dropped</option>
        </select>
      </div>
    </div>
    <div class="fg-row" style="margin-bottom:7px">
      <div class="fg"><label class="flbl">Pages Read</label>
        <input class="fin" type="number" data-fi="pagesRead" value="${v.pagesRead||''}" placeholder="0" min="0"></div>
      <div class="fg"><label class="flbl">Total Pages</label>
        <input class="fin" type="number" data-fi="totalPages" value="${v.totalPages||''}" placeholder="e.g. 300" min="0"></div>
    </div>
    <div class="fg-row">
      <div class="fg"><label class="flbl">Start Date</label>
        <input class="fin" type="date" data-fi="startDate" value="${v.startDate||''}"></div>
      <div class="fg"><label class="flbl">End Date</label>
        <input class="fin" type="date" data-fi="endDate" value="${v.endDate||''}"></div>
    </div>
  </div>`;
}

function addBookVol() {
  const cur = collectBookVols();
  cur.push({ id:uid(), name:`Volume ${cur.length+1}`, status:'want', pagesRead:'', totalPages:'', startDate:'', endDate:'' });
  BFORM_TL=cur; refreshBFtl();
}
function removeBookVol(i) { const c=collectBookVols(); c.splice(i,1); BFORM_TL=c; refreshBFtl(); }
function refreshBFtl()    { document.getElementById('bftl-list').innerHTML = BFORM_TL.map((v,i)=>bookVolHtml(v,i)).join(''); }

function collectBookVols() {
  const items = [];
  document.querySelectorAll('#bftl-list .ftl-item').forEach((el,i) => {
    const get = fi => { const x=el.querySelector(`[data-fi="${fi}"]`); return x?x.value:''; };
    items.push({ id:el.dataset.vid||uid(), name:get('name'), status:get('status')||'want',
      pagesRead:get('pagesRead')||null, totalPages:get('totalPages')||null,
      startDate:get('startDate')||null, endDate:get('endDate')||null });
  });
  return items;
}

function saveBook(eid) {
  const title = document.getElementById('bf-title')?.value?.trim();
  if (!title) { showAlert('Please enter a book title', {title:'Missing Title'}); return; }
  const existing = eid ? BDATA.find(x=>x.id===eid) : null;
  const vols = collectBookVols();
  const entry = {
    id: eid||uid(), title,
    author:      document.getElementById('bf-author')?.value?.trim()||null,
    genreId:     document.getElementById('bf-genre')?.value||BGENRE,
    status:      document.getElementById('bf-status')?.value||'want',
    rating:      document.getElementById('bf-rating')?.value||null,
    currentPage: document.getElementById('bf-cur')?.value||null,
    totalPages:  document.getElementById('bf-tot')?.value||null,
    startDate:   document.getElementById('bf-start')?.value||null,
    endDate:     document.getElementById('bf-end')?.value||null,
    favorite:    document.getElementById('bf-fav')?.checked||false,
    notes:       document.getElementById('bf-notes')?.value?.trim()||null,
    volumes:     vols,
    addedAt:     existing?existing.addedAt:Date.now(),
    updatedAt:   Date.now(),
  };
  if (entry.status==='completed'&&!entry.endDate&&!vols.length) entry.endDate=today();
  if (eid) { const i=BDATA.findIndex(x=>x.id===eid); BDATA[i]=entry; } else BDATA.unshift(entry);
  addLog('books', eid?'Updated':'Added', entry.title, entry.status);
  saveBooks(BDATA);
  BPANEL=null; BPEDIT=null;
  document.getElementById('rpanel').classList.remove('open');
  document.getElementById('poverlay').classList.remove('show');
  document.getElementById('content').classList.remove('pushed');
  renderBooksBody(); toast('✓ Book saved');
}

function askDelBook(id) {
  showConfirm('This book will be permanently deleted.', () => {
    const _bdel=BDATA.find(x=>x.id===id);
    BDATA = BDATA.filter(x=>x.id!==id);
    if(_bdel) addLog('books','Deleted',_bdel.title);
    saveBooks(BDATA);
    BPANEL=null; BPEDIT=null;
    document.getElementById('rpanel').classList.remove('open');
    document.getElementById('poverlay').classList.remove('show');
    document.getElementById('content').classList.remove('pushed');
    renderBooksBody();
    if(_bdel) toastWithUndo(_bdel.title,()=>{BDATA.push(_bdel);saveBooks(BDATA);renderBooksBody();});
  }, {title:'Delete Book?',okLabel:'Delete'});
}

// ── DASHBOARD ──
function renderBooksDash(c) {
  const all = BDATA;
  const cnt = {};
  BS_ORDER.forEach(s => cnt[s] = all.filter(b=>b.status===s).length);
  const totalPages = all.reduce((a,b) => {
    const st = bookEntryStats(b); return a + st.cur;
  }, 0);
  const byGenre = BOOK_GENRES.map(g => ({...g, count:all.filter(b=>b.genreId===g.id).length})).filter(g=>g.count);

  c.innerHTML = `
    <div style="font-family:var(--fd);font-size:24px;font-weight:700;margin-bottom:16px;letter-spacing:2px;color:var(--ac)">📚 Book Dashboard</div>
    <div class="dash-grid" style="margin-bottom:20px">
      <div class="dc"><div class="dc-v">${all.length}</div><div class="dc-l">Total</div></div>
      <div class="dc"><div class="dc-v">${cnt.reading||0}</div><div class="dc-l">Reading</div></div>
      <div class="dc"><div class="dc-v">${cnt.completed||0}</div><div class="dc-l">Completed</div></div>
      <div class="dc"><div class="dc-v">${cnt.want||0}</div><div class="dc-l">Want</div></div>
      <div class="dc"><div class="dc-v">${totalPages.toLocaleString()}</div><div class="dc-l">Pages Read</div></div>
      <div class="dc"><div class="dc-v">${cnt.on_hold||0}</div><div class="dc-l">On Hold</div></div>
    </div>
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);box-shadow:var(--sh);padding:16px;max-width:400px">
      <div style="font-family:var(--fd);font-size:14px;letter-spacing:1px;color:var(--mu);margin-bottom:10px">BY TYPE</div>
      ${byGenre.map(g=>`
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--brd);font-family:var(--fb)">
          <span style="flex:1;font-size:13px">${g.name}</span>
          <span style="font-size:14px;font-weight:700;color:var(--ac)">${g.count}</span>
        </div>`).join('')}
    </div>`;
}

// ── UPCOMING ──
function renderBooksUpcoming(c) {
  const now = new Date(); now.setHours(0,0,0,0);
  const items = BDATA.filter(b=>b.upcomingDate).map(b=>({...b,date:b.upcomingDate}));
  items.sort((a,b)=>new Date(a.date)-new Date(b.date));
  const rows = items.map(b=>{
    const d=new Date(b.date+'T00:00:00');
    const diff=Math.ceil((d-now)/86400000);
    const mon=d.toLocaleString('default',{month:'short'}).toUpperCase();
    let cls='up-far',lbl=`${diff}d`;
    if(diff<=0){cls='up-past';lbl='Released';}
    else if(diff<=3){cls='up-soon';lbl=`${diff}d left`;}
    else if(diff<=14){cls='up-near';lbl=`${diff}d`;}
    return`<div class="up-card" style="border:2px solid var(--brd);box-shadow:2px 2px 0 var(--brd)" onclick="openBookDetail('${b.id}')">
      <div class="up-date-box"><div class="up-mon">${mon}</div><div class="up-day">${d.getDate()}</div></div>
      <div class="up-info"><div class="up-title" style="font-family:var(--fb);font-weight:700">${esc(b.title)}</div>
        <div class="up-sub" style="font-family:var(--fb)">${b.author?esc(b.author):''}</div></div>
      <div class="up-pill ${cls}">${lbl}</div>
    </div>`;
  }).join('');
  c.innerHTML=`<div style="font-family:var(--fd);font-size:22px;font-weight:700;margin-bottom:16px;letter-spacing:2px;color:var(--ac)">🗓 Upcoming Books</div>
    ${rows||`<div class="empty"><div class="empty-ico">📅</div><p style="font-family:var(--fb)">No upcoming books</p></div>`}`;
}


// ── Register all books functions as globals ───────────────────────────────
Object.assign(window, {
  renderBooks, renderBooksBody, setBooksPage, setBGenre,
  filteredBooks, bookEntryStats,
  renderBooksList, bookRowHtml, toggleBColl,
  quickBookPage,
  openBookDetail, renderBookDetailPanel,
  openAddBook, openEditBook, openBookForm, renderBookFormPanel,
  bookVolHtml, addBookVol, removeBookVol, refreshBFtl, collectBookVols,
  saveBook, saveBooks, askDelBook,
  renderBooksDash, renderBooksUpcoming,
  bstag,
});
