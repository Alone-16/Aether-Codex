// ═══════════════════════════════════════════════════════
//  WRAPPED — MONTHLY & YEARLY SUMMARY
// ═══════════════════════════════════════════════════════

function openWrapped() {
  const now = new Date();
  const modal = document.createElement('div');
  modal.id = 'wrapped-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9800;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)';

  const monthName = now.toLocaleString('default', {month:'long'});
  const year = now.getFullYear();

  modal.innerHTML = `
    <div style="background:#0a0a12;border:1px solid #2a2a3a;border-radius:14px;width:100%;max-width:560px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column">
      <div style="padding:20px 24px;border-bottom:1px solid #2a2a3a;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-family:'Cinzel',serif;font-size:20px;font-weight:700;color:#34d399">✦ Wrapped</div>
          <div style="font-size:12px;color:#8888aa;margin-top:2px">Your viewing summary</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <div style="display:flex;gap:4px;background:#111118;border:1px solid #2a2a3a;border-radius:6px;padding:3px">
            <button onclick="renderWrappedContent('monthly')" id="wrap-monthly-btn"
              style="padding:5px 12px;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;border:none;background:#34d399;color:#000">Monthly</button>
            <button onclick="renderWrappedContent('yearly')" id="wrap-yearly-btn"
              style="padding:5px 12px;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;border:none;background:transparent;color:#8888aa">Yearly</button>
          </div>
          <button onclick="document.getElementById('wrapped-modal').remove()"
            style="width:30px;height:30px;border-radius:50%;background:#18181f;border:1px solid #2a2a3a;color:#8888aa;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>
        </div>
      </div>
      <div id="wrapped-content" style="overflow-y:auto;flex:1;padding:20px"></div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
  renderWrappedContent('monthly');
}

function renderWrappedContent(type) {
  // Update tab buttons
  const mb = document.getElementById('wrap-monthly-btn');
  const yb = document.getElementById('wrap-yearly-btn');
  if (mb) { mb.style.background = type==='monthly'?'#34d399':'transparent'; mb.style.color = type==='monthly'?'#000':'#8888aa'; }
  if (yb) { yb.style.background = type==='yearly'?'#34d399':'transparent'; yb.style.color = type==='yearly'?'#000':'#8888aa'; }

  const now = new Date();
  const el = document.getElementById('wrapped-content'); if (!el) return;

  // Define time range
  let start, end, label;
  if (type === 'monthly') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end   = new Date(now.getFullYear(), now.getMonth()+1, 0, 23, 59, 59);
    label = now.toLocaleString('default', {month:'long', year:'numeric'});
  } else {
    start = new Date(now.getFullYear(), 0, 1);
    end   = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    label = String(now.getFullYear());
  }

  const startMs = start.getTime();
  const endMs   = end.getTime();

  // ── Media stats ──
  const mediaInRange = DATA.filter(e => {
    const d = e.updatedAt || e.addedAt || 0;
    return d >= startMs && d <= endMs;
  });
  const completed  = mediaInRange.filter(e => e.status === 'completed');
  const newAdded   = DATA.filter(e => (e.addedAt||0) >= startMs && (e.addedAt||0) <= endMs);
  const dropped    = mediaInRange.filter(e => e.status === 'dropped');

  // Total eps watched in range (approximate by updatedAt)
  const totalEps = mediaInRange.reduce((a,e) => {
    const tl = e.timeline||[];
    if (tl.length) return a + tl.filter(t=>t.type==='season').reduce((s,t)=>s+parseInt(t.epWatched||0),0);
    return a + parseInt(e.epCur||0);
  }, 0);

  const totalMin = mediaInRange.reduce((a,e) => {
    const dur = parseInt(e.epDuration||24);
    const tl = e.timeline||[];
    if (tl.length) return a + tl.filter(t=>t.type==='season').reduce((s,t)=>s+parseInt(t.epWatched||0)*dur,0);
    return a + parseInt(e.epCur||0)*dur;
  }, 0);

  // Top genres
  const genreCount = {};
  mediaInRange.forEach(e => { genreCount[e.genreId] = (genreCount[e.genreId]||0)+1; });
  const topGenres = Object.entries(genreCount).sort((a,b)=>b[1]-a[1]).slice(0,3)
    .map(([id,cnt]) => ({ name: gbyid(id).name, color: gbyid(id).color, cnt }));

  // Top rated
  const rated = DATA.filter(e=>e.rating).sort((a,b)=>parseFloat(b.rating)-parseFloat(a.rating)).slice(0,3);

  // Games stats
  const gamesInRange = window.GDATA.filter(g => (g.updatedAt||g.addedAt||0) >= startMs && (g.updatedAt||g.addedAt||0) <= endMs);
  const gamesCompleted = gamesInRange.filter(g=>g.status==='completed');
  const totalGameHours = gamesInRange.reduce((a,g)=>a+(parseFloat(g.totalHours)||0),0);

  // Books stats
  const booksInRange = window.BDATA.filter(b=>(b.updatedAt||b.addedAt||0)>=startMs&&(b.updatedAt||b.addedAt||0)<=endMs);
  const booksCompleted = booksInRange.filter(b=>b.status==='completed');
  const totalPages = booksInRange.reduce((a,b)=>{const st=window.bookEntryStats(b);return a+st.cur;},0);

  // Fun highlight
  const totalHours = Math.round(totalMin/60);
  const totalDays  = (totalMin/1440).toFixed(1);
  const highlights = [
    totalEps > 0   ? `You watched <b>${totalEps}</b> episodes — that's <b>${totalHours}h</b> of your life!` : null,
    completed.length > 0 ? `You completed <b>${completed.length}</b> title${completed.length!==1?'s':''}` : null,
    totalGameHours > 0 ? `You played games for <b>${totalGameHours.toFixed(0)}h</b>` : null,
    totalPages > 0 ? `You read <b>${totalPages.toLocaleString()}</b> pages` : null,
  ].filter(Boolean);

  const completionRate = newAdded.length ? Math.round(completed.length/newAdded.length*100) : 0;

  el.innerHTML = `
    <!-- Header -->
    <div style="text-align:center;margin-bottom:24px;padding:20px;background:linear-gradient(135deg,rgba(52,211,153,.08),rgba(52,211,153,.02));border:1px solid rgba(52,211,153,.15);border-radius:10px">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:#34d399;margin-bottom:6px">Your ${type==='monthly'?'Monthly':'Yearly'} Wrapped</div>
      <div style="font-family:'Cinzel',serif;font-size:28px;font-weight:700;color:#fff;margin-bottom:4px">${label}</div>
      <div style="font-size:13px;color:#8888aa">${highlights[0]||'Keep tracking!'}</div>
    </div>

    <!-- Key stats grid -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-bottom:20px">
      ${[
        ['📺', totalEps||'—', 'Episodes'],
        ['⏱', totalHours||'—', 'Hours'],
        ['✓', completed.length||'—', 'Completed'],
        ['➕', newAdded.length||'—', 'Added'],
        ['🎮', gamesCompleted.length||'—', 'Games Done'],
        ['📚', booksCompleted.length||'—', 'Books Done'],
      ].map(([ico,val,lbl])=>`
        <div style="background:#111118;border:1px solid #2a2a3a;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:18px;margin-bottom:4px">${ico}</div>
          <div style="font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:#34d399;line-height:1">${val}</div>
          <div style="font-size:10px;color:#8888aa;margin-top:3px;text-transform:uppercase;letter-spacing:.5px">${lbl}</div>
        </div>`).join('')}
    </div>

    <!-- Top Genres -->
    ${topGenres.length ? `
    <div style="background:#111118;border:1px solid #2a2a3a;border-radius:10px;padding:16px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#8888aa;margin-bottom:12px">🎭 Top Genres</div>
      ${topGenres.map((g,i)=>`
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;${i<topGenres.length-1?'border-bottom:1px solid #1a1a2e':''}">
          <div style="width:8px;height:8px;border-radius:50%;background:${g.color};flex-shrink:0"></div>
          <span style="flex:1;font-size:13px;color:#eeedf8">${g.name}</span>
          <div style="width:80px;height:3px;background:#2a2a3a;border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${Math.round(g.cnt/topGenres[0].cnt*100)}%;background:${g.color};border-radius:2px"></div>
          </div>
          <span style="font-size:12px;font-weight:700;color:#8888aa;min-width:20px;text-align:right">${g.cnt}</span>
        </div>`).join('')}
    </div>` : ''}

    <!-- Top Rated -->
    ${rated.length ? `
    <div style="background:#111118;border:1px solid #2a2a3a;border-radius:10px;padding:16px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#8888aa;margin-bottom:12px">⭐ Your Top Rated</div>
      ${rated.map((e,i)=>`
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;${i<rated.length-1?'border-bottom:1px solid #1a1a2e':''}">
          <span style="font-size:11px;font-weight:800;color:#34d399;min-width:16px">#${i+1}</span>
          <span style="flex:1;font-size:13px;color:#eeedf8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.title)}</span>
          <span style="font-size:13px;font-weight:700;color:#fbbf24">★ ${e.rating}</span>
        </div>`).join('')}
    </div>` : ''}

    <!-- Fun highlights -->
    ${highlights.length > 1 ? `
    <div style="background:linear-gradient(135deg,rgba(52,211,153,.06),rgba(96,165,250,.04));border:1px solid rgba(52,211,153,.12);border-radius:10px;padding:16px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#8888aa;margin-bottom:10px">✨ Highlights</div>
      ${highlights.map(h=>`<div style="font-size:13px;color:#eeedf8;padding:5px 0;line-height:1.5">${h}</div>`).join('<div style="height:1px;background:#1a1a2e;margin:2px 0"></div>')}
    </div>` : ''}

    <!-- Completion rate -->
    ${newAdded.length > 0 ? `
    <div style="background:#111118;border:1px solid #2a2a3a;border-radius:10px;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#8888aa">Completion Rate</div>
        <span style="font-size:14px;font-weight:700;color:${completionRate>=70?'#4ade80':completionRate>=40?'#fbbf24':'#fb7185'}">${completionRate}%</span>
      </div>
      <div style="height:6px;background:#2a2a3a;border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${completionRate}%;background:${completionRate>=70?'#4ade80':completionRate>=40?'#fbbf24':'#fb7185'};border-radius:3px;transition:width .5s"></div>
      </div>
      <div style="font-size:11px;color:#8888aa;margin-top:6px">${completed.length} completed of ${newAdded.length} added this ${type==='monthly'?'month':'year'}</div>
    </div>` : ''}

    ${totalEps===0&&newAdded.length===0&&gamesInRange.length===0?`
    <div style="text-align:center;padding:30px;color:#8888aa;font-size:13px">
      No activity tracked for ${label} yet.<br>Keep using the app and check back!
    </div>`:''}`;
}

// ── Register wrapped functions as globals ─────────────────────────────────
Object.assign(window, {
  openWrapped,
  renderWrappedContent,
});
