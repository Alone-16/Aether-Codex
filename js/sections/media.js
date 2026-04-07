// ═══════════════════════════════
//  MEDIA SECTION — Obsidian / Cyan design
// ═══════════════════════════════

/* ---------- visual helpers ---------- */
function _mediaStatusBar(s) {
  const map = {
    watching:'#00e5ff', completed:'#4ade80', plan:'#a78bfa',
    not_started:'rgba(255,255,255,.18)', on_hold:'#fbbf24', dropped:'#f87171', upcoming:'#fb923c',
  };
  return map[s] || 'rgba(255,255,255,.18)';
}

function _mediaStatusClass(s) {
  const valid = ['watching','completed','plan','not_started','on_hold','dropped','upcoming'];
  return valid.includes(s) ? s : 'not_started';
}

function _airBadge(e) {
  if (e.airingDay == null || e.status !== 'watching') return '';
  const diff = (e.airingDay - new Date().getDay() + 7) % 7;
  const lbl  = diff === 0 ? 'Airs Today!' : diff === 1 ? 'Tomorrow' : `in ${diff}d`;
  const col  = diff === 0 ? '#4ade80'     : diff === 1 ? '#fbbf24'  : 'rgba(255,255,255,.3)';
  return `<span class="m-air-badge" style="color:${col}">📺 ${lbl}</span>`;
}

function _mstag(s) {
  const cls = _mediaStatusClass(s);
  const labels = {
    watching:'▶ Watching', completed:'✓ Completed', plan:'○ Plan',
    not_started:'○ Not Started', on_hold:'⏸ Hold', dropped:'✗ Dropped', upcoming:'◉ Upcoming',
  };
  return `<span class="m-stag ${cls}">${labels[s] || s}</span>`;
}

/* ---------- filter chip state ---------- */
let _M_STATUS_CHIP = '';

/* ---------- hold / context-menu state ---------- */
let _HOLD_TIMER   = null;
let _CTX_ENTRY_ID = null;
let _HOLD_FIRED   = false;   // true when long-press already opened the menu

function _renderFilterChips() {
  const chips = [
    { val:'',          lbl:'All',       col:'rgba(255,255,255,.45)' },
    { val:'watching',  lbl:'Watching',  col:'#00e5ff' },
    { val:'completed', lbl:'Completed', col:'#4ade80' },
    { val:'plan',      lbl:'Planned',   col:'#a78bfa' },
    { val:'on_hold',   lbl:'On Hold',   col:'#fbbf24' },
    { val:'dropped',   lbl:'Dropped',   col:'#f87171' },
    { val:'upcoming',  lbl:'Upcoming',  col:'#fb923c' },
  ];
  return chips.map(c => {
    const active = _M_STATUS_CHIP === c.val;
    const aStyle = active ? `border-color:${c.col}55;color:${c.col};background:${c.col}14` : '';
    return `<button class="m-chip${active ? ' active' : ''}" style="${aStyle}" onclick="setMediaChip('${c.val}')">
      <span class="m-chip-dot" style="background:${c.col}"></span>${c.lbl}
    </button>`;
  }).join('');
}

function setMediaChip(val) {
  _M_STATUS_CHIP = val;
  const fstEl = document.getElementById('fstatus');
  if (fstEl) fstEl.value = val;
  renderMediaBody();
}

/* ═══════════════════════════════
   MAIN RENDER
═══════════════════════════════ */
function renderMedia(c) {
  _injectPinStyles();
  const tabs = ['List', 'Dashboard', 'Upcoming', 'Incomplete'];
  const g    = gbyid(GACTIVE);

  c.innerHTML = `
    <div class="m-topbar">
      <div class="m-page-title">
        <span class="m-pt-genre" id="gdrop-lbl">${esc(g.name)}</span>
        <span class="m-pt-sep">//</span>
        <span class="m-pt-view">${MEDIA_PAGE}</span>
      </div>

      <div id="gdrop" style="position:relative;flex-shrink:0;z-index:200">
        <button class="m-genre-btn" onclick="toggleGdrop(event)">
          <span class="m-genre-dot" id="gdot" style="background:${g.color}"></span>
          <span>${esc(g.name)}</span>
          <span style="opacity:.35;font-size:9px;margin-left:2px">▾</span>
        </button>
        <div id="gdrop-menu" style="position:absolute;top:calc(100% + 6px);left:0;background:#131318;border:1px solid rgba(255,255,255,.1);border-radius:8px;min-width:200px;z-index:9000;box-shadow:0 12px 40px rgba(0,0,0,.7);max-height:60vh;overflow-y:auto;display:none"></div>
      </div>

      <div class="m-tabs">
        ${tabs.map((t,i) => `<button class="m-tab${MEDIA_PAGE === ['list','dashboard','upcoming','incomplete'][i] ? ' active' : ''}"
          onclick="setMediaPage('${['list','dashboard','upcoming','incomplete'][i]}')">${t}</button>`).join('')}
      </div>

      <button class="m-add-btn" onclick="openAdd()">+ Add Title</button>
    </div>

    <div id="media-body"></div>`;

  buildGenreMenu();
  const dot = document.getElementById('gdot');
  if (dot) dot.style.background = g.color;
  document.getElementById('gdrop-lbl').textContent = g.name;

  renderMediaBody();
}

function setMediaPage(p) {
  MEDIA_PAGE     = p;
  SEARCH         = '';
  _M_STATUS_CHIP = '';
  const srch  = document.getElementById('srch');
  if (srch)  srch.value  = '';
  const fstEl = document.getElementById('fstatus');
  if (fstEl) fstEl.value = '';
  renderMediaBody();
}

function renderMediaBody() {
  const el = document.getElementById('media-body'); if (!el) return;
  if      (MEDIA_PAGE === 'list')        renderList(el);
  else if (MEDIA_PAGE === 'dashboard')   renderDash(el);
  else if (MEDIA_PAGE === 'upcoming')    renderUpcoming(el);
  else if (MEDIA_PAGE === 'incomplete')  renderIncomplete(el);
}

/* ═══════════════════════════════
   LIST VIEW
═══════════════════════════════ */
function filteredData() {
  let d = DATA.filter(e => e.genreId === GACTIVE);
  const fst = _M_STATUS_CHIP || document.getElementById('fstatus')?.value || '';
  const fs  = document.getElementById('fsort')?.value || 'title';

  if (SEARCH) {
    d = d.filter(e =>
      e.title.toLowerCase().includes(SEARCH) ||
      (e.timeline || []).some(it => (it.name || it.movieTitle || '').toLowerCase().includes(SEARCH))
    );
    d = fs === 'added' ? [...d].sort((a,b) => (b.addedAt||0)-(a.addedAt||0)) : [...d].sort((a,b) => a.title.localeCompare(b.title));
    return { data:d, fst:'' };
  }

  d = fs === 'added' ? [...d].sort((a,b) => (b.addedAt||0)-(a.addedAt||0)) : [...d].sort((a,b) => a.title.localeCompare(b.title));
  return { data:d, fst };
}

function expandRows(entries, fst) {
  const rows = [];
  entries.forEach(e => {
    if (!fst || e.status === fst) rows.push({ kind:'entry', e, status:e.status });
  });
  // pinned entries float to top within each status group
  rows.sort((a, b) => (b.e.pinned ? 1 : 0) - (a.e.pinned ? 1 : 0));
  return rows;
}

function renderList(c) {
  const { data, fst } = filteredData();
  const flat    = expandRows(data, fst);
  const pCount  = new Set(flat.map(r => r.e.id)).size;
  const sortVal = document.getElementById('fsort')?.value || 'title';

  let html = `
    <div class="m-filter-row">
      ${_renderFilterChips()}
      <div class="m-sort-wrap">
        <span class="m-sort-ico">⇅</span>
        <select class="m-sort-sel" onchange="document.getElementById('fsort').value=this.value;renderMediaBody()">
          <option value="title" ${sortVal==='title'?'selected':''}>A → Z</option>
          <option value="added" ${sortVal==='added'?'selected':''}>Recently Added</option>
        </select>
      </div>
    </div>
    <div class="m-cnt-lbl">${pCount} title${pCount!==1?'s':''} · ${flat.length} part${flat.length!==1?'s':''}</div>`;

  if (!flat.length) {
    html += `<div class="m-empty"><div class="m-empty-ico">◌</div><p>No titles here yet</p></div>`;
    c.innerHTML = html; return;
  }

  const STATUS_META = {
    watching:    { lbl:'● Watching',    cls:'watching'    },
    plan:        { lbl:'○ Planned',     cls:'plan'        },
    not_started: { lbl:'○ Not Started', cls:'not_started' },
    completed:   { lbl:'✓ Completed',   cls:'completed'   },
    on_hold:     { lbl:'⏸ On Hold',     cls:'on_hold'     },
    dropped:     { lbl:'✗ Dropped',     cls:'dropped'     },
    upcoming:    { lbl:'◉ Upcoming',    cls:'upcoming'    },
  };
  const byS = {};
  SO.forEach(s => { byS[s] = flat.filter(r => r.status === s); });

  SO.forEach(s => {
    const rows = byS[s]; if (!rows?.length) return;
    const meta = STATUS_META[s] || { lbl:s, cls:'not_started' };
    const coll = COLLAPSED[GACTIVE + '_' + s];
    html += `
      <div class="m-section">
        <div class="m-sec-head" onclick="toggleColl('${s}')">
          <span class="m-sec-lbl ${meta.cls}">${meta.lbl}</span>
          <span class="m-sec-cnt">${rows.length}</span>
          <span class="m-sec-line"></span>
          <span class="m-sec-arr${coll ? ' coll' : ''}">▾</span>
        </div>
        <div class="m-rows${coll ? ' coll' : ''}">
          ${rows.map(r => r.kind === 'tl' ? tlRowHtml(r.e, r.it, r.idx) : rowHtml(r.e)).join('')}
        </div>
      </div>`;
  });

  c.innerHTML = html;
}

