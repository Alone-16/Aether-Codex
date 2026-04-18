// ═══════════════════════════════
//  MEDIA SECTION
// ═══════════════════════════════

import { toast, showConfirm, showAlert, closePanel } from '../shared/ui.js';

/* ---------- visual helpers ---------- */
function _mediaStatusBar(s) {
  const map = {
    watching:'#7dd3fc', completed:'#4ade80', plan:'#a78bfa',
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

/* ---------- filter chip state ----------
   null  = follow hidden #fstatus (legacy / initial)
   ''    = explicit "All statuses"
   other = that status id
   (Never use _M_STATUS_CHIP || fstatus — '' is falsy and would wrongly fall through.) */
let _M_STATUS_CHIP = null;

/* ---------- hold / context-menu state ---------- */
let _HOLD_TIMER   = null;
let _CTX_ENTRY_ID = null;
let _HOLD_FIRED   = false;

function _mediaListStatusFilter() {
  if (_M_STATUS_CHIP === null || _M_STATUS_CHIP === undefined) {
    return document.getElementById('fstatus')?.value || '';
  }
  return _M_STATUS_CHIP;
}

function _renderFilterChips() {
  const chips = [
    { val:'',          lbl:'All',       col:'rgba(255,255,255,.45)' },
    { val:'watching',  lbl:'Watching',  col:'#7dd3fc' },
    { val:'completed', lbl:'Completed', col:'#4ade80' },
    { val:'plan',      lbl:'Planned',   col:'#a78bfa' },
    { val:'on_hold',   lbl:'On Hold',   col:'#fbbf24' },
    { val:'dropped',   lbl:'Dropped',   col:'#f87171' },
    { val:'upcoming',  lbl:'Upcoming',  col:'#fb923c' },
  ];
  const fstEff = _mediaListStatusFilter();
  return chips.map((c) => {
    const active = c.val === fstEff;
    const onClick = c.val === '' ? `setMediaChip('all')` : `setMediaChip('${c.val}')`;
    return `<button type="button" class="m-chip${active ? ' active' : ''}" style="--chip-c:${c.col}" onclick="${onClick}">
      <span class="m-chip-dot" aria-hidden="true"></span>${c.lbl}
    </button>`;
  }).join('');
}

function fadeRenderMediaBody() {
  const el = document.getElementById('media-body'); if (!el) return;
  
  // Capture current height and strictly lock dimensions to prevent ANY scroll jerk
  const prevHeight = el.offsetHeight;
  el.style.boxSizing = 'border-box';
  el.style.height = prevHeight + 'px';
  el.style.overflow = 'hidden';

  // 1. Trigger Fade Out
  el.style.transition = 'opacity 0.12s ease, transform 0.12s ease';
  el.style.opacity = '0';
  el.style.transform = 'translateY(-4px)';
  el.style.pointerEvents = 'none';

  // 2. Wait for fade out, then swap to loader state
  setTimeout(() => {
    if (!document.getElementById('m-spinner-style')) {
      const style = document.createElement('style');
      style.id = 'm-spinner-style';
      style.textContent = `
        @keyframes m-spin { 100% { transform: rotate(360deg); } }
        @keyframes m-pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
      `;
      document.head.appendChild(style);
    }

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;">
        <div style="width:36px;height:36px;border:3px solid rgba(var(--ac-rgb),0.15);border-top-color:rgba(var(--ac-rgb),0.9);border-radius:50%;animation:m-spin 0.7s cubic-bezier(0.4, 0, 0.2, 1) infinite;margin-bottom:16px;box-shadow:0 0 15px rgba(var(--ac-rgb),0.2)"></div>
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;animation:m-pulse 1.2s ease infinite;color:rgba(var(--ac-rgb),0.7)">Loading</div>
      </div>
    `;
    
    // Animate loader in AND height
    const loaderHeight = Math.max(prevHeight, 250);
    el.style.transition = 'none';
    el.style.transform = 'translateY(6px)';
    el.offsetHeight; // Force reflow
    
    el.style.transition = 'height 0.15s ease, opacity 0.15s ease, transform 0.15s ease';
    el.style.height = loaderHeight + 'px';
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';

    // 3. Briefly show loader, then fade it out
    setTimeout(() => {
      el.style.transition = 'opacity 0.12s ease, transform 0.12s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-4px)';

      // 4. Swap to new content and animate final height
      setTimeout(() => {
        renderMediaBody();
        
        // Measure exact new height
        el.style.height = 'auto';
        const newHeight = el.offsetHeight;
        
        // Prep transition from loader height to new height
        el.style.height = loaderHeight + 'px';
        el.style.transition = 'none';
        el.style.transform = 'translateY(8px)';
        el.offsetHeight; // Force reflow
        
        // Fire combined cinematic animation
        el.style.transition = 'height 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)';
        el.style.height = newHeight + 'px';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
        el.style.pointerEvents = 'all';

        // 5. Cleanup strict height bindings
        setTimeout(() => {
          el.style.height = 'auto';
          el.style.overflow = 'visible';
          el.style.boxSizing = '';
        }, 360);

      }, 120);
    }, 220); // Hold loader visible briefly
  }, 120);
}

function setMediaChip(val) {
  const v = val === 'all' ? '' : val;
  _M_STATUS_CHIP = v;
  const fstEl = document.getElementById('fstatus');
  if (fstEl) fstEl.value = v;
  fadeRenderMediaBody();
}

// ═══════════════════════════════════════════════════════
//  LINKED-GROUP MIGRATION V3
//  Guard: localStorage key 'ac_linked_migrated_v3'
//  Fixes two broken patterns:
//    Pattern A — linkedGroupId === another entry's id (one-sided link)
//    Pattern B — entries with non-empty timeline[] (not yet flattened)
//    Pattern C — removes leftover timeline field from every entry
// ═══════════════════════════════════════════════════════
function runLinkedMigrationV3() {
  if (ls.str('ac_linked_migrated_v3') === '1') return;

  let dirty = false;
  const entryIdSet = new Set(DATA.map(e => e.id));

  // ── Step A: fix broken partial linking ──
  // Collect clusters: anchorId -> [entries that point to it as linkedGroupId]
  const clusters = {}; // anchorId -> [entry, ...]
  DATA.forEach(e => {
    if (e.linkedGroupId && entryIdSet.has(e.linkedGroupId)) {
      const k = e.linkedGroupId;
      if (!clusters[k]) clusters[k] = [];
      clusters[k].push(e);
    }
  });

  Object.entries(clusters).forEach(([anchorId, members]) => {
    const anchor = DATA.find(e => e.id === anchorId);
    const newGroupId = uid();

    // Fix anchor (typically S1 — currently has linkedGroupId: null)
    if (anchor) {
      anchor.linkedGroupId = newGroupId;
      if (anchor.linkedGroupOrder == null) anchor.linkedGroupOrder = 1;
    }

    // Fix members (S2, S3 …) — keep their existing linkedGroupOrder
    members.forEach(e => { e.linkedGroupId = newGroupId; });
    dirty = true;
  });

  // ── Step B: flatten any remaining timeline entries ──
  const timelineEntries = DATA.filter(
    e => Array.isArray(e.timeline) && e.timeline.length > 0
  );

  const newFlatEntries = [];
  timelineEntries.forEach(e => {
    // Skip if already part of a group from Step A
    if (!e.linkedGroupId) {
      e.linkedGroupId = uid();
      e.linkedGroupOrder = 1;
    }
    const groupId = e.linkedGroupId;

    e.timeline.forEach((item, idx) => {
      const isMovie = item.type === 'movie';
      const rawName = item.name || item.movieTitle || `Part ${idx + 2}`;
      const newEntry = {
        id:              uid(),
        title:           `${e.title} ${rawName}`,
        genreId:         e.genreId,
        status:          item.status || (isMovie && item.watched ? 'completed' : 'not_started'),
        epCur:           isMovie
                           ? (item.watched ? '1' : '0')
                           : (item.epWatched != null ? String(item.epWatched) : null),
        epTot:           isMovie ? '1' : (item.eps != null ? String(item.eps) : null),
        malId:           null,
        linkedGroupId:   groupId,
        linkedGroupOrder: (item.num != null ? item.num : idx + 1) + 1,
        epDuration:      item.epDuration || e.epDuration || null,
        startDate:       item.startDate    || null,
        endDate:         item.endDate      || null,
        upcomingDate:    item.upcomingDate || null,
        upcomingTime:    item.upcomingTime || null,
        rating:          item.rating       || null,
        notes:           null,
        watchUrl:        e.watchUrl        || null,
        airingDay:       null,
        airingTime:      null,
        favorite:        false,
        pinned:          false,
        rewatches:       [],
        rewatchCount:    null,
        addedAt:         e.addedAt         || Date.now(),
        updatedAt:       Date.now(),
      };
      newFlatEntries.push(newEntry);
    });

    delete e.timeline;
    dirty = true;
  });

  if (newFlatEntries.length) DATA.push(...newFlatEntries);

  // ── Step C: strip any remaining timeline field ──
  DATA.forEach(e => {
    if ('timeline' in e) { delete e.timeline; dirty = true; }
  });

  if (dirty) saveData(DATA);
  ls.setStr('ac_linked_migrated_v3', '1');
}

/* ═══════════════════════════════
   MAIN RENDER
═══════════════════════════════ */
function _initMediaDropdownClose() {
  if (window._acMddClose) return;
  window._acMddClose = true;
  document.addEventListener('click', (e) => {
    if (e.target.closest('.m-sort-dd')) return;
    document.querySelectorAll('.m-sort-dd .m-dd-menu.open').forEach((menu) => {
      menu.classList.remove('open');
      menu.closest('.m-sort-dd')?.querySelector('.m-dd-btn')?.setAttribute('aria-expanded', 'false');
    });
  });
}

function toggleMediaSortDd(e) {
  e.stopPropagation();
  const dd = e.currentTarget.closest('.m-sort-dd');
  const menu = dd?.querySelector('.m-dd-menu');
  const btn = dd?.querySelector('.m-dd-btn');
  if (!menu || !btn) return;
  const wasOpen = menu.classList.contains('open');
  document.querySelectorAll('.m-sort-dd .m-dd-menu').forEach((m) => m.classList.remove('open'));
  document.querySelectorAll('.m-sort-dd .m-dd-btn').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  if (!wasOpen) {
    menu.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
  }
}

function setMediaSort(val) {
  const sel = document.getElementById('fsort');
  if (sel) sel.value = val;
  fadeRenderMediaBody();
}

function renderMedia(c) {
  runLinkedMigrationV3();
  _injectPremiumStyles();
  _initMediaDropdownClose();
  const tabs = ['List', 'Dashboard', 'Upcoming', 'Incomplete'];
  const g    = gbyid(GACTIVE);

  c.innerHTML = `
    <div class="m-topbar">
      <div class="m-topbar-start">
        <div id="gdrop" class="m-gdrop-wrap">
          <button type="button" class="m-genre-btn" onclick="toggleGdrop(event)" aria-haspopup="listbox" aria-expanded="false">
            <span class="m-genre-dot" id="gdot" style="background:${g.color}"></span>
            <span id="gdrop-lbl">${esc(g.name)}</span>
            <span class="m-genre-chev" aria-hidden="true"></span>
          </button>
          <div id="gdrop-menu" class="m-gdrop-menu" role="listbox" aria-label="Media lists"></div>
        </div>

        <nav class="m-tabs" aria-label="Media views">
          ${tabs.map((t,i) => `<button type="button" class="m-tab${MEDIA_PAGE === ['list','dashboard','upcoming','incomplete'][i] ? ' active' : ''}"
            onclick="setMediaPage('${['list','dashboard','upcoming','incomplete'][i]}')">${t}</button>`).join('')}
        </nav>
      </div>

      <button type="button" class="m-add-btn" onclick="openAdd()"><span class="m-add-plus" aria-hidden="true">+</span> Add title</button>
    </div>

    <div id="media-body"></div>`;

  buildGenreMenu();
  const dot = document.getElementById('gdot');
  if (dot) dot.style.background = g.color;
  const glbl = document.getElementById('gdrop-lbl');
  if (glbl) glbl.textContent = g.name;

  renderMediaBody();

  // Media Background Canvas (Magical Glowing Cherry Petals)
  setTimeout(() => {
    document.getElementById('media-interactive-bg')?.remove();
    const cvs = document.createElement('canvas');
    cvs.id = 'media-interactive-bg';
    cvs.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:0; pointer-events:none; opacity:1;';
    document.body.appendChild(cvs);

    const ctx = cvs.getContext('2d', { alpha: true });
    let w = window.innerWidth, h = window.innerHeight;
    
    // High-DPI Scaling for Crystal Clear Leaves
    function setSize() {
      w = window.innerWidth;
      h = window.innerHeight;
      let dpr = window.devicePixelRatio || 1;
      cvs.width = w * dpr;
      cvs.height = h * dpr;
      ctx.scale(dpr, dpr);
    }
    setSize();

    let p = [];
    let num = w < 768 ? 40 : 80; // Optimized leaf density
    let style = getComputedStyle(document.documentElement);
    let acRgb = style.getPropertyValue('--ac-rgb').trim() || '125,211,252';
    
    // Pre-render the complex vector petal to an offscreen canvas
    // This provides a massive performance boost by avoiding path/gradient/shadow calculations per frame
    const pCvs = document.createElement('canvas');
    const pr = 20; // Base radius for high-res prerender
    pCvs.width = pr * 6; // Padding for shadow blur
    pCvs.height = pr * 6;
    const pCtx = pCvs.getContext('2d');
    
    pCtx.translate(pCvs.width / 2, pCvs.height / 2);
    pCtx.beginPath();
    pCtx.moveTo(0, -pr * 1.6);
    pCtx.bezierCurveTo(pr * 1.2, -pr * 0.4, pr * 0.9, pr * 1.1, 0.25 * pr, pr * 1.3);
    pCtx.lineTo(0, pr * 1.05); 
    pCtx.lineTo(-0.25 * pr, pr * 1.3);
    pCtx.bezierCurveTo(-pr * 0.9, pr * 1.1, -pr * 1.2, -pr * 0.4, 0, -pr * 1.6);
    
    pCtx.shadowColor = `rgba(${acRgb}, 0.8)`;
    pCtx.shadowBlur = pr * 1.2;
    
    let baseGrad = pCtx.createLinearGradient(0, -pr * 1.6, 0, pr * 1.3);
    baseGrad.addColorStop(0, `rgba(${acRgb}, 1)`);
    baseGrad.addColorStop(0.6, `rgba(${acRgb}, 0.6)`);
    baseGrad.addColorStop(1, `rgba(${acRgb}, 0.1)`);
    pCtx.fillStyle = baseGrad; 
    pCtx.fill();
    
    for (let i = 0; i < num; i++) {
      p.push({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() * 6 + 4, // Slightly larger base scale
        vx: (Math.random() - 0.5) * 0.5, // Relaxed horizontal drift
        vy: Math.random() * 0.5 + 0.3, // Greatly reduced fall speed for serenity
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.02, // Gentle rotation
        swayAmp: Math.random() * 0.8 + 0.4, // Mellow pendulum swing
        swaySpeed: Math.random() * 0.015 + 0.005,
        time: Math.random() * 100,
        glowPulse: Math.random() * Math.PI * 2,
        glowSpeed: Math.random() * 0.02 + 0.01
      });
    }
    
    let mx = -999, my = -999;
    if (window._mediaBgListener) window.removeEventListener('mousemove', window._mediaBgListener);
    window._mediaBgListener = e => { mx = e.clientX; my = e.clientY; };
    window.addEventListener('mousemove', window._mediaBgListener);
    
    if (window._mediaBgResize) window.removeEventListener('resize', window._mediaBgResize);
    window._mediaBgResize = () => { if(cvs) setSize(); };
    window.addEventListener('resize', window._mediaBgResize);

    function draw() {
      if (document.documentElement.getAttribute('data-section') !== 'media') {
        window.removeEventListener('mousemove', window._mediaBgListener);
        window.removeEventListener('resize', window._mediaBgResize);
        cvs.remove();
        return;
      }
      ctx.clearRect(0, 0, w, h);
      
      // Global comp to blend glowing petals beautifully
      ctx.globalCompositeOperation = 'screen';
      
      for (let i = 0; i < p.length; i++) {
        let a = p[i];
        a.time += a.swaySpeed;
        a.glowPulse += a.glowSpeed;
        
        let dx = a.x - mx, dy = a.y - my, dist = dx * dx + dy * dy;
        
        // Initialize momentum property if missing
        a.pushX = a.pushX || 0;
        
        // Dynamic sideways wind scattering when mouse is near
        if (dist < 50000) {
          let force = (50000 - dist) / 50000;
          let dir = dx > 0 ? 1 : -1;
          // Add horizontal momentum (stronger closer to center)
          a.pushX += dir * force * 0.8;
          // Add a burst of spin due to the wind
          a.spin += dir * force * 0.008;
        }

        // Apply air friction to wind push and spin burst
        a.pushX *= 0.92;
        // Slowly return spin to original normal gentle speed (-0.02 to 0.02)
        if (a.spin > 0.02) a.spin -= 0.001;
        if (a.spin < -0.02) a.spin += 0.001;

        let currentVx = a.vx + a.pushX + Math.sin(a.time) * a.swayAmp;

        a.x += currentVx; 
        a.y += a.vy;
        a.angle += a.spin;
        
        if (a.y > h + 50) {
          a.y = -50;
          a.x = Math.random() * w;
        }
        if (a.x < -50) a.x = w + 50;
        if (a.x > w + 50) a.x = -50;
        
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.angle);
        
        // Scale according to particle radius vs pre-rendered radius
        let scale = a.r / pr;
        ctx.scale(scale, scale);
        
        // Dynamic magical glow effect via global alpha (hardware accelerated)
        let currentGlow = (Math.sin(a.glowPulse) + 1) / 2; // 0 to 1
        ctx.globalAlpha = 0.4 + currentGlow * 0.6;
        
        ctx.drawImage(pCvs, -pCvs.width / 2, -pCvs.height / 2);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      requestAnimationFrame(draw);
    }
    draw();
  }, 50);
}

function setMediaPage(p) {
  MEDIA_PAGE     = p;
  SEARCH         = '';
  _M_STATUS_CHIP = null;
  const srch  = document.getElementById('srch');
  if (srch)  srch.value  = '';
  const fstEl = document.getElementById('fstatus');
  if (fstEl) fstEl.value = '';

  // Update active tab state visually
  document.querySelectorAll('.m-tabs .m-tab').forEach(btn => {
    const isMatched = btn.getAttribute('onclick')?.includes(`'${p}'`);
    btn.classList.toggle('active', !!isMatched);
  });

  fadeRenderMediaBody();
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
  const fst = _mediaListStatusFilter();
  const fs  = document.getElementById('fsort')?.value || 'title';

  if (SEARCH) {
    d = d.filter(e => e.title.toLowerCase().includes(SEARCH));
    d = fs === 'added' ? [...d].sort((a,b) => (b.addedAt||0)-(a.addedAt||0)) : [...d].sort((a,b) => a.title.localeCompare(b.title));
    return { data:d, fst:'' };
  }

  d = fs === 'added' ? [...d].sort((a,b) => (b.addedAt||0)-(a.addedAt||0)) : [...d].sort((a,b) => a.title.localeCompare(b.title));
  return { data:d, fst };
}

function expandRows(entries, fst) {
  const rows = [];
  entries.forEach(e => {
    if (!fst || e.status === fst) {
      rows.push({ kind:'entry', e, status:e.status, pinned: e.pinned });
    }
  });
  rows.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  return rows;
}

function renderList(c) {
  const { data, fst } = filteredData();
  const flat    = expandRows(data, fst);
  const pCount  = flat.length;
  const sortVal = document.getElementById('fsort')?.value || 'title';
  const sortLbl = sortVal === 'added' ? 'Recently added' : 'A → Z';

  let html = `
    <div class="m-filter-row">
      <div class="m-filter-chips">${_renderFilterChips()}</div>
      <div class="m-sort-wrap">
        <span class="m-sort-hint">Sort</span>
        <div class="m-sort-dd m-dd">
          <button type="button" class="m-dd-btn" onclick="toggleMediaSortDd(event)" aria-haspopup="listbox" aria-expanded="false" aria-label="Sort list">
            <span class="m-dd-lbl">${sortLbl}</span>
            <span class="m-dd-chev" aria-hidden="true"></span>
          </button>
          <div class="m-dd-menu" id="m-sort-menu" role="listbox">
            <button type="button" class="m-dd-opt${sortVal === 'title' ? ' active' : ''}" role="option" aria-selected="${sortVal === 'title' ? 'true' : 'false'}" onclick="event.stopPropagation();setMediaSort('title')">A → Z</button>
            <button type="button" class="m-dd-opt${sortVal === 'added' ? ' active' : ''}" role="option" aria-selected="${sortVal === 'added' ? 'true' : 'false'}" onclick="event.stopPropagation();setMediaSort('added')">Recently added</button>
          </div>
        </div>
      </div>
    </div>
    <div class="m-cnt-lbl">${pCount} title${pCount!==1?'s':''}</div>`;

  if (!flat.length) {
    html += `<div class="m-empty"><div class="m-empty-ring" aria-hidden="true"></div><p class="m-empty-title">No titles yet</p><p class="m-empty-sub">Add one with the button above</p></div>`;
    c.innerHTML = html; return;
  }

  const STATUS_META = {
    watching:    { lbl:'Watching',    cls:'watching'    },
    plan:        { lbl:'Planned',     cls:'plan'        },
    not_started: { lbl:'Not Started', cls:'not_started' },
    completed:   { lbl:'Completed',   cls:'completed'   },
    on_hold:     { lbl:'On Hold',     cls:'on_hold'     },
    dropped:     { lbl:'Dropped',     cls:'dropped'     },
    upcoming:    { lbl:'Upcoming',    cls:'upcoming'    },
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
          ${rows.map((r, i) => rowHtml(r.e, i)).join('')}
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

/** True if this linked franchise "part" is finished (status or full episode count). */
function linkedPartIsComplete(e) {
  if (!e) return false;
  if (e.status === 'completed' || e.status === 'dropped') return true;
  const tot = parseInt(e.epTot || 0, 10);
  const cur = parseInt(e.epCur || 0, 10);
  return tot > 0 && cur >= tot;
}

// Keep for backward compat — returns null for flat entries
function activeSeason(e) { return null; }

/* ── Card rows ── */
function rowHtml(e, idx = 0) {
  const isA    = PANEL && PEDIT === e.id;
  const col    = _mediaStatusBar(e.status);
  const rCur   = parseInt(e.epCur || 0);
  const rTot   = parseInt(e.epTot || 0);
  const rPct   = rTot ? Math.round(rCur/rTot*100) : (rCur > 0 ? 100 : 0);
  const showCtrl = ['watching','completed','on_hold','dropped'].includes(e.status);
  const hasBar   = rTot > 0 || rCur > 0;
  const rewBadge = e.rewatches?.length
    ? `<span class="m-rewatch-badge">↺${e.rewatches.length}</span>` : '';
  const grpBadge = e.linkedGroupId
    ? `<span style="font-size:9px;font-weight:700;background:rgba(251,191,36,.1);color:#fbbf24;border:1px solid rgba(251,191,36,.2);border-radius:3px;padding:1px 4px">🔗</span>` : '';

  return `<div class="m-card${isA ? ' m-card-active' : ''}${e.pinned ? ' m-card-pinned' : ''}" id="row-${e.id}" style="--card-glow:${col};--status-col:${col};animation-delay:${idx*0.04}s"
    onclick="if(window._HOLD_FIRED){window._HOLD_FIRED=false;return;}openDetail('${e.id}')"
    onmousemove="const r=this.getBoundingClientRect(),x=event.clientX-r.left,y=event.clientY-r.top;this.style.setProperty('--mouse-x',x+'px');this.style.setProperty('--mouse-y',y+'px');this.style.setProperty('--rot-x',((y/r.height)-0.5)*-8+'deg');this.style.setProperty('--rot-y',((x/r.width)-0.5)*8+'deg')"
    onmousedown="startHold('${e.id}',event)"
    onmouseup="cancelHold()"
    onmouseleave="cancelHold();this.style.setProperty('--rot-x','0deg');this.style.setProperty('--rot-y','0deg')"
    ontouchstart="startHold('${e.id}',event)"
    ontouchend="cancelHold();this.style.setProperty('--rot-x','0deg');this.style.setProperty('--rot-y','0deg')"
    ontouchmove="cancelHold()">
    <div class="m-card-strip" style="--strip-col:${col}"></div>
    <div class="m-card-body">
      <div class="m-card-info">
        <div class="m-card-title">${e.pinned ? '<span class="m-pin-badge">📌</span>' : ''}${esc(e.title)}</div>
        <div class="m-card-meta">
          ${_mstag(e.status)}
          ${e.malId ? `<span class="m-badge-link" onclick="event.stopPropagation();window.open('https://myanimelist.net/anime/${e.malId}','_blank')">🔗</span>` : ''}
          ${e.malId ? `<span class="m-badge-mal">MAL</span>` : ''}
          ${rewBadge}
          ${grpBadge}
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
          <button class="m-act-btn m-act-more" onclick="openEdit('${e.id}')" title="Edit">⋯</button>
          <button class="m-act-btn m-act-del" onclick="askDel('${e.id}')" title="Delete">✕</button>
          ${e.status === 'watching' && e.watchUrl
            ? `<button class="m-act-btn m-act-play" onclick="event.stopPropagation();window.open('${esc(e.watchUrl)}','_blank')" title="Watch">▶</button>` : ''}
        </div>
      </div>
    </div>
  </div>`;
}

/* ── Quick ep controls ── */
function quickEp(id, delta) {
  const e = DATA.find(x => x.id === id); if (!e) return;
  e.epCur = Math.max(0, (parseInt(e.epCur) || 0) + delta);
  if (e.epTot && e.epCur >= parseInt(e.epTot) && e.status !== 'dropped' && e.status !== 'upcoming') {
    if (['watching', 'plan', 'not_started', 'on_hold'].includes(e.status)) {
      e.status = 'completed';
      if (!e.endDate) e.endDate = today();
    }
  }
  e.updatedAt = Date.now(); saveData(DATA); renderMediaBody();
  if (PANEL === 'detail' && PEDIT === id) renderDetailPanel(DATA.find(x => x.id === id));
  _malSyncQuiet(e);
}

// Keep for backward compat (called from old timeline row HTML that no longer renders)
function quickTlEp(eid, idx, delta) { quickEp(eid, delta); }

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
    totalMin += parseInt(e.epCur||0)*dur;
    if (e.rating) { rSum += parseFloat(e.rating); rN++; }
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
      ${stats.map((s,i) => `<div class="m-dash-stat" style="--card-glow:rgba(var(--ac-rgb),0.5);animation-delay:${i*0.04}s" onmousemove="const r=this.getBoundingClientRect(),x=event.clientX-r.left,y=event.clientY-r.top;this.style.setProperty('--mouse-x',x+'px');this.style.setProperty('--mouse-y',y+'px');this.style.setProperty('--rot-x',((y/r.height)-0.5)*-8+'deg');this.style.setProperty('--rot-y',((x/r.width)-0.5)*8+'deg')" onmouseleave="this.style.setProperty('--rot-x','0deg');this.style.setProperty('--rot-y','0deg')"><div class="m-dash-stat-v">${s.v}</div><div class="m-dash-stat-l">${s.l}</div></div>`).join('')}
    </div>
    <div class="m-dash-time-row">
      <div class="m-dash-tc" style="--card-glow:rgba(var(--ac-rgb),0.5);animation-delay:0.3s" onmousemove="const r=this.getBoundingClientRect(),x=event.clientX-r.left,y=event.clientY-r.top;this.style.setProperty('--mouse-x',x+'px');this.style.setProperty('--mouse-y',y+'px');this.style.setProperty('--rot-x',((y/r.height)-0.5)*-6+'deg');this.style.setProperty('--rot-y',((x/r.width)-0.5)*6+'deg')" onmouseleave="this.style.setProperty('--rot-x','0deg');this.style.setProperty('--rot-y','0deg')">
        <div class="m-dash-tc-v">${fmtMin(totalMin)}</div>
        <div class="m-dash-tc-l">Time Watched</div>
        <div class="m-dash-tc-d">${(totalMin/60).toFixed(0)} hours total</div>
      </div>
      <div class="m-dash-tc" style="--card-glow:rgba(var(--ac-rgb),0.5);animation-delay:0.38s" onmousemove="const r=this.getBoundingClientRect(),x=event.clientX-r.left,y=event.clientY-r.top;this.style.setProperty('--mouse-x',x+'px');this.style.setProperty('--mouse-y',y+'px');this.style.setProperty('--rot-x',((y/r.height)-0.5)*-6+'deg');this.style.setProperty('--rot-y',((x/r.width)-0.5)*6+'deg')" onmouseleave="this.style.setProperty('--rot-x','0deg');this.style.setProperty('--rot-y','0deg')">
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
    if (e.upcomingDate && e.status === 'upcoming') items.push({ id:e.id, title:e.title, date:e.upcomingDate, time:e.upcomingTime||null, label:'New Release' });
  });
  items.sort((a,b) => new Date(a.date)-new Date(b.date));

  const rows = items.map((it, i) => {
    const d    = new Date(it.date + 'T00:00:00');
    const diff = Math.ceil((d-now)/86400000);
    const mon  = d.toLocaleString('default',{month:'short'}).toUpperCase();
    let cls='m-up-far', lbl=`${diff}d`;
    if (diff<=0)  { cls='m-up-past'; lbl='Released'; }
    else if (diff<=3)  { cls='m-up-soon'; lbl=`${diff}d left`; }
    else if (diff<=14) { cls='m-up-near'; lbl=`${diff}d`; }
    return `<div class="m-up-card" onclick="openDetail('${it.id}')" style="--card-glow:#fb923c;animation-delay:${i*0.04}s" onmousemove="const r=this.getBoundingClientRect(),x=event.clientX-r.left,y=event.clientY-r.top;this.style.setProperty('--mouse-x',x+'px');this.style.setProperty('--mouse-y',y+'px');this.style.setProperty('--rot-x',((y/r.height)-0.5)*-6+'deg');this.style.setProperty('--rot-y',((x/r.width)-0.5)*6+'deg')" onmouseleave="this.style.setProperty('--rot-x','0deg');this.style.setProperty('--rot-y','0deg')">
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
    ${rows || `<div class="m-empty"><p class="m-empty-title">Nothing scheduled</p><p class="m-empty-sub">Upcoming releases you add will show here</p></div>`}`;
}

/* ═══════════════════════════════
   INCOMPLETE
═══════════════════════════════ */
function renderIncomplete(c) {
  // Linked groups touching this genre: use every entry with the same linkedGroupId so
  // counts match the detail panel (and stale plan/not_started + full eps still count as done).
  const groupsById = {};
  DATA.filter(e => e.genreId === GACTIVE && e.linkedGroupId).forEach(e => {
    const gid = e.linkedGroupId;
    if (!groupsById[gid]) groupsById[gid] = DATA.filter(x => x.linkedGroupId === gid);
  });

  const incompleteGroups = Object.values(groupsById).filter(members => {
    const someDone = members.some(linkedPartIsComplete);
    const someLeft = members.some(e => !linkedPartIsComplete(e));
    return someDone && someLeft;
  });

  const rows = incompleteGroups.map((members, i) => {
    const sorted = [...members].sort((a, b) => (a.linkedGroupOrder ?? 0) - (b.linkedGroupOrder ?? 0));
    const firstIncomplete = sorted.find(e => !linkedPartIsComplete(e));
    const lead = firstIncomplete || sorted[0];
    const first = sorted[0];
    const done = members.filter(linkedPartIsComplete).length;
    const leadCol = _mediaStatusBar(lead.status);
    return `<div class="m-card" onclick="openDetail('${first.id}')" style="--card-glow:${leadCol};--status-col:${leadCol};animation-delay:${i*0.04}s" onmousemove="const r=this.getBoundingClientRect(),x=event.clientX-r.left,y=event.clientY-r.top;this.style.setProperty('--mouse-x',x+'px');this.style.setProperty('--mouse-y',y+'px');this.style.setProperty('--rot-x',((y/r.height)-0.5)*-6+'deg');this.style.setProperty('--rot-y',((x/r.width)-0.5)*6+'deg')" onmouseleave="this.style.setProperty('--rot-x','0deg');this.style.setProperty('--rot-y','0deg')">
      <div class="m-card-strip" style="--strip-col:${leadCol}"></div>
      <div class="m-card-body">
        <div class="m-card-info">
          <div class="m-card-title">${esc(first.title.replace(/ S\d+$| Season \d+$/,''))}</div>
          <div class="m-card-meta">${_mstag(lead.status)}<span class="m-card-seasons">${done}/${members.length} parts done</span></div>
        </div>
        <div class="m-card-r">
          <div class="m-card-actions" onclick="event.stopPropagation()">
            <button class="m-act-btn m-act-more" onclick="openEdit('${first.id}')" title="Edit">⋯</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  c.innerHTML = `
    <div class="m-dash-title">⚠ Incomplete Series <span>// ${esc(gbyid(GACTIVE).name)}</span></div>
    ${rows || `<div class="m-empty"><p class="m-empty-title">All caught up</p><p class="m-empty-sub">No incomplete linked series in this list</p></div>`}`;
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
function openDetail(id) { openPanel('detail', id); }
function openEdit(id)   { openPanel('edit',   id); }
function openAdd()      { openPanel('add',    null); }
function openAddLinkedEntry(parentId) {
  const parent = DATA.find(x => x.id === parentId); if (!parent) return;
  const groupId = parent.linkedGroupId || parent.id;
  const group = DATA.filter(x => x.linkedGroupId === groupId || x.id === groupId);
  PENDING_LINKED_GROUP_ID = parent.linkedGroupId || null;
  PENDING_LINKED_GROUP_ORDER = group.length + 1;
  PENDING_LINKED_GROUP_LABEL = parent.title;
  openPanel('add', null);
}

/* ── Detail Panel ── */
function renderDetailPanel(e) {
  const st = entryStats(e);
  const g  = gbyid(e.genreId);

  if (e.malId && !e.coverImage && !e._fetchingCover) {
    e._fetchingCover = true;
    const type = e.genreId === 'manga' ? 'manga' : 'anime';
    fetch(`https://api.jikan.moe/v4/${type}/${e.malId}`)
      .then(r => r.json())
      .then(d => {
        if (d?.data?.images?.jpg?.large_image_url) {
          e.coverImage = d.data.images.jpg.large_image_url;
          saveData(DATA);
          if (PANEL === 'detail' && PEDIT === e.id) renderDetailPanel(e);
        }
      }).catch(err => {
        console.warn('Jikan fetch failed:', err);
        e._fetchingCover = false;
      });
  }

  const coverBg = e.coverImage ? `url('${esc(e.coverImage)}')` : `linear-gradient(135deg, ${g.color}, rgba(var(--ac-rgb),0.2))`;

  document.getElementById('panel-inner').innerHTML = `
    <div class="m-panel-hero">
      <div class="m-panel-hero-bg" style="background-image: ${coverBg}"></div>
      <div class="m-panel-hero-overlay"></div>
      <button class="ph-close m-panel-close" onclick="closePanel()">✕</button>
      <div class="m-panel-hero-content">
        ${e.coverImage ? `<img src="${esc(e.coverImage)}" class="m-panel-cover" alt="Cover" onerror="this.style.display='none'">` : ''}
        <div class="m-panel-text">
          <div class="ph-title m-panel-title">${esc(e.title)}</div>
          <div class="pbadges m-panel-badges">
            <span class="m-genre-badge" style="background:${h2r(g.color,.14)};color:${g.color};border:1px solid ${h2r(g.color,.25)}">${esc(g.name)}</span>
            ${_mstag(e.status)}
            ${e.favorite ? '<span style="color:#fbbf24;text-shadow:0 0 10px rgba(251,191,36,0.8);font-size:14px;padding-left:4px">★</span>' : ''}
          </div>
        </div>
      </div>
    </div>
    <div class="pstats m-panel-stats">
      <div class="pstat"><div class="pstat-v">${st.tot||'—'}</div><div class="pstat-l">Total Eps</div></div>
      <div class="pstat"><div class="pstat-v">${st.cur}</div><div class="pstat-l">Watched</div></div>
      <div class="pstat"><div class="pstat-v">${st.time}</div><div class="pstat-l">Est. Time</div></div>
      <div class="pstat"><div class="pstat-v">${st.pct}%</div><div class="pstat-l">Progress</div><div class="pprog"><div class="pprog-fill" style="width:${st.pct}%"></div></div></div>
    </div>
    <div class="m-panel-body">
      ${(e.startDate||e.endDate) ? `<div style="padding:10px 20px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;gap:16px;font-size:11px;color:var(--tx2);background:rgba(255,255,255,0.01)">
        ${e.startDate ? `<span>Started: <b style="color:var(--tx)">${fmtDate(e.startDate)}</b></span>` : ''}
        ${e.endDate   ? `<span>Finished: <b style="color:var(--tx)">${fmtDate(e.endDate)}</b></span>` : ''}
      </div>` : ''}
      ${e.malId ? `<div style="padding:10px 20px;border-bottom:1px solid var(--brd);display:flex;align-items:center;gap:10px;background:linear-gradient(90deg, rgba(var(--ac-rgb),0.08), transparent)">
        <span style="font-size:9px;font-weight:800;letter-spacing:.5px;background:rgba(var(--ac-rgb),.15);color:var(--ac);border:1px solid rgba(var(--ac-rgb),.3);border-radius:4px;padding:2px 6px;flex-shrink:0">MAL</span>
        <span style="font-size:12px;color:var(--tx2);font-weight:600">ID #${esc(String(e.malId))}</span>
        ${window.window.SETTINGS?.malRefreshToken
          ? `<span style="font-size:10px;color:#4ade80;margin-left:2px;font-weight:600">● Connected</span>
             <button onclick="event.stopPropagation();_syncMALListEntry(DATA.find(x=>x.id==='${e.id}')).catch(()=>toast('MAL sync failed','#fb7185'))"
               style="margin-left:auto;font-size:11px;font-weight:600;color:var(--ac);background:rgba(var(--ac-rgb),.1);border:1px solid rgba(var(--ac-rgb),.25);border-radius:6px;padding:5px 12px;cursor:pointer;white-space:nowrap;transition:all 0.2s">↻ Sync Now</button>`
          : `<span style="margin-left:auto;font-size:11px;color:#fb7185;font-weight:600">● Not connected</span>`
        }
      </div>` : ''}
      <div style="padding:16px 20px;border-bottom:1px solid var(--brd)">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:var(--mu);margin-bottom:12px">Details</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px">
          <div class="m-detail-box">
            <div class="m-detail-lbl">EPISODES</div>
            <div class="m-detail-val">${e.epCur||0}${e.epTot?' / '+e.epTot:' watched'}</div>
          </div>
          <div class="m-detail-box">
            <div class="m-detail-lbl">DURATION</div>
            <div class="m-detail-val">${e.epDuration||24} min / ep</div>
          </div>
          ${e.rating ? `<div class="m-detail-box">
            <div class="m-detail-lbl">RATING</div>
            <div class="m-detail-val" style="color:#fbbf24">★ ${e.rating} / 10</div>
          </div>` : ''}
          ${e.airingDay!=null ? `<div class="m-detail-box" style="grid-column:span 2">
            <div class="m-detail-lbl">AIRING</div>
            <div class="m-detail-val" style="color:var(--ac)">📺 ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][e.airingDay]}${e.airingTime?' at '+e.airingTime:''}</div>
          </div>` : ''}
        </div>
      </div>
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
    </div>
    <div class="panel-actions">
      <button class="btn-del" onclick="askDel('${e.id}')">Delete</button>
      ${e.status==='completed' ? `<button class="btn-cancel" onclick="startRewatch('${e.id}')" style="background:rgba(var(--ac-rgb),.1);color:var(--ac);border:1px solid rgba(var(--ac-rgb),.3)">↺ Rewatch</button>` : ''}
      <button class="btn-cancel" onclick="openEdit('${e.id}')">Edit</button>
    </div>`;
}

/* ═══════════════════════════════
   LINKED ENTRIES
═══════════════════════════════ */

/**
 * getLinkedEntries(entry)
 * Returns all DATA entries sharing entry.linkedGroupId, sorted by linkedGroupOrder,
 * excluding the entry itself. Returns [] for standalone entries.
 */
function getLinkedEntries(entry) {
  if (!entry?.linkedGroupId) return [];
  return DATA
    .filter(x => x.linkedGroupId === entry.linkedGroupId && x.id !== entry.id)
    .sort((a, b) => (a.linkedGroupOrder ?? 0) - (b.linkedGroupOrder ?? 0));
}

/**
 * renderLinkedEntries(entry)
 * Renders the "Linked Entries" section for the detail panel.
 * Includes a "Link Entry" button and an "Unlink" button on each card.
 */
function renderLinkedEntries(entry) {
  if (!entry) return '';
  const linked = getLinkedEntries(entry);

  const headerRow = `
    <div class="linked-actions">
      <button class="btn-add-linked" onclick="openLinkPicker('${entry.id}')">🔗 Link Entry</button>
      ${linked.length ? `<span class="linked-hint">${linked.length} linked title${linked.length !== 1 ? 's' : ''}</span>` : ''}
    </div>`;

  if (!linked.length) {
    return `<div class="sec-div">
        <span class="sec-div-lbl">Linked Series</span>
        <div class="sec-div-line"></div>
      </div>
      ${headerRow}`;
  }

  const cards = linked.map(le => {
    const st          = entryStats(le);
    const statusColor = _mediaStatusBar(le.status);
    const grpOrd      = le.linkedGroupOrder != null ? `<span style="font-size:9px;color:var(--mu)">Part ${le.linkedGroupOrder}</span>` : '';
    return `<div class="linked-item" onclick="openDetail('${le.id}')">
      <div class="linked-main">
        <div class="linked-title">${esc(le.title)}</div>
        <div class="linked-meta">
          ${_mstag(le.status)}
          ${grpOrd}
          <span class="linked-progress">${st.cur}/${st.tot||'?'} eps</span>
          ${le.malId ? `<span style="font-size:9px;background:rgba(var(--ac-rgb),.08);color:rgba(var(--ac-rgb),.55);border:1px solid rgba(var(--ac-rgb),.15);border-radius:3px;padding:1px 4px">MAL</span>` : ''}
        </div>
      </div>
      <div class="linked-controls" onclick="event.stopPropagation()">
        <div class="ep-inline">
          <button class="ep-pm" onclick="linkedEpDelta('${entry.id}','${le.id}',-1)">−</button>
          <span class="ep-val">${st.cur}</span>
          <button class="ep-pm" onclick="linkedEpDelta('${entry.id}','${le.id}',1)">+</button>
        </div>
        <button onclick="unlinkEntry('${le.id}')" title="Unlink this entry"
          style="width:22px;height:22px;border-radius:4px;background:rgba(251,113,133,.08);border:1px solid rgba(251,113,133,.2);color:#fb7185;font-size:10px;cursor:pointer;flex-shrink:0;margin-left:2px">✕</button>
      </div>
    </div>`;
  }).join('');

  return `<div class="sec-div">
      <span class="sec-div-lbl">Linked Series</span>
      <div class="sec-div-line"></div>
    </div>
    ${headerRow}
    <div class="linked-wrap" id="linked-wrap-${entry.id}">${cards}</div>`;
}

/**
 * linkedEpDelta — increments/decrements a flat linked entry's episode count,
 * then re-renders the parent's detail panel.
 */
function linkedEpDelta(parentId, linkedId, delta) {
  const linked = DATA.find(x => x.id === linkedId);
  if (!linked) return;

  const cur    = parseInt(linked.epCur || 0);
  const tot    = parseInt(linked.epTot || 0);
  const newCur = Math.max(0, cur + delta);
  linked.epCur = tot ? String(Math.min(newCur, tot)) : String(newCur);

  if (tot && parseInt(linked.epCur) >= tot && linked.status !== 'dropped' && linked.status !== 'upcoming') {
    if (['watching', 'plan', 'not_started', 'on_hold'].includes(linked.status)) {
      linked.status = 'completed';
      if (!linked.endDate) linked.endDate = today();
    }
  }

  linked.updatedAt = Date.now();
  saveData(DATA);

  const parent = DATA.find(x => x.id === parentId);
  if (parent) renderDetailPanel(parent);
  renderMediaBody();
}

/* ── Link Picker ── */

/**
 * openLinkPicker(sourceId)
 * Opens a modal for searching and selecting an existing entry to link.
 */
function openLinkPicker(sourceId) {
  const source = DATA.find(x => x.id === sourceId); if (!source) return;

  const modal = document.createElement('div');
  modal.id = 'link-picker-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box" style="max-width:460px;max-height:82vh;display:flex;flex-direction:column;gap:0;padding:0;overflow:hidden">
      <div style="padding:18px 20px 12px;border-bottom:1px solid var(--brd)">
        <div class="modal-title" style="margin-bottom:6px">🔗 Link Entry</div>
        <div class="modal-msg" style="margin-bottom:10px">
          Link <b>${esc(source.title)}</b> with another entry in the same franchise or series.
        </div>
        <input class="fin" id="lp-search" placeholder="Search titles…"
          oninput="renderLinkPickerList('${sourceId}',this.value)"
          style="width:100%;box-sizing:border-box">
      </div>
      <div id="lp-list" style="flex:1;overflow-y:auto;padding:10px 16px;display:flex;flex-direction:column;gap:5px;min-height:120px;max-height:340px"></div>
      <div class="modal-btns" style="padding:10px 20px;border-top:1px solid var(--brd)">
        <button class="modal-btn cancel" onclick="document.getElementById('link-picker-modal').remove()">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  renderLinkPickerList(sourceId, '');
  setTimeout(() => document.getElementById('lp-search')?.focus(), 60);
}

/**
 * renderLinkPickerList(sourceId, q)
 * Populates the list inside the link picker modal.
 */
function renderLinkPickerList(sourceId, q) {
  const el = document.getElementById('lp-list'); if (!el) return;
  const source = DATA.find(x => x.id === sourceId);
  if (!source) return;

  const qLow = (q || '').toLowerCase();
  // Show entries of same genreId, exclude source and entries already in source's group
  const candidates = DATA.filter(e =>
    e.id !== sourceId &&
    e.genreId === source.genreId &&
    (source.linkedGroupId ? e.linkedGroupId !== source.linkedGroupId : true) &&
    (!qLow || e.title.toLowerCase().includes(qLow))
  ).slice(0, 25);

  if (!candidates.length) {
    el.innerHTML = `<div style="color:var(--mu);font-size:13px;text-align:center;padding:18px">No matching entries found</div>`;
    return;
  }

  el.innerHTML = candidates.map(e => {
    const st  = entryStats(e);
    const col = _mediaStatusBar(e.status);
    const grp = e.linkedGroupId
      ? `<span style="font-size:10px;color:#fbbf24;margin-left:4px">🔗 In group</span>` : '';
    return `<div onclick="confirmLinkEntries('${sourceId}','${e.id}')"
      style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--surf2);border:1px solid var(--brd);border-radius:6px;cursor:pointer;transition:border-color .12s"
      onmouseover="this.style.borderColor='var(--ac)'" onmouseout="this.style.borderColor='var(--brd)'">
      <div style="width:3px;height:34px;background:${col};border-radius:2px;flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.title)}</div>
        <div style="font-size:11px;color:var(--mu);margin-top:2px;display:flex;gap:6px;align-items:center">
          ${_mstag(e.status)}
          <span>${st.cur}/${st.tot||'?'} eps</span>
          ${grp}
        </div>
      </div>
    </div>`;
  }).join('');
}

/**
 * confirmLinkEntries(sourceId, targetId)
 * Links two entries into the same group. Creates a new group UUID if neither has one.
 */
function confirmLinkEntries(sourceId, targetId) {
  document.getElementById('link-picker-modal')?.remove();

  const source = DATA.find(x => x.id === sourceId);
  const target = DATA.find(x => x.id === targetId);
  if (!source || !target) return;

  // Prefer source's group > target's group > new UUID
  const groupId = source.linkedGroupId || target.linkedGroupId || uid();

  // Assign source into group if not already
  if (!source.linkedGroupId) {
    const members = DATA.filter(e => e.linkedGroupId === groupId);
    const maxOrd  = members.reduce((m, e) => Math.max(m, e.linkedGroupOrder ?? 0), 0);
    source.linkedGroupId    = groupId;
    source.linkedGroupOrder = maxOrd === 0 ? 1 : maxOrd + 1;
  }

  // Assign target into group if not already in this group
  if (target.linkedGroupId !== groupId) {
    const members = DATA.filter(e => e.linkedGroupId === groupId);
    const maxOrd  = members.reduce((m, e) => Math.max(m, e.linkedGroupOrder ?? 0), 0);
    target.linkedGroupId    = groupId;
    target.linkedGroupOrder = maxOrd + 1;
  }

  source.updatedAt = Date.now();
  target.updatedAt = Date.now();
  saveData(DATA);

  renderDetailPanel(source);
  renderMediaBody();
  toast(`✓ Linked: "${source.title}" ↔ "${target.title}"`);
}

/**
 * unlinkEntry(id)
 * Removes linkedGroupId and linkedGroupOrder from one entry only.
 * If only 1 member remains in the group afterward, clears them too.
 */
function unlinkEntry(id) {
  const entry = DATA.find(x => x.id === id);
  if (!entry?.linkedGroupId) return;

  const groupId      = entry.linkedGroupId;
  const groupMembers = DATA.filter(e => e.linkedGroupId === groupId);

  entry.linkedGroupId    = null;
  entry.linkedGroupOrder = null;
  entry.updatedAt        = Date.now();

  // If only 1 entry remains in the group, clear it too
  const remaining = groupMembers.filter(e => e.id !== id);
  if (remaining.length === 1) {
    remaining[0].linkedGroupId    = null;
    remaining[0].linkedGroupOrder = null;
    remaining[0].updatedAt        = Date.now();
  }

  saveData(DATA);

  // Re-render the currently open panel (which may be one of the remaining entries)
  const panelEntry = PEDIT ? DATA.find(x => x.id === PEDIT) : null;
  if (panelEntry) renderDetailPanel(panelEntry);
  renderMediaBody();
  toast('Unlinked');
}

/* ── Form Panel ── */

// State for pending linked group (used when adding a new linked entry)
let PENDING_LINKED_GROUP_ID    = null;
let PENDING_LINKED_GROUP_ORDER = null;
let PENDING_LINKED_GROUP_LABEL = null;

function renderFormPanel(e) {
  const isEdit = !!e;

  if (e && e.malId && !e.coverImage && !e._fetchingCover) {
    e._fetchingCover = true;
    const type = e.genreId === 'manga' ? 'manga' : 'anime';
    fetch(`https://api.jikan.moe/v4/${type}/${e.malId}`)
      .then(r => r.json())
      .then(d => {
        if (d?.data?.images?.jpg?.large_image_url) {
          e.coverImage = d.data.images.jpg.large_image_url;
          saveData(DATA);
          if (PANEL === 'edit' && PEDIT === e.id) {
            const imgEl = document.getElementById('f-malimg');
            if (imgEl) imgEl.value = e.coverImage;
            if (typeof _malUpdateCoverPreview === 'function') _malUpdateCoverPreview(e.coverImage);
          }
        }
      }).catch(err => {
        console.warn('Jikan fetch failed:', err);
        e._fetchingCover = false;
      });
  }

  const pendingGroupId    = !e ? PENDING_LINKED_GROUP_ID    : null;
  const pendingGroupOrder = !e ? PENDING_LINKED_GROUP_ORDER : null;
  const pendingGroupLabel = !e ? PENDING_LINKED_GROUP_LABEL : null;
  const gOpts = GENRES.map(g => `<option value="${g.id}" ${(e?e.genreId:GACTIVE)===g.id?'selected':''}>${esc(g.name)}</option>`).join('');
  const status = e ? e.status : 'not_started';
  const airingDays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const linkedGroupId    = e?.linkedGroupId    || pendingGroupId    || '';
  const linkedGroupOrder = e?.linkedGroupOrder ?? pendingGroupOrder ?? '';
  if (!e) {
    PENDING_LINKED_GROUP_ID    = null;
    PENDING_LINKED_GROUP_ORDER = null;
    PENDING_LINKED_GROUP_LABEL = null;
  }

  document.getElementById('panel-inner').innerHTML = `
    <div class="ph">
      <div class="ph-title">${isEdit ? 'Edit Entry' : 'Add New Title'}</div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    <div class="form-wrap">
      <!-- ── MAL Search ── -->
      <div id="mal-search-wrap" style="position:relative;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--brd)">
        <label class="flbl" style="display:flex;align-items:center;gap:5px;margin-bottom:5px">
          <span style="font-size:9px;background:rgba(var(--ac-rgb),.12);color:var(--ac);border:1px solid rgba(var(--ac-rgb),.25);border-radius:3px;padding:1px 5px;font-weight:800;letter-spacing:.5px">MAL</span>
          Search MyAnimeList to autofill
        </label>
        <input class="fin" id="mal-search-inp" placeholder="Search anime title…"
          autocomplete="off" oninput="malSearchInput(this.value)">
        <div id="mal-dropdown" style="display:none;position:absolute;left:0;right:0;top:calc(100% - 2px);background:var(--surf);border:1px solid var(--brd2);border-radius:0 0 7px 7px;z-index:900;max-height:260px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.5)"></div>
        <div id="mal-cover-wrap" style="display:none;margin-top:10px;display:flex;align-items:center;gap:10px">
          <img id="mal-cover-img" style="width:48px;height:68px;object-fit:cover;border-radius:4px;border:1px solid var(--brd)" onerror="this.style.display='none'">
          <div style="font-size:11px;color:var(--mu)">Cover from MAL — all fields below are editable</div>
        </div>
        <input type="hidden" id="f-malid"  value="${esc(e?.malId || '')}">
        <input type="hidden" id="f-malimg" value="${esc(e?.coverImage || '')}">
      </div>
      <!-- ── End MAL Search ── -->
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--mu);margin-bottom:9px;padding-bottom:5px;border-bottom:1px solid var(--brd)">Entry Details</div>
      <div class="fg">
        <label class="flbl">Title *</label>
        <input class="fin" id="f-title" placeholder="e.g. Attack on Titan Season 1" value="${esc(e?e.title:'')}">
      </div>
      <div class="fg-row">
        <div class="fg"><label class="flbl">Genre</label><select class="fin" id="f-genre">${gOpts}</select></div>
        <div class="fg"><label class="flbl">Status</label>
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
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--mu);margin:14px 0 9px;padding:5px 0 5px;border-top:1px solid var(--brd);border-bottom:1px solid var(--brd)">Progress</div>
      <div class="fg-row">
        <div class="fg"><label class="flbl">Episodes Watched</label>
          <input class="fin" type="number" id="f-epcur" min="0" placeholder="0" value="${e?e.epCur||'':''}">
        </div>
        <div class="fg"><label class="flbl">Total Episodes</label>
          <input class="fin" type="number" id="f-eptot" min="0" placeholder="e.g. 12" value="${e?e.epTot||'':''}">
        </div>
      </div>
      <div class="fg"><label class="flbl">Episode Duration (minutes)</label>
        <input class="fin" type="number" id="f-epduration" min="1" max="300" placeholder="24" value="${e?e.epDuration||'':''}">
      </div>
      <div class="fg-row">
        <div class="fg"><label class="flbl">Rating (0–10)</label>
          <input class="fin" type="number" id="f-rating" min="0" max="10" step="0.5" placeholder="—" value="${e?e.rating||'':''}">
        </div>
        <div class="fg"><label class="flbl">Rewatch Count</label>
          <input class="fin" type="number" id="f-rewatch" min="0" placeholder="0" value="${e&&e.rewatchCount?e.rewatchCount:''}">
        </div>
      </div>
      <div class="fg-row">
        <div class="fg"><label class="flbl">Start Date</label>
          <input class="fin" type="date" id="f-startdate" value="${e?e.startDate||'':''}">
        </div>
        <div class="fg"><label class="flbl">End Date</label>
          <input class="fin" type="date" id="f-enddate" value="${e?e.endDate||'':''}">
        </div>
      </div>
      <div class="fg-row">
        <div class="fg" style="display:flex;align-items:center;gap:8px;padding-top:0">
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
      <input type="hidden" id="f-linked-group" value="${esc(linkedGroupId)}">
      <input type="hidden" id="f-linked-order" value="${linkedGroupOrder}">
      ${pendingGroupLabel ? `<div style="padding:10px 12px;margin:10px 0 0;background:rgba(var(--ac-rgb),.08);border:1px solid rgba(var(--ac-rgb),.18);border-radius:6px;font-size:12px;color:var(--tx2)">Linking to <strong>${esc(pendingGroupLabel)}</strong></div>` : ''}
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

function saveEntry(eid) {
  const title = document.getElementById('f-title').value.trim();
  if (!title) { showAlert('Please enter a title',{title:'Missing Title'}); return; }
  const existing = eid ? DATA.find(x=>x.id===eid) : null;
  const g  = f => { const el=document.getElementById(f); return el?el.value||null:null; };
  const airingDayEl = document.getElementById('f-airingday');
  const airingDay   = airingDayEl?.value !== '' ? parseInt(airingDayEl.value) : null;
  const linkedGroupId = document.getElementById('f-linked-group')?.value || existing?.linkedGroupId || null;
  const linkedGroupOrderRaw = document.getElementById('f-linked-order')?.value;
  const linkedGroupOrder = linkedGroupOrderRaw !== null && linkedGroupOrderRaw !== ''
    ? parseInt(linkedGroupOrderRaw)
    : existing?.linkedGroupOrder ?? null;

  const epCurVal  = document.getElementById('f-epcur')?.value?.trim();
  const epTotVal  = document.getElementById('f-eptot')?.value?.trim();
  const epDurVal  = document.getElementById('f-epduration')?.value?.trim();
  const ratingVal = document.getElementById('f-rating')?.value?.trim();

  const entry = {
    id:eid||uid(), title,
    genreId:g('f-genre'), status:g('f-status'),
    airingDay:isNaN(airingDay)?null:airingDay,
    airingTime:g('f-airingtime'),
    rewatchCount:document.getElementById('f-rewatch')?.value?parseInt(document.getElementById('f-rewatch').value):(existing?.rewatchCount||null),
    rewatches:existing?.rewatches||[],
    favorite:document.getElementById('f-fav')?.checked||false,
    pinned:existing?.pinned||false,
    epCur: epCurVal ? String(parseInt(epCurVal)) : null,
    epTot: epTotVal ? String(parseInt(epTotVal)) : null,
    startDate: g('f-startdate'),
    endDate:   g('f-enddate'),
    rating: ratingVal ? parseFloat(ratingVal) : null,
    epDuration: epDurVal ? parseInt(epDurVal) : null,
    upcomingDate:existing?.upcomingDate||null, upcomingTime:existing?.upcomingTime||null,
    notes:g('f-notes'),
    watchUrl:document.getElementById('f-url')?.value?.trim()||null,
    malId:document.getElementById('f-malid')?.value || existing?.malId || null,
    coverImage:document.getElementById('f-malimg')?.value || existing?.coverImage || null,
    linkedGroupId,
    linkedGroupOrder,
    addedAt:existing?existing.addedAt:Date.now(), updatedAt:Date.now(),
  };
  const epC = parseInt(entry.epCur || 0, 10);
  const epT = parseInt(entry.epTot || 0, 10);
  if (epT > 0 && epC >= epT && entry.status !== 'dropped' && entry.status !== 'upcoming') {
    if (['watching', 'plan', 'not_started', 'on_hold'].includes(entry.status)) {
      entry.status = 'completed';
      if (!entry.endDate) entry.endDate = today();
    }
  }
  if (entry.status==='completed'&&!entry.endDate) entry.endDate=today();
  if (eid) { const i=DATA.findIndex(x=>x.id===eid); DATA[i]=entry; } else DATA.unshift(entry);
  saveData(DATA); closePanel(); render(); toast('✓ Saved');
  if (entry.malId) {
    if (!window.window.SETTINGS?.malRefreshToken) {
      toast('Entry saved — MAL not connected (Settings → Security)', '#fbbf24');
    } else {
      const shouldSync = !existing || entry.status !== existing.status || String(entry.epCur) !== String(existing.epCur) || String(entry.rating) !== String(existing.rating);
      if (shouldSync) {
        _syncMALListEntry(entry).catch(err => {
          console.warn('[MAL] sync failed', err);
          toast('MAL sync failed: ' + (err.message || 'Unknown error'), '#fb7185');
        });
      }
    }
  }
}

async function _syncMALListEntry(entry, silent = false) {
  if (!entry?.malId) return false;
  if (entry.genreId !== 'anime' && entry.genreId !== 'manga') return false;
  if (!window.window.SETTINGS?.malRefreshToken) {
    if (!silent) toast('MAL not connected — go to Settings → Security to connect', '#fbbf24');
    return false;
  }
  const malId = String(entry.malId);
  const statusMap = {
    watching: 'watching',
    completed: 'completed',
    on_hold: 'on_hold',
    dropped: 'dropped',
    plan: 'plan_to_watch',
    not_started: 'plan_to_watch',
    upcoming: 'plan_to_watch',
  };
  const status = statusMap[entry.status] || 'plan_to_watch';
  const epCur  = parseInt(entry.epCur || '0') || 0;
  const score  = entry.rating != null && entry.rating !== '' ? Number(entry.rating) : undefined;

  const payload = {
    access_token:  window.window.SETTINGS?.malAccessToken || null,
    refresh_token: window.window.SETTINGS?.malRefreshToken || null,
    status,
    num_watched_episodes: epCur,
  };
  if (!Number.isNaN(score) && score !== undefined) payload.score = score;

  const res = await fetch(`${window._WORKER}/mal/list/${encodeURIComponent(malId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error_description || data?.error || 'MAL update failed');
  }
  const data = await res.json();
  if (data.access_token) {
    window.window.SETTINGS.malAccessToken = data.access_token;
    if (data.expires_in) window.window.SETTINGS.malTokenExpiry = String(Date.now() + (data.expires_in - 60) * 1000);
  }
  if (data.refresh_token) window.window.SETTINGS.malRefreshToken = data.refresh_token;
  window.saveSettings(window.SETTINGS);
  if (data.updated) {
    ls.setStr('ac_mal_last_sync', String(Date.now()));
    ls.setStr('ac_mal_last_sync_title', entry.title || '');
    if (!silent) toast('✓ MAL synced: ' + (entry.title || 'entry updated'), 'var(--ac)');
  }
  return data.updated || false;
}

function _malSyncQuiet(e) {
  if (!e?.malId || !window.window.SETTINGS?.malRefreshToken) return;
  if (e.genreId !== 'anime' && e.genreId !== 'manga') return;
  _syncMALListEntry(e, true).catch(err => console.warn('[MAL] background sync failed:', err));
}

async function malBulkSyncAll(onProgress) {
  const entries = DATA.filter(e => e.malId && (e.genreId === 'anime' || e.genreId === 'manga'));
  if (!entries.length) return { total: 0, success: 0, failed: 0 };
  if (!window.window.SETTINGS?.malRefreshToken) return { error: 'not_connected' };
  let success = 0, failed = 0;
  for (let i = 0; i < entries.length; i++) {
    try {
      const ok = await _syncMALListEntry(entries[i], true);
      ok !== false ? success++ : failed++;
    } catch(_) { failed++; }
    if (onProgress) onProgress(i + 1, entries.length);
    if (i < entries.length - 1) await new Promise(r => setTimeout(r, 500));
  }
  ls.setStr('ac_mal_last_sync', String(Date.now()));
  return { total: entries.length, success, failed };
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

function _injectPremiumStyles() {
  if (document.getElementById('m-premium-styles')) return;
  const s = document.createElement('style');
  s.id = 'm-premium-styles';
  s.textContent = `
    /* ────────────────────────────────────────────────────────
       ULTRA PREMIUM GLASSMORPHISM & VISUAL EXCELLENCE
       ──────────────────────────────────────────────────────── */

    /* Typography & Smoothness Enhancements */
    * {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Floating, Glassy Topbar */
    .m-topbar {
      background: rgba(15, 15, 20, 0.4) !important;
      backdrop-filter: blur(24px) saturate(1.5) !important;
      -webkit-backdrop-filter: blur(24px) saturate(1.5) !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
      padding: 12px 24px !important;
      border-radius: 0 0 24px 24px;
      margin: -16px -16px 20px -16px !important;
      box-shadow: 0 10px 40px -10px rgba(0,0,0,0.5);
      position: relative;
      z-index: 10;
      transition: all 0.3s ease;
    }

    /* Modern Tabs with Animated Indicators */
    .m-tab {
      position: relative;
      background: transparent !important;
      color: rgba(255,255,255,0.6) !important;
      font-weight: 600 !important;
      padding: 8px 16px !important;
      transition: color 0.3s ease !important;
      overflow: hidden;
      border-radius: 8px;
    }
    .m-tab:hover {
      color: rgba(255,255,255,0.9) !important;
      background: rgba(255,255,255,0.03) !important;
    }
    .m-tab.active {
      color: #fff !important;
      text-shadow: 0 0 12px rgba(255,255,255,0.4);
    }
    .m-tab.active::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 60%;
      height: 3px;
      background: rgba(var(--ac-rgb), 1);
      box-shadow: 0 0 12px rgba(var(--ac-rgb), 0.8);
      border-radius: 3px 3px 0 0;
      animation: tabUnderline 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes tabUnderline {
      from { width: 0; opacity: 0; }
      to { width: 60%; opacity: 1; }
    }

    /* Add Button Radiant Glow */
    .m-add-btn {
      background: linear-gradient(135deg, rgba(var(--ac-rgb), 0.9), rgba(var(--ac-rgb), 0.6)) !important;
      box-shadow: 0 4px 20px rgba(var(--ac-rgb), 0.4) !important;
      border: 1px solid rgba(255,255,255,0.2) !important;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }
    .m-add-btn:hover {
      transform: translateY(-2px) scale(1.05);
      box-shadow: 0 8px 30px rgba(var(--ac-rgb), 0.6) !important;
      background: linear-gradient(135deg, rgba(var(--ac-rgb), 1), rgba(var(--ac-rgb), 0.7)) !important;
    }

    /* Context Menu */
    #m-ctx-menu {
      position: fixed;
      z-index: 99999;
      background: rgba(18, 18, 26, 0.85);
      backdrop-filter: blur(24px) saturate(150%);
      -webkit-backdrop-filter: blur(24px) saturate(150%);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      box-shadow: 0 30px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.1);
      min-width: 200px;
      overflow: hidden;
      animation: ctxIn .2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes ctxIn {
      0% { opacity:0; transform:scale(.9) translateY(-10px); }
      100% { opacity:1; transform:scale(1) translateY(0); }
    }
    .m-ctx-header {
      padding: 10px 14px 8px;
      font-size: 11px;
      font-weight: 800;
      color: rgba(255,255,255,.45);
      letter-spacing: .8px;
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
      gap: 12px;
      padding: 12px 14px;
      font-size: 13px;
      font-weight: 500;
      color: rgba(255,255,255,.85);
      cursor: pointer;
      transition: all .15s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
    }
    .m-ctx-item:hover { 
      background: rgba(255,255,255,.07); 
      padding-left: 18px;
    }
    .m-ctx-item.danger { color: #f87171; }
    .m-ctx-item.danger:hover { background: rgba(248,113,113,0.1); }
    .m-ctx-item .ctx-ico { font-size: 15px; width: 22px; text-align: center; flex-shrink:0; opacity: 0.9; }
    .m-ctx-sep { height: 1px; background: rgba(255,255,255,.05); margin: 4px 0; }
    
    /* Premium Pin Badge */
    .m-pin-badge { font-size: 11px; margin-right: 6px; vertical-align: middle; filter: drop-shadow(0 0 6px rgba(251,191,36,0.8)); display: inline-block; animation: pulsePin 2s infinite ease-in-out; }
    @keyframes pulsePin { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15) rotate(5deg); } }
    
    /* Card Glassmorphism and Interactions */
    @keyframes staggeredFadeUp {
      from { opacity: 0; transform: translateY(30px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .m-card, .m-dash-stat, .m-dash-tc, .m-up-card {
      transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.5s ease, border-color 0.5s ease, background 0.5s ease;
      position: relative;
      animation: staggeredFadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) backwards;
      animation-fill-mode: both;
      transform-style: preserve-3d;
      transform: perspective(1200px) rotateX(var(--rot-x, 0)) rotateY(var(--rot-y, 0)) translateY(0);
      
      background: linear-gradient(135deg, rgba(30, 30, 38, 0.45) 0%, rgba(18, 18, 24, 0.65) 100%) !important;
      backdrop-filter: blur(20px) !important;
      -webkit-backdrop-filter: blur(20px) !important;
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      border-radius: 16px !important;
      overflow: hidden !important;
    }
    
    /* Glowing spotlight effect that follows mouse */
    .m-card::before, .m-dash-stat::before, .m-dash-tc::before, .m-up-card::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(700px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), var(--card-glow, rgba(255,255,255,0.1)), transparent 40%);
      opacity: 0;
      transition: opacity 0.5s;
      pointer-events: none;
      z-index: 0;
      border-radius: inherit;
      mix-blend-mode: screen;
    }
    
    /* Card Hover State */
    .m-card:hover, .m-dash-stat:hover, .m-dash-tc:hover, .m-up-card:hover {
      transform: perspective(1200px) rotateX(var(--rot-x, 0)) rotateY(var(--rot-y, 0)) translateY(-6px) scale(1.01);
      z-index: 10;
      box-shadow: 0 30px 60px rgba(0,0,0,0.6), 0 0 30px rgba(var(--ac-rgb), 0.15) !important;
      border-color: rgba(255,255,255,0.18) !important;
      background: linear-gradient(135deg, rgba(40, 40, 50, 0.6) 0%, rgba(20, 20, 28, 0.8) 100%) !important;
    }
    .m-card:hover::before, .m-dash-stat:hover::before, .m-dash-tc:hover::before, .m-up-card:hover::before { 
      opacity: 0.35; 
    }
    .m-card > .m-card-body, .m-dash-stat > *, .m-dash-tc > *, .m-up-card > * { 
      position: relative; 
      z-index: 1; 
    }
    .m-card > .m-card-strip {
      position: absolute !important;
      z-index: 3;
    }
    
    /* ── New Card Strip (left status indicator) ── */
    .m-card-strip {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: var(--strip-col, rgba(255,255,255,.18));
      z-index: 3;
      transition: width 0.35s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.35s ease;
      box-shadow: 0 0 6px color-mix(in srgb, var(--strip-col, rgba(255,255,255,.18)) 40%, transparent);
    }
    .m-card:hover .m-card-strip {
      width: 5px;
      box-shadow: 0 0 18px var(--strip-col, rgba(255,255,255,.3)), 0 0 6px var(--strip-col);
    }
    
    /* Card body flex container */
    .m-card-body {
      display: flex;
      align-items: center;
      width: 100%;
      min-height: 58px;
      padding-left: 12px;
    }
    
    /* ── Card badge styles ── */
    .m-badge-mal {
      font-size: 9px;
      font-weight: 700;
      background: rgba(var(--ac-rgb), .08);
      color: rgba(var(--ac-rgb), .55);
      border: 1px solid rgba(var(--ac-rgb), .15);
      border-radius: 4px;
      padding: 1px 5px;
      letter-spacing: .04em;
      transition: color 0.2s, background 0.2s;
    }
    .m-card:hover .m-badge-mal {
      color: rgba(var(--ac-rgb), .8);
      background: rgba(var(--ac-rgb), .12);
    }
    .m-badge-link {
      font-size: 10px;
      cursor: pointer;
      opacity: 0.5;
      transition: opacity 0.2s, transform 0.2s;
      display: inline-flex;
      align-items: center;
    }
    .m-badge-link:hover {
      opacity: 1;
      transform: scale(1.15);
    }
    
    /* Edit/more button style */
    .m-act-more {
      font-size: 18px !important;
      font-weight: 900;
      letter-spacing: 1px;
      line-height: 0.5;
    }
    
    /* Pinned cards glowing effect */
    .m-card-pinned .m-card-strip { 
      width: 5px !important; 
      box-shadow: 0 0 16px 3px rgba(251,191,36,.5); 
      background: linear-gradient(180deg, #fcd34d 0%, #f59e0b 100%) !important;
    }
    .m-card-pinned:hover .m-card-strip {
      width: 6px !important;
      box-shadow: 0 0 28px 5px rgba(251,191,36,.7), 0 0 8px rgba(251,191,36,.9);
    }
    .m-card-pinned { 
      border-color: rgba(251,191,36,.3) !important; 
      background: linear-gradient(145deg, rgba(251,191,36,.08) 0%, rgba(10,10,15,0.6) 100%) !important; 
    }
    .m-card-pinned:hover {
      border-color: rgba(251,191,36,.5) !important;
      box-shadow: 0 30px 60px rgba(0,0,0,0.6), 0 0 30px rgba(251,191,36,.2) !important;
    }
    
    /* Detail Panel Redesign */
    .m-panel-hero {
      position: relative;
      padding: 40px 24px 24px;
      min-height: 220px;
      display: flex;
      align-items: flex-end;
      overflow: hidden;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .m-panel-hero-bg {
      position: absolute;
      inset: -30px;
      background-size: cover;
      background-position: center;
      filter: blur(25px) saturate(1.8) brightness(0.4);
      z-index: 0;
    }
    .m-panel-hero-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, var(--surf) 0%, rgba(17,17,17,0.3) 60%, rgba(17,17,17,0.1) 100%);
      z-index: 1;
    }
    .m-panel-close {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 10;
      background: rgba(0,0,0,0.5) !important;
      backdrop-filter: blur(12px);
      border-color: rgba(255,255,255,0.15) !important;
      color: #fff !important;
    }
    .m-panel-close:hover { background: rgba(251,113,133,0.2) !important; color: #fb7185 !important; border-color: rgba(251,113,133,0.4) !important; }
    .m-panel-hero-content {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: flex-end;
      gap: 20px;
      width: 100%;
    }
    .m-panel-cover {
      width: 110px;
      height: 155px;
      border-radius: 12px;
      object-fit: cover;
      box-shadow: 0 12px 30px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.15);
      flex-shrink: 0;
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .m-panel-cover:hover { transform: translateY(-6px) scale(1.03) rotate(2deg); }
    .m-panel-text { flex: 1; min-width: 0; }
    .m-panel-title {
      font-size: 28px !important;
      font-weight: 800 !important;
      line-height: 1.2 !important;
      margin-bottom: 12px;
      text-shadow: 0 4px 20px rgba(0,0,0,0.8);
      white-space: normal;
      color: #fff;
    }
    .m-panel-badges { gap: 8px; margin-top:0 !important; }
    .m-panel-badges > span { padding: 4px 10px !important; border-radius: 6px !important; font-size: 11px !important; }
    
    .m-panel-stats {
      padding: 16px 20px !important;
      gap: 12px;
      background: var(--surf) !important;
      border-bottom: 1px solid rgba(255,255,255,0.06) !important;
    }
    .m-panel-stats .pstat {
      background: linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01)) !important;
      border: 1px solid rgba(255,255,255,0.06) !important;
      border-radius: 14px !important;
      padding: 14px 10px !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
      overflow: hidden;
    }
    .m-panel-stats .pstat:hover {
      transform: translateY(-4px) scale(1.02);
      border-color: rgba(var(--ac-rgb), 0.3) !important;
      background: linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)) !important;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3), 0 0 15px rgba(var(--ac-rgb), 0.1) !important;
    }
    .m-panel-body { padding: 0; }

    .m-detail-box {
      background: linear-gradient(145deg, var(--surf2), var(--surf));
      border: 1px solid var(--brd);
      border-radius: 8px;
      padding: 12px 14px;
      transition: all 0.3s ease;
    }
    .m-detail-box:hover {
      border-color: rgba(var(--ac-rgb), 0.3);
      background: linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
    }
    .m-detail-lbl {
      color: var(--mu);
      font-size: 10px;
      margin-bottom: 4px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }
    .m-detail-val {
      font-weight: 600;
      color: var(--tx);
      font-size: 13px;
    }
    
    /* Action Buttons (Del, Edit, Play) pop on hover */
    .m-act-btn {
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
      border-radius: 6px !important;
    }
    .m-act-btn:hover {
      transform: scale(1.2) rotate(6deg);
      box-shadow: 0 0 15px currentColor;
      background: rgba(255,255,255,0.1);
    }
    
    /* Filter Chips Interactivity Enhancements */
    .m-chip {
      background: rgba(255,255,255,0.03) !important;
      border: 1px solid rgba(255,255,255,0.05) !important;
      backdrop-filter: blur(8px) !important;
      color: rgba(255,255,255,0.7) !important;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
      border-radius: 20px !important;
    }
    .m-chip:hover {
      background: rgba(255,255,255,0.08) !important;
      border-color: rgba(255,255,255,0.15) !important;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      color: #fff !important;
    }
    .m-chip.active {
      background: rgba(var(--chip-c-rgb, 255,255,255), 0.1) !important;
      border-color: var(--chip-c) !important;
      color: #fff !important;
      box-shadow: 0 0 20px -5px var(--chip-c);
    }

    /* Dashboard Aesthetics Enhancements */
    #media-interactive-bg { filter: saturate(1.4) contrast(1.1); }
    .m-dash-stat-v { filter: drop-shadow(0 2px 10px rgba(0,0,0,0.7)); }

    #m-ctx-overlay { position: fixed; inset: 0; z-index: 99998; }
  `;
  document.head.appendChild(s);
}

function startHold(id, ev) {
  cancelHold();
  _HOLD_FIRED = false; window._HOLD_FIRED = false;
  const touch = ev.touches ? ev.touches[0] : ev;
  const cx = touch.clientX, cy = touch.clientY;
  _HOLD_TIMER = setTimeout(() => {
    _HOLD_TIMER = null;
    _HOLD_FIRED = true; window._HOLD_FIRED = true;
    showCtxMenu(id, cx, cy);
  }, 500);
}

function cancelHold() {
  if (_HOLD_TIMER) { clearTimeout(_HOLD_TIMER); _HOLD_TIMER = null; }
}

function showCtxMenu(id, x, y) {
  hideCtxMenu();
  _CTX_ENTRY_ID = id;
  const e = DATA.find(d => d.id === id); if (!e) return;

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
    <div class="m-ctx-item" onclick="hideCtxMenu();openLinkPicker('${id}')">
      <span class="ctx-ico">🔗</span>Link Entry
    </div>
    <div class="m-ctx-sep"></div>
    <div class="m-ctx-item danger" onclick="hideCtxMenu();askDel('${id}')">
      <span class="ctx-ico">✕</span>Delete
    </div>`;

  document.body.appendChild(menu);

  const mw = 200, mh = 200;
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

function renderSectionStub(id, c) {
  const meta = { games:{icon:'◈',color:'var(--ac)',phase:5}, books:{icon:'◎',color:'var(--ac)',phase:6}, music:{icon:'♪',color:'var(--ac)',phase:7}, settings:{icon:'⚙',color:'var(--ac)',phase:8} };
  const m = meta[id]||{icon:'?',color:'var(--ac)',phase:'?'};
  c.innerHTML=`<div style="font-family:var(--fd);font-size:clamp(18px,3vw,30px);font-weight:700;margin-bottom:16px;letter-spacing:1px;text-transform:uppercase;color:${m.color}">${m.icon} ${id.charAt(0).toUpperCase()+id.slice(1)} Codex</div>
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);padding:40px 24px;text-align:center;color:var(--tx2)">
      <div style="font-size:36px;opacity:.3;margin-bottom:12px">${m.icon}</div>
      <p style="font-size:14px">Unable to load.</p>
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
    const displayTitle = r.title_en || r.title;
    const hasAltTitle  = r.title_en && r.title_en !== r.title;
    const eps    = r.episodes   ? `${r.episodes} ep`              : '';
    const score  = r.score      ? `★ ${r.score}`                  : '';
    const type   = r.media_type ? r.media_type.replace(/_/g, ' ') : '';
    const meta   = [type, eps, score].filter(Boolean).join(' · ');
    const thumb  = r.image
      ? `<img src="${esc(r.image)}" style="width:32px;height:44px;object-fit:cover;border-radius:3px;flex-shrink:0" onerror="this.style.display='none'">`
      : `<div style="width:32px;height:44px;background:var(--surf3);border-radius:3px;flex-shrink:0"></div>`;
    const payload = esc(JSON.stringify(r));
    return `<div style="display:flex;align-items:center;gap:9px;padding:8px 11px;cursor:pointer;border-bottom:1px solid var(--brd);transition:background .1s"
      onmouseenter="this.style.background='var(--surf3)'"
      onmouseleave="this.style.background='transparent'"
      data-payload="${payload}"
      onclick="_malSelect(this.dataset.payload)">
      ${thumb}
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(displayTitle)}</div>
        ${hasAltTitle ? `<div style="font-size:10px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px">${esc(r.title)}</div>` : ''}
        ${meta ? `<div style="font-size:10px;color:var(--mu);margin-top:2px">${esc(meta)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  dd.style.display = 'block';

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

  const displayTitle = r.title_en || r.title;
  const searchInp = document.getElementById('mal-search-inp');
  if (searchInp) searchInp.value = displayTitle;

  const titleEl = document.getElementById('f-title');
  if (titleEl) titleEl.value = displayTitle;

  const malIdEl = document.getElementById('f-malid');
  if (malIdEl) malIdEl.value = String(r.id || '');

  const imgEl = document.getElementById('f-malimg');
  if (imgEl) imgEl.value = r.image || '';
  _malUpdateCoverPreview(r.image || '');

  const notesEl = document.getElementById('f-notes');
  if (notesEl && !notesEl.value && r.synopsis) notesEl.value = r.synopsis;

  if (r.episodes) {
    const epTot = document.getElementById('f-eptot');
    if (epTot && !epTot.value) epTot.value = String(r.episodes);
  }

  const statusEl = document.getElementById('f-status');
  if (statusEl && r.status) {
    const map = {
      currently_airing: 'watching',
      finished_airing:  'completed',
      not_yet_aired:    'upcoming',
    };
    if (map[r.status]) statusEl.value = map[r.status];
  }

  if (r.status === 'currently_airing' && r.broadcast && r.broadcast.day_of_the_week && r.broadcast.start_time) {
    const dayMap = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    let jstDay = dayMap[r.broadcast.day_of_the_week.toLowerCase()];
    if (jstDay !== undefined) {
      const parts = r.broadcast.start_time.split(':');
      let jstHour = parseInt(parts[0], 10);
      let jstMin = parseInt(parts[1], 10);

      let istMin = jstMin - 30;
      let istHour = jstHour - 3;
      let istDay = jstDay;

      if (istMin < 0) {
        istMin += 60;
        istHour -= 1;
      }
      if (istHour < 0) {
        istHour += 24;
        istDay = (istDay - 1 + 7) % 7;
      }

      const formattedHour = String(istHour).padStart(2, '0');
      const formattedMin = String(istMin).padStart(2, '0');

      const airingDayEl = document.getElementById('f-airingday');
      if (airingDayEl) airingDayEl.value = String(istDay);

      const airingTimeEl = document.getElementById('f-airingtime');
      if (airingTimeEl) airingTimeEl.value = `${formattedHour}:${formattedMin}`;
    }
  }

  toast(`✓ Autofilled: ${displayTitle}`);
}

function _malUpdateCoverPreview(url) {
  const wrap = document.getElementById('mal-cover-wrap');
  const img  = document.getElementById('mal-cover-img');
  if (!wrap || !img) return;
  if (url) { img.src = url; wrap.style.display = 'block'; }
  else       wrap.style.display = 'none';
}


// ── Register all media functions as globals ───────────────────────────────
Object.assign(window, {
  // Core render
  renderMedia, renderMediaBody, renderSectionStub,
  setMediaPage, setMediaChip, toggleMediaSortDd, setMediaSort,

  // List / grid
  renderList, expandRows, filteredData,
  toggleColl, activeSeason, rowHtml,

  // Quick actions
  quickEp, quickTlEp,

  // Dashboard / tabs
  renderDash, renderUpcoming, renderIncomplete,

  // Panel
  openPanel, openDetail, openEdit, openAdd, openAddLinkedEntry,
  renderDetailPanel, renderFormPanel, saveEntry,

  // Linking
  getLinkedEntries, renderLinkedEntries, linkedEpDelta,
  openLinkPicker, renderLinkPickerList, confirmLinkEntries, unlinkEntry,

  // Delete
  askDel,

  // Context menu / hold
  startHold, cancelHold, showCtxMenu, hideCtxMenu, ctxPin, _HOLD_FIRED,

  // MAL
  malBulkSyncAll, malSearchInput, _syncMALListEntry,
  runLinkedMigrationV3, _malSelect,

  // Filter chips
  _renderFilterChips,
});