function toggleColl(s) {
  const k = GACTIVE + '_' + s;
  COLLAPSED[k] = !COLLAPSED[k];
  renderMediaBody();
}

/**
 * entryStats(e)
 * Works with BOTH the legacy timeline shape and the new flat-entry shape.
 * After migration completes, timeline is always absent.
 */
function entryStats(e) {
  const dur = parseInt(e.epDuration) || 24;

  /* ── Legacy path: entry still has a timeline (pre-migration or mid-boot) ── */
  const tl = e.timeline || [];
  if (tl.length) {
    let cur = 0, tot = 0;
    tl.forEach(it => {
      if (it.type === 'season') {
        cur += parseInt(it.epWatched || 0);
        tot += parseInt(it.eps || 0);
      } else if (it.type === 'movie' && it.watched) {
        cur++; tot++;
      }
    });
    return {
      cur, tot,
      pct:  tot ? Math.round(cur / tot * 100) : 0,
      time: estTime(tot, dur),
    };
  }

  /* ── New flat path ── */
  const cur = parseInt(e.epCur || 0);
  const tot = parseInt(e.epTot || 0);
  const pct = tot ? Math.round(cur / tot * 100) : (cur > 0 ? 100 : 0);
  return { cur, tot, pct, time: estTime(tot || cur, dur) };
}

function activeSeason(e) {
  const tl = (e.timeline || []).filter(it => it.type === 'season');
  return tl.find(it => it.status === 'watching') || tl.find(it => it.status === 'not_started') || tl[tl.length-1] || null;
}

/* ── Card rows ── */
function rowHtml(e) {
  const isA    = PANEL && PEDIT === e.id;
  const tl     = e.timeline || [];
  const col    = _mediaStatusBar(e.status);
  let rCur=0, rTot=0, rPct=0, showCtrl=false;

  if (tl.length) {
    const as = activeSeason(e);
    if (as && as.type === 'season') {
      rCur     = parseInt(as.epWatched || 0);
      rTot     = parseInt(as.eps || 0);
      rPct     = rTot ? Math.round(rCur/rTot*100) : (rCur > 0 ? 100 : 0);
      showCtrl = ['watching','on_hold'].includes(as.status);
    }
  } else {
    rCur     = parseInt(e.epCur || 0);
    rTot     = parseInt(e.epTot || 0);
    rPct     = rTot ? Math.round(rCur/rTot*100) : (rCur > 0 ? 100 : 0);
    showCtrl = ['watching','completed','on_hold','dropped'].includes(e.status);
  }

  const hasBar  = rTot > 0 || rCur > 0;
  const isValidType = t => t.type === 'season' || t.type === 'movie';
  const seaC    = tl.filter(t => t.type === 'season' || (!isValidType(t) && t.num != null)).length;
  const movC    = tl.filter(t => t.type === 'movie'  || (!isValidType(t) && t.movieTitle != null && t.num == null)).length;
  // Plain entries (no timeline) with episode data are implicitly 1 season
  const impliedS  = !tl.length && (parseInt(e.epTot || 0) > 0 || parseInt(e.epCur || 0) > 0) ? 1 : 0;
  const effSeaC   = seaC + impliedS;
  const tlLabel   = effSeaC || movC
    ? `${effSeaC ? effSeaC + 'S' : ''}${effSeaC && movC ? ' + ' : ''}${movC ? movC + 'M' : ''}` : '';
  const rewBadge = e.rewatches?.length
    ? `<span class="m-rewatch-badge">↺${e.rewatches.length}</span>` : '';

  return `<div class="m-card${isA ? ' m-card-active' : ''}${e.pinned ? ' m-card-pinned' : ''}" id="row-${e.id}"
    onclick="if(_HOLD_FIRED){_HOLD_FIRED=false;return;}openDetail('${e.id}')"
    onmousedown="startHold('${e.id}',event)"
    onmouseup="cancelHold()"
    onmouseleave="cancelHold()"
    ontouchstart="startHold('${e.id}',event)"
    ontouchend="cancelHold()"
    ontouchmove="cancelHold()">
    <div class="m-card-bar" style="background:${col}"></div>
    <div class="m-card-info">
      <div class="m-card-title">${e.pinned ? '<span class="m-pin-badge">📌</span>' : ''}${esc(e.title)}</div>
      <div class="m-card-meta">
        ${_mstag(e.status)}
        ${tlLabel ? `<span class="m-card-seasons" style="font-size:10px;color:rgba(255,255,255,.35);font-family:'Space Mono',monospace,sans-serif">${tlLabel}</span>` : ''}
        ${rewBadge}
        ${_airBadge(e)}
      </div>
    </div>
    <div class="m-card-r">
      ${hasBar ? `<div class="m-prog-wrap">
        <div class="m-prog-bar"><div class="m-prog-fill" style="width:${rPct}%;background:${col}"></div></div>
        <span class="m-prog-txt">${rCur}${rTot ? '/'+rTot : ''}</span>
      </div>` : ''}
      <div class="m-card-actions" onclick="event.stopPropagation()">
        ${showCtrl && hasBar ? `<div class="m-ep-ctrl">
          <button class="m-ep-btn" onclick="quickEp('${e.id}',-1)">−</button>
          <span class="m-ep-num">${rCur}</span>
          <button class="m-ep-btn" onclick="quickEp('${e.id}',1)">+</button>
        </div>` : ''}
        <button class="m-act-btn" onclick="openEdit('${e.id}')">✏</button>
        <button class="m-act-btn m-act-del" onclick="askDel('${e.id}')">✕</button>
        ${e.status === 'watching' && e.watchUrl
          ? `<button class="m-act-btn m-act-play" onclick="event.stopPropagation();window.open('${esc(e.watchUrl)}','_blank')" title="Watch">▶</button>` : ''}
      </div>
    </div>
  </div>`;
}

function tlRowHtml(e, it, idx) {
  const isA    = PANEL && PEDIT === e.id;
  const isS    = it.type === 'season';
  const st     = it.status || 'not_started';
  const col    = _mediaStatusBar(st);
  const w      = parseInt(it.epWatched || 0), t = parseInt(it.eps || 0);
  const pct    = t ? Math.round(w/t*100) : (w > 0 ? 100 : 0);
  const hasBar = t > 0 || w > 0;
  const showCtrl = isS && ['watching','on_hold'].includes(st);
  const rawName  = isS ? (it.name || `Season ${it.num||idx+1}`) : (it.movieTitle || it.name || 'Movie');
  const fullName = `${e.title} · ${rawName}`;
  const pill     = isS
    ? `<span class="m-tl-pill m-tl-s">S${it.num||idx+1}</span>`
    : `<span class="m-tl-pill m-tl-m">🎬</span>`;

  return `<div class="m-card${isA ? ' m-card-active' : ''}" onclick="openDetail('${e.id}')">
    <div class="m-card-bar" style="background:${col}"></div>
    <div class="m-card-info">
      <div class="m-card-title" style="display:flex;align-items:center;gap:6px">${pill}${esc(fullName)}</div>
      <div class="m-card-meta">${_mstag(st)}</div>
    </div>
    <div class="m-card-r">
      ${hasBar ? `<div class="m-prog-wrap">
        <div class="m-prog-bar"><div class="m-prog-fill" style="width:${pct}%;background:${col}"></div></div>
        <span class="m-prog-txt">${w}${t ? '/'+t : ''}</span>
      </div>` : ''}
      <div class="m-card-actions" onclick="event.stopPropagation()">
        ${showCtrl ? `<div class="m-ep-ctrl">
          <button class="m-ep-btn" onclick="quickTlEp('${e.id}',${idx},-1)">−</button>
          <span class="m-ep-num">${w}</span>
          <button class="m-ep-btn" onclick="quickTlEp('${e.id}',${idx},1)">+</button>
        </div>` : ''}
        <button class="m-act-btn" onclick="openEdit('${e.id}')">✏</button>
        <button class="m-act-btn m-act-del" onclick="askDel('${e.id}')">✕</button>
        ${st === 'watching' && e.watchUrl
          ? `<button class="m-act-btn m-act-play" onclick="event.stopPropagation();window.open('${esc(e.watchUrl)}','_blank')" title="Watch">▶</button>` : ''}
      </div>
    </div>
  </div>`;
}

/* ── Quick ep controls ── */
function quickEp(id, delta) {
  const e = DATA.find(x => x.id === id); if (!e) return;
  const tl = e.timeline || [];
  if (tl.length) {
    const as = activeSeason(e);
    if (as) {
      const w = Math.max(0, parseInt(as.epWatched || 0) + delta);
      as.epWatched = as.eps ? Math.min(w, parseInt(as.eps)) : w;
      if (as.eps && as.epWatched >= parseInt(as.eps) && as.status === 'watching') as.status = 'completed';
    }
  } else {
    e.epCur = Math.max(0, (parseInt(e.epCur) || 0) + delta);
    if (e.epTot && e.epCur >= parseInt(e.epTot) && e.status === 'watching') {
      e.status = 'completed'; e.endDate = today();
    }
  }
  e.updatedAt = Date.now(); saveData(DATA); renderMediaBody();
  if (PANEL === 'detail' && PEDIT === id) renderDetailPanel(DATA.find(x => x.id === id));
}

function quickTlEp(eid, idx, delta) {
  const e = DATA.find(x => x.id === eid); if (!e) return;
  const it = e.timeline && e.timeline[idx];
  if (!it || it.type !== 'season') return;
  const w = Math.max(0, parseInt(it.epWatched || 0) + delta);
  it.epWatched = it.eps ? Math.min(w, parseInt(it.eps)) : w;
  if (it.eps && it.epWatched >= parseInt(it.eps) && it.status === 'watching') {
    it.status = 'completed';
    if ((e.timeline || []).filter(t => t.type === 'season').every(s => s.status === 'completed')) e.status = 'completed';
  }
  e.updatedAt = Date.now(); saveData(DATA); renderMediaBody();
  if (PANEL === 'detail' && PEDIT === eid) renderDetailPanel(e);
}

/* ═══════════════════════════════
   DASHBOARD
═══════════════════════════════ */
function renderDash(c) {
  const d   = DATA.filter(e => e.genreId === GACTIVE);
  const cnt = {}; d.forEach(e => { cnt[e.status] = (cnt[e.status]||0)+1; });
  let epTotal=0, rSum=0, rN=0, totalMin=0;
  d.forEach(e => {
    const st = entryStats(e); epTotal += st.cur;
    const dur = parseInt(e.epDuration || 24);
    const tl = e.timeline || [];
    if (tl.length) tl.forEach(it => { if (it.type==='season') totalMin += parseInt(it.epWatched||0)*parseInt(it.epDuration||dur); });
    else totalMin += parseInt(e.epCur||0)*dur;
    if (e.rating) { rSum += parseFloat(e.rating); rN++; }
    (e.timeline||[]).forEach(it => { if (it.rating) { rSum+=parseFloat(it.rating); rN++; } });
  });
  const avg = rN ? (rSum/rN).toFixed(1) : '—';
  const g   = gbyid(GACTIVE);
  const maxGenre = Math.max(...GENRES.map(gg => DATA.filter(e=>e.genreId===gg.id).length), 1);

  const genreRows = GENRES.map(gg => {
    const cnt2 = DATA.filter(e => e.genreId === gg.id).length;
    return cnt2 ? `<div class="m-dash-genre-row">
        <span class="m-dash-genre-dot" style="background:${gg.color}"></span>
        <span class="m-dash-genre-name">${esc(gg.name)}</span>
        <div class="m-dash-genre-bar-wrap">
          <div class="m-dash-genre-bar" style="width:${Math.round(cnt2/maxGenre*100)}%;background:${gg.color}"></div>
        </div>
        <span class="m-dash-genre-cnt">${cnt2}</span>
      </div>` : '';
  }).join('');

  const stats = [
    { v:d.length,                l:'Total' },
    { v:cnt.watching||0,         l:'Watching' },
    { v:cnt.completed||0,        l:'Completed' },
    { v:cnt.plan||0,             l:'Planned' },
    { v:cnt.on_hold||0,          l:'On Hold' },
    { v:cnt.dropped||0,          l:'Dropped' },
    { v:epTotal.toLocaleString(),l:'Eps Watched' },
    { v:avg,                     l:'Avg Rating' },
  ];

  c.innerHTML = `
    <div class="m-dash-title">◉ ${esc(g.name)} <span>// dashboard</span></div>
    <div class="m-dash-grid">
      ${stats.map(s => `<div class="m-dash-stat"><div class="m-dash-stat-v">${s.v}</div><div class="m-dash-stat-l">${s.l}</div></div>`).join('')}
    </div>
    <div class="m-dash-time-row">
      <div class="m-dash-tc">
        <div class="m-dash-tc-v">${fmtMin(totalMin)}</div>
        <div class="m-dash-tc-l">Time Watched</div>
        <div class="m-dash-tc-d">${(totalMin/60).toFixed(0)} hours total</div>
      </div>
      <div class="m-dash-tc">
        <div class="m-dash-tc-v">${Math.floor(totalMin/1440)}</div>
        <div class="m-dash-tc-l">Days Watched</div>
        <div class="m-dash-tc-d">of continuous watching</div>
      </div>
    </div>
    <div class="m-dash-genres">
      <div class="m-dash-genres-title">All Genres</div>
      ${genreRows || '<div style="color:var(--mu);font-size:13px">No data</div>'}
    </div>`;
}

/* ═══════════════════════════════
   UPCOMING
═══════════════════════════════ */
function renderUpcoming(c) {
  const now = new Date(); now.setHours(0,0,0,0);
  const items = [];
  DATA.filter(e => e.genreId === GACTIVE).forEach(e => {
    if (e.upcomingDate) items.push({ id:e.id, title:e.title, date:e.upcomingDate, time:e.upcomingTime||null, label:'New Release' });
    (e.timeline||[]).forEach(it => {
      if (it.upcomingDate) items.push({ id:e.id, title:e.title, date:it.upcomingDate, time:it.upcomingTime||null, label:it.name||'New Season' });
    });
  });
  items.sort((a,b) => new Date(a.date)-new Date(b.date));

  const rows = items.map(it => {
    const d    = new Date(it.date + 'T00:00:00');
    const diff = Math.ceil((d-now)/86400000);
    const mon  = d.toLocaleString('default',{month:'short'}).toUpperCase();
    let cls='m-up-far', lbl=`${diff}d`;
    if (diff<=0)  { cls='m-up-past'; lbl='Released'; }
    else if (diff<=3)  { cls='m-up-soon'; lbl=`${diff}d left`; }
    else if (diff<=14) { cls='m-up-near'; lbl=`${diff}d`; }
    return `<div class="m-up-card" onclick="openDetail('${it.id}')">
      <div class="m-up-date"><div class="m-up-mon">${mon}</div><div class="m-up-day">${d.getDate()}</div></div>
      <div class="m-up-info">
        <div class="m-up-title">${esc(it.title)}</div>
        <div class="m-up-sub">${esc(it.label)}${it.time ? ' · '+it.time : ''}</div>
      </div>
      <div class="m-up-pill ${cls}">${lbl}</div>
    </div>`;
  }).join('');

  c.innerHTML = `
    <div class="m-dash-title">🗓 Upcoming <span>// ${esc(gbyid(GACTIVE).name)}</span></div>
    ${rows || `<div class="m-empty"><div class="m-empty-ico">📅</div><p>No upcoming items</p></div>`}`;
}

/* ═══════════════════════════════
   INCOMPLETE
═══════════════════════════════ */
function renderIncomplete(c) {
  const items = DATA.filter(e => e.genreId === GACTIVE && (() => {
    const s = (e.timeline||[]).filter(t => t.type==='season');
    return s.some(x=>x.status==='completed') && s.some(x=>['not_started','plan','watching'].includes(x.status));
  })());

  const rows = items.map(e => {
    const seas = (e.timeline||[]).filter(t=>t.type==='season');
    const done = seas.filter(s=>s.status==='completed').length;
    return `<div class="m-card" onclick="openDetail('${e.id}')">
      <div class="m-card-bar" style="background:${_mediaStatusBar(e.status)}"></div>
      <div class="m-card-info">
        <div class="m-card-title">${esc(e.title)}</div>
        <div class="m-card-meta">${_mstag(e.status)}<span class="m-card-seasons">${done}/${seas.length} seasons done</span></div>
      </div>
      <div class="m-card-r">
        <div class="m-card-actions" onclick="event.stopPropagation()">
          <button class="m-act-btn" onclick="openEdit('${e.id}')">✏</button>
        </div>
      </div>
    </div>`;
  }).join('');

  c.innerHTML = `
    <div class="m-dash-title">⚠ Incomplete Seasons <span>// ${esc(gbyid(GACTIVE).name)}</span></div>
    ${rows || `<div class="m-empty"><div class="m-empty-ico">🎉</div><p>All caught up!</p></div>`}`;
}

/* ═══════════════════════════════
   PANEL MANAGEMENT
═══════════════════════════════ */
function openPanel(mode, id) {
  PANEL = mode; PEDIT = id;
  document.getElementById('rpanel').classList.add('open');
  document.getElementById('poverlay').classList.add('show');
  document.getElementById('content').classList.add('pushed');
  if (mode === 'detail') { const e = DATA.find(x=>x.id===id); if (e) renderDetailPanel(e); }
  else if (mode === 'add')  renderFormPanel(null);
  else if (mode === 'edit') { const e = DATA.find(x=>x.id===id); if (e) renderFormPanel(e); }
}
function closePanel() {
  PANEL = null; PEDIT = null;
  document.getElementById('rpanel').classList.remove('open');
  document.getElementById('poverlay').classList.remove('show');
  document.getElementById('content').classList.remove('pushed');
  render();
}
function openDetail(id) { openPanel('detail', id); }
function openEdit(id)   { openPanel('edit',   id); }
function openAdd()      { openPanel('add',    null); }

/* ── Detail Panel ── */
function renderDetailPanel(e) {
  const st = entryStats(e);
  const g  = gbyid(e.genreId);
  const tl = e.timeline || [];

  document.getElementById('panel-inner').innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title">${esc(e.title)}</div>
        <div class="pbadges">
          <span class="m-genre-badge" style="background:${h2r(g.color,.14)};color:${g.color};border:1px solid ${h2r(g.color,.25)};border-radius:4px;font-size:10px;font-weight:700;padding:2px 8px">${esc(g.name)}</span>
          ${_mstag(e.status)}
          ${e.favorite ? '<span style="color:#fbbf24">★</span>' : ''}
        </div>
      </div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    <div class="pstats">
      <div class="pstat"><div class="pstat-v">${st.tot||'—'}</div><div class="pstat-l">Total Eps</div></div>
      <div class="pstat"><div class="pstat-v">${st.cur}</div><div class="pstat-l">Watched</div></div>
      <div class="pstat"><div class="pstat-v">${st.time}</div><div class="pstat-l">Est. Time</div></div>
      <div class="pstat"><div class="pstat-v">${st.pct}%</div><div class="pstat-l">Progress</div><div class="pprog"><div class="pprog-fill" style="width:${st.pct}%"></div></div></div>
    </div>
    ${(e.startDate||e.endDate) ? `<div style="padding:7px 16px;border-bottom:1px solid var(--brd);display:flex;gap:14px;font-size:11px;color:var(--tx2)">
      ${e.startDate ? `<span>Started: <b>${fmtDate(e.startDate)}</b></span>` : ''}
      ${e.endDate   ? `<span>Finished: <b>${fmtDate(e.endDate)}</b></span>` : ''}
    </div>` : ''}
    ${tl.length
      ? `<div class="sec-div"><span class="sec-div-lbl">Timeline</span><div class="sec-div-line"></div><span class="sec-div-hint">drag ↕ reorder</span></div>
         <div class="tl-wrap" id="dtl-wrap">${tl.map((it,i) => tlViewHtml(it,i,e.id,e.title)).join('')}</div>`
      : `<div style="padding:12px 16px;border-bottom:1px solid var(--brd)">
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--mu);margin-bottom:10px">Details</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
            <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:9px 11px">
              <div style="color:var(--mu);font-size:10px;margin-bottom:3px">EPISODES</div>
              <div style="font-weight:600;color:var(--tx)">${e.epCur||0}${e.epTot?' / '+e.epTot:' watched'}</div>
            </div>
            <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:9px 11px">
              <div style="color:var(--mu);font-size:10px;margin-bottom:3px">DURATION</div>
              <div style="font-weight:600;color:var(--tx)">${e.epDuration||24} min / ep</div>
            </div>
            ${e.rating ? `<div style="background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:9px 11px">
              <div style="color:var(--mu);font-size:10px;margin-bottom:3px">RATING</div>
              <div style="font-weight:600;color:#fbbf24">★ ${e.rating} / 10</div>
            </div>` : ''}
            ${e.airingDay!=null ? `<div style="background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:9px 11px;grid-column:span 2">
              <div style="color:var(--mu);font-size:10px;margin-bottom:3px">AIRING</div>
              <div style="font-weight:600;color:var(--ac)">📺 ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][e.airingDay]}${e.airingTime?' at '+e.airingTime:''}</div>
            </div>` : ''}
          </div>
          <div style="margin-top:10px;font-size:11px;color:var(--mu)">No seasons added yet — click Edit to add seasons or movies</div>
        </div>`}
    ${renderLinkedEntries(e)}
    ${e.notes ? `<div class="sec-div"><span class="sec-div-lbl">Notes</span><div class="sec-div-line"></div></div>
      <div class="pnotes"><div class="pnotes-box">${esc(e.notes)}</div></div>` : ''}
    ${e.status==='completed' && (e.rewatches||[]).length ? `
      <div class="sec-div"><span class="sec-div-lbl">↺ Rewatches (${e.rewatches.length})</span><div class="sec-div-line"></div></div>
      <div style="padding:0 16px 8px">
        ${e.rewatches.map((r,i) => `
          <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:8px 11px;margin-bottom:5px;font-size:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
              <span style="font-weight:600;color:var(--tx)">Rewatch #${i+1}</span>
              ${r.rating ? `<span style="color:#fbbf24">★ ${r.rating}</span>` : ''}
            </div>
            <div style="color:var(--mu);display:flex;gap:12px;flex-wrap:wrap;margin-bottom:6px">
              ${r.epWatched ? `<span>${r.epWatched} ep</span>` : ''}
              ${r.startDate ? `<span>📅 ${fmtDate(r.startDate)}</span>` : ''}
              ${r.endDate   ? `<span>🏁 ${fmtDate(r.endDate)}</span>` : ''}
            </div>
            ${r.notes ? `<div style="margin-bottom:6px;color:var(--tx2);font-style:italic">${esc(r.notes)}</div>` : ''}
            <div style="display:flex;gap:6px;align-items:center">
              <div class="ep-inline">
                <button class="ep-pm" onclick="updateRewatchEp('${e.id}',${i},-1)">−</button>
                <span class="ep-val" id="rw-ep-${e.id}-${i}">${r.epWatched||0}</span>
                <button class="ep-pm" onclick="updateRewatchEp('${e.id}',${i},1)">+</button>
              </div>
              <span style="font-size:11px;color:var(--mu)">/ ${entryStats(e).tot||'?'} ep</span>
              <button onclick="openEditRewatch('${e.id}',${i})" style="margin-left:auto;font-size:11px;color:var(--ac);background:none;border:1px solid rgba(var(--ac-rgb),.3);border-radius:4px;padding:2px 8px;cursor:pointer">Edit</button>
            </div>
          </div>`).join('')}
      </div>` : ''}
    <div class="panel-actions">
      <button class="btn-del" onclick="askDel('${e.id}')">Delete</button>
      ${e.status==='completed' ? `<button class="btn-cancel" onclick="startRewatch('${e.id}')" style="background:rgba(var(--ac-rgb),.1);color:var(--ac);border:1px solid rgba(var(--ac-rgb),.3)">↺ Rewatch</button>` : ''}
      <button class="btn-cancel" onclick="openEdit('${e.id}')">Edit</button>
    </div>`;

  initDetailDrag(e);
  initLinkedDrag(e.id);
}

function tlViewHtml(it, i, eid, parentTitle) {
  const isS  = it.type === 'season';
  const isCur = isS && it.status === 'watching';
  const w    = parseInt(it.epWatched||0), t = parseInt(it.eps||0);
  const pct  = t ? Math.round(w/t*100) : 0;
  const sc   = _mediaStatusBar(it.status||'not_started');
  const rawName  = isS ? (it.name||`Season ${it.num||i+1}`) : (it.movieTitle||it.name||'Movie');
  const fullName = `${parentTitle} · ${rawName}`;
  return `<div class="tl-item${isCur?' tl-cur':''}${!isS?' tl-mov':''}" draggable="true" data-idx="${i}"
    ondragstart="dDragStart(event,${i})" ondragover="dDragOver(event,${i})"
    ondrop="dDrop(event,${i})" ondragleave="this.classList.remove('drag-over')">
    <span class="tl-drag">⠿</span>
    <span class="tl-type-pill ${isS?'tp-s':'tp-m'}">${isS?`S${it.num||i+1}`:'🎬'}</span>
    <div class="tl-info">
      <div class="tl-name">${esc(fullName)}</div>
      <div class="tl-sub">
        ${stag(it.status||'not_started')}
        ${it.endDate  ? `<span style="font-size:10px;color:#4ade80">✓ ${fmtDate(it.endDate)}</span>` : ''}
        ${it.rating   ? `<span style="font-size:10px;color:#fbbf24">★ ${it.rating}</span>` : ''}
        ${it.upcomingDate ? `<span style="font-size:10px;color:#fb923c">📅 ${fmtDate(it.upcomingDate)}</span>` : ''}
      </div>
    </div>
    <div class="tl-r">
      ${isS&&(t||w) ? `<span class="tl-ep">${w}${t?'/'+t:''} ep</span><div class="mini-bar"><div class="mini-fill" style="width:${pct}%;background:${sc}"></div></div>` : ''}
      ${isS&&it.status==='watching' ? `<div class="ep-ctrl">
        <button class="ep-ctrl-pm" onclick="panelEp('${eid}',${i},-1)">−</button>
        <span class="ep-num">${w}</span>
        <button class="ep-ctrl-pm" onclick="panelEp('${eid}',${i},1)">+</button>
      </div>` : ''}
    </div>
  </div>`;
}

function panelEp(eid, idx, delta) {
  const e = DATA.find(x=>x.id===eid); if (!e) return;
  const it = e.timeline[idx]; if (!it||it.type!=='season') return;
  const w = Math.max(0, parseInt(it.epWatched||0)+delta);
  it.epWatched = it.eps ? Math.min(w, parseInt(it.eps)) : w;
  if (it.eps && it.epWatched>=parseInt(it.eps) && it.status==='watching') it.status='completed';
  e.updatedAt = Date.now(); saveData(DATA); renderDetailPanel(e); renderMediaBody();
}

function dDragStart(ev, i) { DDRG=i; ev.currentTarget.classList.add('dragging'); }
function dDragOver(ev, i)  { ev.preventDefault(); if(DDRG===i)return; ev.currentTarget.classList.add('drag-over'); }
function dDrop(ev, i) {
  ev.preventDefault(); ev.currentTarget.classList.remove('drag-over');
  if (DDRG===null||DDRG===i) return;
  const e = DATA.find(x=>x.id===PEDIT); if (!e) return;
  const item = e.timeline.splice(DDRG,1)[0]; e.timeline.splice(i,0,item);
  DDRG=null; saveData(DATA); renderDetailPanel(e);
}
function initDetailDrag(e) {
  document.querySelectorAll('#dtl-wrap .tl-item').forEach(el => {
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      document.querySelectorAll('.tl-item').forEach(x => x.classList.remove('drag-over'));
    });
  });
}

/* ── Linked Entries Panel ── */
// State for linked entries drag
let LINKED_DRAGING = null;
let LINKED_SOURCE_ID = null;

function getLinkedEntries(entry) {
  if (!entry.linkedGroupId) return [];
  return DATA.filter(e => e.linkedGroupId === entry.linkedGroupId && e.id !== entry.id);
}

function renderLinkedEntries(entry) {
  const linked = getLinkedEntries(entry);
  if (!linked.length) return '';
  
  const panelHtml = linked.map((le, idx) => {
    const st = entryStats(le);
    const g = gbyid(le.genreId);
    const statusColor = _mediaStatusBar(le.status);
    
    return `<div class="linked-item" draggable="true" data-linked-id="${le.id}" data-idx="${idx}"
      ondragstart="linkedDragStart(event,'${entry.id}','${le.id}',${idx})" 
      ondragover="linkedDragOver(event,${idx})" 
      ondrop="linkedDrop(event,'${entry.id}',${idx})" 
      ondragleave="this.classList.remove('drag-over')">
      <span class="linked-drag">⠿</span>
      <div class="linked-main">
        <div class="linked-title">${esc(le.title)}</div>
        <div class="linked-meta">
          <span class="linked-status" style="color:${statusColor};">${_mstag(le.status)}</span>
          <span class="linked-progress">${st.cur} / ${st.tot || '?'} eps · ${st.pct}%</span>
        </div>
      </div>
      <div class="linked-controls">
        <div class="ep-inline">
          <button class="ep-pm" onclick="linkedEpDelta('${entry.id}','${le.id}',-1)">−</button>
          <span class="ep-val">${st.cur}</span>
          <button class="ep-pm" onclick="linkedEpDelta('${entry.id}','${le.id}',1)">+</button>
        </div>
      </div>
    </div>`;
  }).join('');
  
  return `<div class="sec-div"><span class="sec-div-lbl">🔗 Linked Entries (${linked.length})</span><div class="sec-div-line"></div><span class="sec-div-hint">drag ↕ reorder</span></div>
    <div class="linked-wrap" id="linked-wrap-${entry.id}">${panelHtml}</div>`;
}

function linkedDragStart(ev, parentId, linkedId, idx) {
  LINKED_DRAGING = { parentId, linkedId, idx };
  ev.currentTarget.classList.add('dragging');
}

function linkedDragOver(ev, idx) {
  ev.preventDefault();
  if (!LINKED_DRAGING) return;
  ev.currentTarget.classList.add('drag-over');
}

function linkedDrop(ev, parentId, idx) {
  ev.preventDefault();
  ev.currentTarget.classList.remove('drag-over');
  if (!LINKED_DRAGING || LINKED_DRAGING.parentId !== parentId) {
    LINKED_DRAGING = null;
    return;
  }
  if (LINKED_DRAGING.idx === idx) {
    LINKED_DRAGING = null;
    return;
  }
  
  const fromIdx = LINKED_DRAGING.idx;
  const linked = getLinkedEntries(DATA.find(x => x.id === parentId));
  if (fromIdx >= linked.length || idx > linked.length) {
    LINKED_DRAGING = null;
    return;
  }
  
  // Reorder: remove from fromIdx, insert at idx
  const item = linked.splice(fromIdx, 1)[0];
  linked.splice(idx, 0, item);
  
  // Save order back to data by updating linkedGroupId references (order is implicit in render order)
  // Actually, we need a linkedOrder field or similar. For now, we'll rely on display order.
  
  LINKED_DRAGING = null;
  const parent = DATA.find(x => x.id === parentId);
  parent.updatedAt = Date.now();
  saveData(DATA);
  renderDetailPanel(parent);
}

function linkedEpDelta(parentId, linkedId, delta) {
  const linked = DATA.find(x => x.id === linkedId);
  if (!linked) return;
  
  const st = entryStats(linked);
  const newEpCur = Math.max(0, st.cur + delta);
  const maxEps = st.tot || Infinity;
  
  linked.epCur = Math.min(newEpCur, maxEps);
  
  // Auto-mark as completed if watched all episodes
  if (linked.epCur >= maxEps && maxEps > 0 && linked.status === 'watching') {
    linked.status = 'completed';
    if (!linked.endDate) linked.endDate = today();
  }
  
  linked.updatedAt = Date.now();
  saveData(DATA);
  renderDetailPanel(DATA.find(x => x.id === parentId));
  renderMediaBody();
}

function initLinkedDrag(parentId) {
  document.querySelectorAll(`#linked-wrap-${parentId} .linked-item`).forEach(el => {
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      document.querySelectorAll('.linked-item').forEach(x => x.classList.remove('drag-over'));
    });
  });
}

/* ── Form Panel ── */
function renderFormPanel(e) {
  const isEdit = !!e;
  if (e) {
    FORM_TL = JSON.parse(JSON.stringify(e.timeline || []));
  } else {
    FORM_TL = [{ id:uid(), type:'season', num:1, name:'Season 1', status:'not_started',
                 eps:null, epWatched:null, startDate:null, endDate:null, rating:null,
                 epDuration:null, upcomingDate:null, upcomingTime:null }];
  }
  const gOpts = GENRES.map(g => `<option value="${g.id}" ${(e?e.genreId:GACTIVE)===g.id?'selected':''}>${esc(g.name)}</option>`).join('');
  const status = e ? e.status : 'not_started';
  const airingDays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  document.getElementById('panel-inner').innerHTML = `
    <div class="ph">
      <div class="ph-title">${isEdit ? 'Edit Entry' : 'Add New Title'}</div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    <div class="form-wrap">
      <!-- ── MAL Search ── -->
      <div id="mal-search-wrap" style="position:relative;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--brd)">
        <label class="flbl" style="display:flex;align-items:center;gap:5px;margin-bottom:5px">
          <span style="font-size:9px;background:rgba(0,229,255,.12);color:#00e5ff;border:1px solid rgba(0,229,255,.25);border-radius:3px;padding:1px 5px;font-weight:800;letter-spacing:.5px">MAL</span>
          Search MyAnimeList to autofill
        </label>
        <input class="fin" id="mal-search-inp" placeholder="Search anime title…"
          autocomplete="off" oninput="malSearchInput(this.value)">
        <div id="mal-dropdown" style="display:none;position:absolute;left:0;right:0;top:calc(100% - 2px);background:var(--surf);border:1px solid var(--brd2);border-radius:0 0 7px 7px;z-index:900;max-height:260px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.5)"></div>
        <!-- Cover preview + hidden fields -->
        <div id="mal-cover-wrap" style="display:none;margin-top:10px;display:flex;align-items:center;gap:10px">
          <img id="mal-cover-img" style="width:48px;height:68px;object-fit:cover;border-radius:4px;border:1px solid var(--brd)" onerror="this.style.display='none'">
          <div style="font-size:11px;color:var(--mu)">Cover from MAL — all fields below are editable</div>
        </div>
        <input type="hidden" id="f-malid"  value="${esc(e?.malId || '')}">
        <input type="hidden" id="f-malimg" value="${esc(e?.coverImage || '')}">
      </div>
      <!-- ── End MAL Search ── -->
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--mu);margin-bottom:9px;padding-bottom:5px;border-bottom:1px solid var(--brd)">Franchise / Series</div>
      <div class="fg">
        <label class="flbl">Title *</label>
        <input class="fin" id="f-title" placeholder="e.g. Attack on Titan" value="${esc(e?e.title:'')}">
        <span style="font-size:11px;color:var(--mu);margin-top:2px;display:block">Franchise name — seasons hold all details below</span>
      </div>
      <div class="fg-row">
        <div class="fg"><label class="flbl">Genre</label><select class="fin" id="f-genre">${gOpts}</select></div>
        <div class="fg"><label class="flbl">Overall Status</label>
          <select class="fin" id="f-status">
            <option value="not_started" ${status==='not_started'?'selected':''}>○ Not Started</option>
            <option value="watching"    ${status==='watching'?'selected':''}>▶ Watching</option>
            <option value="plan"        ${status==='plan'?'selected':''}>◻ Plan to Watch</option>
            <option value="completed"   ${status==='completed'?'selected':''}>✓ Completed</option>
            <option value="on_hold"     ${status==='on_hold'?'selected':''}>⏸ On Hold</option>
            <option value="dropped"     ${status==='dropped'?'selected':''}>✗ Dropped</option>
            <option value="upcoming"    ${status==='upcoming'?'selected':''}>◉ Upcoming</option>
          </select>
        </div>
      </div>
      <div class="fg-row">
        <div class="fg"><label class="flbl">Airing Day</label>
          <select class="fin" id="f-airingday">
            <option value="">Not airing</option>
            ${airingDays.map((d,i)=>`<option value="${i}" ${e&&e.airingDay===i?'selected':''}>${d}</option>`).join('')}
          </select>
        </div>
        <div class="fg"><label class="flbl">Airing Time (optional)</label>
          <input class="fin" type="time" id="f-airingtime" value="${e&&e.airingTime?e.airingTime:''}">
        </div>
      </div>
      <div class="fg-row">
        <div class="fg"><label class="flbl">Rewatch Count</label>
          <input class="fin" type="number" id="f-rewatch" min="0" placeholder="0" value="${e&&e.rewatchCount?e.rewatchCount:''}">
        </div>
        <div class="fg" style="display:flex;align-items:center;gap:8px;padding-top:18px">
          <input type="checkbox" id="f-fav" ${e&&e.favorite?'checked':''} style="width:14px;height:14px;cursor:pointer;accent-color:var(--ac)">
          <label for="f-fav" class="flbl" style="margin:0;cursor:pointer">★ Favorite</label>
        </div>
      </div>
      <div class="fg"><label class="flbl">Notes</label>
        <textarea class="fin" id="f-notes" placeholder="Your thoughts...">${esc(e?e.notes||'':'')}</textarea>
      </div>
      <div class="fg"><label class="flbl">Watch URL</label>
        <input class="fin" id="f-url" type="url" placeholder="https://..." value="${esc(e?e.watchUrl||'':'')}">
      </div>
      <div class="f-sec">Seasons &amp; Movies</div>
      <div id="ftl-list">${FORM_TL.map((it,i) => tlFormHtml(it,i)).join('')}</div>
      <div class="ftl-add-row">
        <button class="ftl-add" onclick="addTlSeason()">+ Add Season</button>
        <button class="ftl-add" onclick="addTlMovie()">+ Add Movie</button>
      </div>
    </div>
    <div class="panel-actions">
      ${isEdit ? `<button class="btn-del" onclick="askDel('${e.id}')">Delete</button>` : ''}
      <button class="btn-cancel" onclick="closePanel()">Cancel</button>
      <button class="btn-save" onclick="saveEntry('${e?e.id:''}')">Save</button>
    </div>`;

  requestAnimationFrame(() => {
    _malUpdateCoverPreview(e?.coverImage || '');
  });
}

function tlFormHtml(it, i) {
  const isS  = it.type === 'season';
  const ss   = it.status || 'not_started';
  const showUp = ss === 'upcoming';
  return `<div class="ftl-item" draggable="true" data-idx="${i}" data-type="${it.type || 'season'}" data-id="${it.id||''}"
    ondragstart="fDragStart(event,${i})" ondragover="fDragOver(event,${i})" ondrop="fDrop(event,${i})">
    <button class="ftl-rm" onclick="removeTlItem(${i})">✕</button>
    <div class="ftl-head">
      <span class="ftl-drag">⠿</span>
      <span class="tl-type-pill ${isS?'tp-s':'tp-m'}">${isS?'Season':'Movie'}</span>
      ${isS?`<span style="font-size:10px;color:var(--mu)">S${it.num||i+1}</span>`:''}
    </div>
    <div class="fg-row" style="margin-bottom:7px">
      <div class="fg"><label class="flbl">${isS?'Season Name':'Movie Title'}</label>
        <input class="fin" data-fi="name" value="${esc(it.name||it.movieTitle||'')}" placeholder="${isS?'e.g. Season 1':'Movie title'}">
      </div>
      <div class="fg"><label class="flbl">Status</label>
        <select class="fin" data-fi="status" onchange="onTlSC(this,${i})">
          <option value="not_started" ${ss==='not_started'?'selected':''}>○ Not Started</option>
          <option value="plan"        ${ss==='plan'?'selected':''}>◻ Planned</option>
          <option value="watching"    ${ss==='watching'?'selected':''}>▶ Watching</option>
          <option value="completed"   ${ss==='completed'?'selected':''}>✓ Completed</option>
          <option value="upcoming"    ${ss==='upcoming'?'selected':''}>◉ Upcoming</option>
          <option value="dropped"     ${ss==='dropped'?'selected':''}>✗ Dropped</option>
        </select>
      </div>
    </div>
    ${isS ? `<div class="fg-row" style="margin-bottom:7px">
      <div class="fg"><label class="flbl">Total Eps</label><input class="fin" type="number" data-fi="eps" value="${it.eps||''}" placeholder="e.g. 12"></div>
      <div class="fg"><label class="flbl">Watched</label><input class="fin" type="number" data-fi="epWatched" value="${it.epWatched||''}" placeholder="0"></div>
    </div>` : ''}
    <div class="fg-row" style="margin-bottom:7px">
      <div class="fg"><label class="flbl">Start Date</label><input class="fin" type="date" data-fi="startDate" value="${it.startDate||''}"></div>
      <div class="fg"><label class="flbl">Finish Date</label><input class="fin" type="date" data-fi="endDate" id="ftl-end-${i}" value="${it.endDate||''}"></div>
    </div>
    <div class="fg-row" style="margin-bottom:7px">
      <div class="fg"><label class="flbl">Rating (0–10)</label><input class="fin" type="number" data-fi="rating" value="${it.rating||''}" placeholder="—" min="0" max="10" step="0.5"></div>
      <div class="fg"><label class="flbl">Ep Duration (min)</label><input class="fin" type="number" data-fi="epDuration" value="${it.epDuration||''}" placeholder="24" min="1" max="300"></div>
    </div>
    <div class="fg-row" style="display:${showUp?'grid':'none'}" id="ftl-upd-${i}">
      <div class="fg"><label class="flbl">Release Date</label><input class="fin" type="date" data-fi="upcomingDate" value="${it.upcomingDate||''}"></div>
      <div class="fg"><label class="flbl">Release Time</label><input class="fin" type="time" data-fi="upcomingTime" value="${it.upcomingTime||''}"></div>
    </div>
  </div>`;
}

function onTlSC(sel, i) {
  const v = sel.value;
  const row = document.getElementById(`ftl-upd-${i}`);
  if (row) row.style.display = v==='upcoming' ? 'grid' : 'none';
  if (v==='completed') {
    const endEl = sel.closest('.ftl-item').querySelector('[data-fi="endDate"]');
    if (endEl && !endEl.value) endEl.value = today();
  }
}

function collectFormTl() {
  const items = []; let sNum = 0;
  document.querySelectorAll('#ftl-list .ftl-item').forEach(el => {
    const raw  = el.dataset.type;
    const type = (raw && raw !== 'undefined') ? raw : 'season';
    const id   = el.dataset.id   || uid();
    const isS  = type === 'season';
    if (isS) sNum++;
    const get = fi => { const x=el.querySelector(`[data-fi="${fi}"]`); return x?x.value:''; };
    const name=get('name'), status=get('status')||'not_started';
    let endDate=get('endDate')||null;
    if (status==='completed'&&!endDate) endDate=today();
    items.push({
      id, type, num:isS?sNum:null, name:name||null,
      movieTitle:!isS?(name||null):null, status,
      eps:isS?(get('eps')||null):null,
      epWatched:isS?(get('epWatched')||null):null,
      watched:!isS&&status==='completed',
      startDate:get('startDate')||null, endDate,
      rating:get('rating')||null,
      epDuration:get('epDuration')?parseInt(get('epDuration')):null,
      upcomingDate:get('upcomingDate')||null, upcomingTime:get('upcomingTime')||null,
    });
  });
  return items;
}

function addTlSeason() {
  const cur = collectFormTl();
  const num = cur.filter(x=>x.type==='season').length + 1;
  cur.push({ id:uid(), type:'season', num, name:`Season ${num}`, status:'not_started',
             eps:null, epWatched:null, startDate:null, endDate:null, rating:null,
             epDuration:null, upcomingDate:null, upcomingTime:null });
  FORM_TL=cur; refreshFtl();
}
function addTlMovie()    { const cur=collectFormTl(); cur.push({id:uid(),type:'movie',movieTitle:'',name:'',status:'not_started',watched:false,upcomingDate:null,upcomingTime:null}); FORM_TL=cur; refreshFtl(); }
function removeTlItem(i) { const c=collectFormTl(); c.splice(i,1); FORM_TL=c; refreshFtl(); }
function refreshFtl()    { document.getElementById('ftl-list').innerHTML=FORM_TL.map((it,i)=>tlFormHtml(it,i)).join(''); }

function fDragStart(ev,i) { FDRG=i; ev.currentTarget.classList.add('dragging'); }
function fDragOver(ev,i)  { ev.preventDefault(); if(FDRG===i)return; document.querySelectorAll('.ftl-item').forEach(x=>x.classList.remove('drag-over')); ev.currentTarget.classList.add('drag-over'); }
function fDrop(ev,i)      { ev.preventDefault(); document.querySelectorAll('.ftl-item').forEach(x=>x.classList.remove('drag-over','dragging')); if(FDRG===null||FDRG===i)return; const c=collectFormTl(); const item=c.splice(FDRG,1)[0]; c.splice(i,0,item); FORM_TL=c; FDRG=null; refreshFtl(); }

function saveEntry(eid) {
  const title = document.getElementById('f-title').value.trim();
  if (!title) { showAlert('Please enter a title',{title:'Missing Title'}); return; }
  const existing = eid ? DATA.find(x=>x.id===eid) : null;
  const tl = collectFormTl();
  const g  = f => { const el=document.getElementById(f); return el?el.value||null:null; };
  const airingDayEl = document.getElementById('f-airingday');
  const airingDay   = airingDayEl?.value !== '' ? parseInt(airingDayEl.value) : null;
  const entry = {
    id:eid||uid(), title,
    genreId:g('f-genre'), status:g('f-status'),
    airingDay:isNaN(airingDay)?null:airingDay,
    airingTime:g('f-airingtime'),
    rewatchCount:document.getElementById('f-rewatch')?.value?parseInt(document.getElementById('f-rewatch').value):(existing?.rewatchCount||null),
    rewatches:existing?.rewatches||[],
    favorite:document.getElementById('f-fav')?.checked||false,
    pinned:existing?.pinned||false,
    epCur:existing?.epCur||null, epTot:existing?.epTot||null,
    startDate:existing?.startDate||null, endDate:existing?.endDate||null,
    rating:existing?.rating||null, epDuration:existing?.epDuration||null,
    upcomingDate:existing?.upcomingDate||null, upcomingTime:existing?.upcomingTime||null,
    notes:g('f-notes'),
    watchUrl:document.getElementById('f-url')?.value?.trim()||null,
    malId:document.getElementById('f-malid')?.value || existing?.malId || null,
    coverImage:document.getElementById('f-malimg')?.value || existing?.coverImage || null,
    timeline:tl,
    addedAt:existing?existing.addedAt:Date.now(), updatedAt:Date.now(),
  };
  if (entry.status==='completed'&&!entry.endDate&&!tl.length) entry.endDate=today();
  if (eid) { const i=DATA.findIndex(x=>x.id===eid); DATA[i]=entry; } else DATA.unshift(entry);
  saveData(DATA); closePanel(); render(); toast('✓ Saved');
}

function askDel(id) {
  showConfirm('This entry will be permanently deleted.',()=>{
    const _del=DATA.find(x=>x.id===id);
    DATA=DATA.filter(x=>x.id!==id);
    if(_del) addLog('media','Deleted',_del.title);
    saveData(DATA); closePanel(); render();
    if(_del) toastWithUndo(_del.title,()=>{DATA.push(_del);saveData(DATA);render();});
  },{title:'Delete Entry?',okLabel:'Delete'});
}

/* ═══════════════════════════════
   PIN + LONG-PRESS CONTEXT MENU
═══════════════════════════════ */

function _injectPinStyles() {
  if (document.getElementById('m-pin-styles')) return;
  const s = document.createElement('style');
  s.id = 'm-pin-styles';
  s.textContent = `
    /* context menu */
    #m-ctx-menu {
      position: fixed;
      z-index: 99999;
      background: #1a1a24;
      border: 1px solid rgba(255,255,255,.13);
      border-radius: 10px;
      box-shadow: 0 16px 48px rgba(0,0,0,.75);
      min-width: 180px;
      overflow: hidden;
      animation: ctxIn .13s ease;
    }
    @keyframes ctxIn {
      from { opacity:0; transform:scale(.93) translateY(-4px); }
      to   { opacity:1; transform:scale(1)   translateY(0);     }
    }
    .m-ctx-header {
      padding: 9px 14px 7px;
      font-size: 11px;
      font-weight: 700;
      color: rgba(255,255,255,.35);
      letter-spacing: .7px;
      text-transform: uppercase;
      border-bottom: 1px solid rgba(255,255,255,.07);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 220px;
    }
    .m-ctx-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      font-size: 13px;
      color: rgba(255,255,255,.82);
      cursor: pointer;
      transition: background .12s;
      user-select: none;
    }
    .m-ctx-item:hover { background: rgba(255,255,255,.07); }
    .m-ctx-item.danger { color: #f87171; }
    .m-ctx-item .ctx-ico { font-size: 15px; width: 18px; text-align: center; flex-shrink:0; }
    .m-ctx-sep { height: 1px; background: rgba(255,255,255,.07); margin: 3px 0; }

    /* pin badge on card */
    .m-pin-badge {
      font-size: 11px;
      margin-right: 4px;
      vertical-align: middle;
      opacity: .85;
    }

    /* subtle left-border accent for pinned cards */
    .m-card-pinned .m-card-bar {
      width: 4px !important;
      box-shadow: 0 0 8px 1px rgba(251,191,36,.35);
    }
    .m-card-pinned {
      border-color: rgba(251,191,36,.18) !important;
    }

    /* overlay to close ctx menu on outside click */
    #m-ctx-overlay {
      position: fixed;
      inset: 0;
      z-index: 99998;
    }
  `;
  document.head.appendChild(s);
}

/* ── Long-press detection ── */
function startHold(id, ev) {
  cancelHold();
  _HOLD_FIRED = false;
  const touch = ev.touches ? ev.touches[0] : ev;
  const cx = touch.clientX, cy = touch.clientY;
  _HOLD_TIMER = setTimeout(() => {
    _HOLD_TIMER = null;
    _HOLD_FIRED = true;
    showCtxMenu(id, cx, cy);
  }, 500);
}

function cancelHold() {
  if (_HOLD_TIMER) { clearTimeout(_HOLD_TIMER); _HOLD_TIMER = null; }
}

/* ── Context menu ── */
function showCtxMenu(id, x, y) {
  hideCtxMenu();
  _CTX_ENTRY_ID = id;
  const e = DATA.find(d => d.id === id); if (!e) return;

  // overlay to close on outside click
  const ov = document.createElement('div');
  ov.id = 'm-ctx-overlay';
  ov.onclick = hideCtxMenu;
  document.body.appendChild(ov);

  const menu = document.createElement('div');
  menu.id = 'm-ctx-menu';
  const isPinned = !!e.pinned;

  menu.innerHTML = `
    <div class="m-ctx-header">${esc(e.title)}</div>
    <div class="m-ctx-item" onclick="ctxPin('${id}')">
      <span class="ctx-ico">${isPinned ? '📌' : '📍'}</span>
      ${isPinned ? 'Unpin' : 'Pin to Top'}
    </div>
    <div class="m-ctx-item" onclick="hideCtxMenu();openDetail('${id}')">
      <span class="ctx-ico">👁</span>View Details
    </div>
    <div class="m-ctx-item" onclick="hideCtxMenu();openEdit('${id}')">
      <span class="ctx-ico">✏️</span>Edit
    </div>
    <div class="m-ctx-sep"></div>
    <div class="m-ctx-item danger" onclick="hideCtxMenu();askDel('${id}')">
      <span class="ctx-ico">✕</span>Delete
    </div>`;

  document.body.appendChild(menu);

  // position so menu stays on screen
  const mw = 200, mh = 180;
  const vw = window.innerWidth, vh = window.innerHeight;
  menu.style.left = (x + mw > vw ? vw - mw - 8 : x) + 'px';
  menu.style.top  = (y + mh > vh ? y - mh       : y) + 'px';
}

function hideCtxMenu() {
  const m  = document.getElementById('m-ctx-menu');
  const ov = document.getElementById('m-ctx-overlay');
  if (m)  m.remove();
  if (ov) ov.remove();
  _CTX_ENTRY_ID = null;
}

function ctxPin(id) {
  const e = DATA.find(x => x.id === id); if (!e) return;
  e.pinned = !e.pinned;
  e.updatedAt = Date.now();
  saveData(DATA);
  hideCtxMenu();
  renderMediaBody();
  toast(e.pinned ? '📌 Pinned to top' : 'Unpinned');
}

/* ── Section stubs (kept for completeness) ── */
function renderSectionStub(id, c) {
  const meta = { games:{icon:'◈',color:'#f59e0b',phase:5}, books:{icon:'◎',color:'#a78bfa',phase:6}, music:{icon:'♪',color:'#fb923c',phase:7}, settings:{icon:'⚙',color:'#8888aa',phase:8} };
  const m = meta[id]||{icon:'?',color:'var(--ac)',phase:'?'};
  c.innerHTML=`<div style="font-family:var(--fd);font-size:clamp(18px,3vw,30px);font-weight:700;margin-bottom:16px;letter-spacing:1px;text-transform:uppercase;color:${m.color}">${m.icon} ${id.charAt(0).toUpperCase()+id.slice(1)} Codex</div>
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);padding:40px 24px;text-align:center;color:var(--tx2)">
      <div style="font-size:36px;opacity:.3;margin-bottom:12px">${m.icon}</div>
      <p style="font-size:14px">Full section coming in Phase ${m.phase}</p>
    </div>`;
}

// ═══════════════════════════════════════════════════════
//  MAL SEARCH — add/edit form helpers
// ═══════════════════════════════════════════════════════

let _malSearchTimer = null;

function malSearchInput(q) {
  clearTimeout(_malSearchTimer);
  const dd = document.getElementById('mal-dropdown');
  if (!q || q.length < 2) { if (dd) dd.style.display = 'none'; return; }
  if (dd) {
    dd.innerHTML = '<div style="padding:10px 12px;font-size:12px;color:var(--mu)">Searching…</div>';
    dd.style.display = 'block';
  }
  _malSearchTimer = setTimeout(() => _malDoSearch(q), 400);
}

async function _malDoSearch(q) {
  const dd = document.getElementById('mal-dropdown');
  if (!dd) return;
  try {
    const res  = await fetch(
      `https://aether-codex-ai.nadeempubgmobile2-0.workers.dev/mal/search?q=${encodeURIComponent(q)}`
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error);
    _malRenderDropdown(data.results || []);
  } catch(e) {
    dd.innerHTML = `<div style="padding:10px 12px;font-size:12px;color:#fb7185">⚠ ${esc(e.message)}</div>`;
  }
}

function _malRenderDropdown(results) {
  const dd = document.getElementById('mal-dropdown');
  if (!dd) return;
  if (!results.length) {
    dd.innerHTML = '<div style="padding:10px 12px;font-size:12px;color:var(--mu)">No results found</div>';
    dd.style.display = 'block';
    return;
  }
  dd.innerHTML = results.map(r => {
    const eps    = r.episodes   ? `${r.episodes} ep`                  : '';
    const score  = r.score      ? `★ ${r.score}`                      : '';
    const type   = r.media_type ? r.media_type.replace(/_/g, ' ')     : '';
    const meta   = [type, eps, score].filter(Boolean).join(' · ');
    const thumb  = r.image
      ? `<img src="${esc(r.image)}" style="width:32px;height:44px;object-fit:cover;border-radius:3px;flex-shrink:0" onerror="this.style.display='none'">`
      : `<div style="width:32px;height:44px;background:var(--surf3);border-radius:3px;flex-shrink:0"></div>`;
    // Stringify and escape so the string survives the onclick attribute
    const payload = esc(JSON.stringify(r));
    return `<div style="display:flex;align-items:center;gap:9px;padding:8px 11px;cursor:pointer;border-bottom:1px solid var(--brd);transition:background .1s"
      onmouseenter="this.style.background='var(--surf3)'"
      onmouseleave="this.style.background='transparent'"
      onclick="_malSelect('${payload}')">
      ${thumb}
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.title)}</div>
        ${meta ? `<div style="font-size:10px;color:var(--mu);margin-top:2px">${esc(meta)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  dd.style.display = 'block';

  // Close dropdown on outside click
  setTimeout(() => {
    const close = ev => {
      if (!ev.target.closest('#mal-search-wrap')) {
        const d = document.getElementById('mal-dropdown');
        if (d) d.style.display = 'none';
        document.removeEventListener('click', close);
      }
    };
    document.addEventListener('click', close);
  }, 10);
}

function _malSelect(rJson) {
  const r = JSON.parse(rJson);
  const dd = document.getElementById('mal-dropdown');
  if (dd) dd.style.display = 'none';

  // Search field label
  const searchInp = document.getElementById('mal-search-inp');
  if (searchInp) searchInp.value = r.title;

  // Title
  const titleEl = document.getElementById('f-title');
  if (titleEl) titleEl.value = r.title;

  // MAL ID
  const malIdEl = document.getElementById('f-malid');
  if (malIdEl) malIdEl.value = String(r.id || '');

  // Cover image
  const imgEl = document.getElementById('f-malimg');
  if (imgEl) imgEl.value = r.image || '';
  _malUpdateCoverPreview(r.image || '');

  // Synopsis → notes (only if notes currently empty)
  const notesEl = document.getElementById('f-notes');
  if (notesEl && !notesEl.value && r.synopsis) notesEl.value = r.synopsis;

  // Episode count → first season's eps field (if empty)
  if (r.episodes) {
    const firstEps = document.querySelector('#ftl-list .ftl-item [data-fi="eps"]');
    if (firstEps && !firstEps.value) firstEps.value = String(r.episodes);
  }

  // Airing status
  const statusEl = document.getElementById('f-status');
  if (statusEl && r.status) {
    const map = {
      currently_airing: 'watching',
      finished_airing:  'completed',
      not_yet_aired:    'upcoming',
    };
    if (map[r.status]) statusEl.value = map[r.status];
  }

  toast(`✓ Autofilled: ${r.title}`);
}

function _malUpdateCoverPreview(url) {
  const wrap = document.getElementById('mal-cover-wrap');
  const img  = document.getElementById('mal-cover-img');
  if (!wrap || !img) return;
  if (url) { img.src = url; wrap.style.display = 'block'; }
  else       wrap.style.display = 'none';
}