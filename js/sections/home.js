function renderHome(c){
  // Show/hide drive hint based on state
  setTimeout(()=>{
    const el=document.getElementById('drive-hint-inner');
    if(el) el.style.display=(DATA.length===0&&!_isConnected())?'flex':'none';
  },50);
  const now=new Date();
  const mediaEntries=DATA;
  const totalEps=mediaEntries.reduce((a,e)=>{
    const tl=e.timeline||[];
    if(tl.length)return a+tl.filter(t=>t.type==='season').reduce((s,t)=>s+parseInt(t.epWatched||0),0);
    return a+parseInt(e.epCur||0);
  },0);
  const totalMin=mediaEntries.reduce((a,e)=>{
    const dur=parseInt(e.epDuration||24);
    const tl=e.timeline||[];
    if(tl.length)return a+tl.filter(t=>t.type==='season').reduce((s,t)=>s+parseInt(t.epWatched||0)*dur,0);
    return a+parseInt(e.epCur||0)*dur;
  },0);
  const watching=mediaEntries.filter(e=>e.status==='watching').length;
  const completed=mediaEntries.filter(e=>e.status==='completed').length;

  // Quick links - currently watching
  const activeEntries=mediaEntries.filter(e=>e.status==='watching').slice(0,4);
  const days_=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const todayNum=new Date().getDay();
  const qlItems=activeEntries.map(e=>{
    const st=entryStats(e);
    const g=gbyid(e.genreId);
    const as=activeSeason(e);
    const tl=e.timeline||[];
    // Meta line: season name + ep progress
    let meta='';
    if(tl.length&&as){
      const sName=as.name||`Season ${as.num||''}`;
      const w=parseInt(as.epWatched||0),t=parseInt(as.eps||0);
      meta=`${sName} · Ep ${w}/${t||'?'}`;
    } else {
      meta=`${esc(g.name)} · ${st.cur}/${st.tot||'?'} ep`;
    }
    const pct=st.pct>0?st.pct:(st.tot?2:null);
    const progressBar=pct!=null?`<div class="ql-progress"><div class="ql-progress-fill" style="width:${pct}%"></div></div>`:'';
    let airingHtml='';
    if(e.airingDay!=null){
      const diff=(e.airingDay-todayNum+7)%7;
      const lbl=diff===0?'Airs Today!':diff===1?'Airs Tomorrow':`Airs ${days_[e.airingDay]}`;
      airingHtml=`<div class="ql-airing">📺 ${lbl}${e.airingTime?' '+e.airingTime:''}</div>`;
    }
    return`<div class="ql-card" onclick="openDetail('${e.id}')">
      <div class="ql-section-dot" style="background:${g.color}"></div>
      <div class="ql-info">
        <div class="ql-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">${esc(e.title)}</div>
        <div class="ql-meta">${meta}</div>
      </div>
      <div class="ql-right">
        <div class="ql-badge" style="background:rgba(232,121,160,.12);color:#e879a0">▶ Watching</div>
        ${progressBar}
        ${airingHtml}
      </div>
    </div>`;
  }).join('');
  const qlHtml=`<div class="dash-card">
    <div class="dash-card-hd">
      <div class="dash-card-title">⚡ Currently Active</div>
      <div class="dash-card-action" onclick="nav('media')">See all →</div>
    </div>
    <div class="dash-card-body">
      <div class="quick-links">${qlItems||'<div style="color:var(--mu);font-size:13px;text-align:center;padding:14px">No active entries</div>'}</div>
    </div>
  </div>`;

  c.innerHTML=`
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:20px">
      <div>
        <div style="font-family:var(--fd);font-size:clamp(18px,3vw,26px);font-weight:700;line-height:1.2">Welcome to <em style="color:var(--ac);font-style:normal;text-shadow:var(--glow)">The Aether Codex</em></div>
        <div style="font-size:13px;color:var(--tx2);margin-top:4px">Your personal universe of everything you track</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:12px;color:var(--mu)"><strong style="display:block;font-size:13px;color:var(--tx2)">${now.toLocaleString('default',{weekday:'long'})}</strong>${now.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>
        <button onclick="openWrapped()" style="margin-top:6px;background:rgba(var(--ac-rgb),.1);border:1px solid rgba(var(--ac-rgb),.25);color:var(--ac);border-radius:5px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer">✦ Wrapped</button>
      </div>
    </div>
    <div class="dash-grid" style="margin-bottom:20px">
      <div class="dc"><div class="dc-v">${mediaEntries.length}</div><div class="dc-l">Media Entries</div></div>
      <div class="dc"><div class="dc-v">${watching}</div><div class="dc-l">Watching</div></div>
      <div class="dc"><div class="dc-v">${completed}</div><div class="dc-l">Completed</div></div>
      <div class="dc"><div class="dc-v">${totalEps.toLocaleString()}</div><div class="dc-l">Eps Watched</div></div>
      <div class="dc"><div class="dc-v">${fmtMin(totalMin)}</div><div class="dc-l">Time Watched</div></div>
      <div class="dc"><div class="dc-v">${Math.floor(totalMin/1440)}</div><div class="dc-l">Days Watched</div></div>
    </div>
    <div id="drive-hint-inner" style="display:none;align-items:center;gap:14px;background:rgba(var(--ac-rgb),.06);border:1px solid rgba(var(--ac-rgb),.2);border-radius:var(--cr);padding:16px 20px;margin-bottom:16px">
      <div style="font-size:24px">☁</div>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:600;color:var(--tx)">Connect Google Drive to load your data</div>
        <div style="font-size:12px;color:var(--tx2);margin-top:2px">Your data is stored privately in your Drive. Connect to sync across all devices.</div>
      </div>
      <button onclick="driveAction()" style="background:var(--ac);color:#000;border:none;border-radius:5px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Connect Drive</button>
    </div>
    <div class="home-two-col" style="display:grid;grid-template-columns:1fr 320px;gap:14px;align-items:start">
      <div>
        ${renderAiringWidget()}
        <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);overflow:hidden;margin-top:14px">
          <div style="padding:12px 14px 8px;border-bottom:1px solid var(--brd);display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--mu)">📊 Section Overview</div>
          </div>
          <div class="section-ov-grid" style="padding:14px;display:grid;grid-template-columns:1fr 1fr;gap:9px">
            <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:7px;padding:12px;cursor:pointer;overflow:hidden" onclick="nav('media')">
              <div style="display:flex;align-items:center;gap:7px;margin-bottom:6px"><span>◉</span><span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#e879a0">Media</span></div>
              <div style="font-family:var(--fd);font-size:22px;font-weight:700;color:#e879a0">${mediaEntries.length}</div>
              <div style="font-size:11px;color:var(--tx2);margin-top:3px;margin-bottom:8px">${watching} watching · ${completed} done</div>
              <div style="height:2px;background:rgba(232,121,160,.15);border-radius:1px"><div style="height:100%;width:${Math.round(completed/mediaEntries.length*100)}%;background:#e879a0;border-radius:1px"></div></div>
            </div>
            <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:7px;padding:12px;cursor:pointer;overflow:hidden" onclick="nav('games')">
              <div style="display:flex;align-items:center;gap:7px;margin-bottom:6px"><span>◈</span><span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#f59e0b">Games</span></div>
              <div style="font-family:var(--fd);font-size:22px;font-weight:700;color:#f59e0b">${GDATA.length||'—'}</div>
              <div style="font-size:11px;color:var(--tx2);margin-top:3px;margin-bottom:8px">${GDATA.filter(g=>g.status==='playing').length} playing · ${GDATA.filter(g=>g.status==='completed').length} done</div>
              <div style="height:2px;background:rgba(245,158,11,.15);border-radius:1px;overflow:hidden"><div style="height:100%;width:${GDATA.length?Math.round(GDATA.filter(g=>g.status==='completed').length/GDATA.length*100):0}%;background:#f59e0b;border-radius:1px"></div></div>
            </div>
            <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:7px;padding:12px;cursor:pointer;overflow:hidden" onclick="nav('books')">
              <div style="display:flex;align-items:center;gap:7px;margin-bottom:6px"><span>◎</span><span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#a78bfa">Books</span></div>
              <div style="font-family:var(--fd);font-size:22px;font-weight:700;color:#a78bfa">${BDATA.length||'—'}</div>
              <div style="font-size:11px;color:var(--tx2);margin-top:3px;margin-bottom:8px">${BDATA.filter(b=>b.status==='reading').length} reading · ${BDATA.filter(b=>b.status==='completed').length} done</div>
              <div style="height:2px;background:rgba(167,139,250,.15);border-radius:1px;overflow:hidden"><div style="height:100%;width:${BDATA.length?Math.round(BDATA.filter(b=>b.status==='completed').length/BDATA.length*100):0}%;background:#a78bfa;border-radius:1px"></div></div>
            </div>
            <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:7px;padding:12px;cursor:pointer;overflow:hidden" onclick="nav('music')">
              <div style="display:flex;align-items:center;gap:7px;margin-bottom:6px"><span>♪</span><span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#fb923c">Music</span></div>
              <div style="font-family:var(--fd);font-size:22px;font-weight:700;color:#fb923c">${MDATA.filter(s=>!s.removedFromPlaylist).length||'—'}</div>
              <div style="font-size:11px;color:var(--tx2);margin-top:3px;margin-bottom:8px">${MPLAYLISTS.filter(p=>p.synced).length} playlist${MPLAYLISTS.filter(p=>p.synced).length!==1?'s':''} synced</div>
              <div style="height:2px;background:rgba(251,146,60,.15);border-radius:1px"></div>
            </div>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        ${qlHtml}
        ${renderUpcomingWidget()}
      </div>
    </div>`;
}

let AIRING_DAY = new Date().getDay(); // defaults to today

function renderAiringWidget(){
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const todayN = new Date().getDay();
  const airingEntries = DATA.filter(e=>e.airingDay!=null&&e.status==='watching');

  // Build day pills
  const pills = days.map((d,i)=>{
    const hasShows = airingEntries.some(e=>e.airingDay===i);
    const isToday  = i===todayN;
    const isSel    = i===AIRING_DAY;
    return `<button onclick="selectAiringDay(${i})"
      style="padding:7px 4px;border-radius:20px;font-size:12px;font-weight:${isSel?'700':'500'};cursor:pointer;white-space:nowrap;border:1px solid ${isSel?'var(--ac)':hasShows?'rgba(var(--ac-rgb),.25)':'var(--brd)'};background:${isSel?'var(--ac)':hasShows?'rgba(var(--ac-rgb),.08)':'transparent'};color:${isSel?'#000':hasShows?'var(--ac)':'var(--mu)'};position:relative;transition:all .15s;text-align:center;width:100%">
      ${isToday?`<span style="position:absolute;top:2px;right:2px;width:4px;height:4px;border-radius:50%;background:${isSel?'#000':'var(--ac)'}"></span>`:''}
      ${d}
    </button>`;
  }).join('');

  // Shows for selected day
  const sel = airingEntries.filter(e=>e.airingDay===AIRING_DAY);
  const diff = (AIRING_DAY - todayN + 7) % 7;
  const dayLbl = diff===0?'Today':diff===1?'Tomorrow':`in ${diff}d`;
  const lblCol = diff===0?'#4ade80':diff===1?'#fbbf24':'var(--mu)';

  const showList = sel.length
    ? sel.map(e=>`
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--brd);cursor:pointer" onclick="nav('media')">
          <div style="width:6px;height:6px;border-radius:50%;background:var(--ac);flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:var(--tx)">${esc(e.title)}</div>
            ${e.airingTime?`<div style="font-size:11px;color:var(--mu);margin-top:1px">${e.airingTime}</div>`:''}
          </div>
          <span style="font-size:11px;font-weight:700;color:${lblCol};white-space:nowrap">${dayLbl}</span>
        </div>`).join('')
    : `<div style="font-size:13px;color:var(--mu);text-align:center;padding:16px 0">Nothing airing</div>`;

  return`<div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);overflow:hidden">
    <div style="padding:12px 14px 10px;border-bottom:1px solid var(--brd);display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--mu)">📺 Airing This Week</div>
      <div style="font-size:11px;color:var(--ac);cursor:pointer" onclick="nav('media')">Manage →</div>
    </div>
    <div style="padding:10px 14px 8px;display:grid;grid-template-columns:repeat(7,1fr);gap:5px" id="airing-pills">
      ${pills}
    </div>
    <div style="padding:0 14px 8px" id="airing-shows">
      ${showList}
    </div>
  </div>`;
}

function selectAiringDay(d) {
  AIRING_DAY = d;
  // Re-render just the widget
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const todayN = new Date().getDay();
  const airingEntries = DATA.filter(e=>e.airingDay!=null&&e.status==='watching');

  // Update pills
  const pillsEl = document.getElementById('airing-pills');
  if (pillsEl) {
    pillsEl.innerHTML = days.map((day,i)=>{
      const hasShows = airingEntries.some(e=>e.airingDay===i);
      const isToday  = i===todayN;
      const isSel    = i===d;
      return `<button onclick="selectAiringDay(${i})"
        style="padding:7px 4px;border-radius:20px;font-size:12px;font-weight:${isSel?'700':'500'};cursor:pointer;white-space:nowrap;border:1px solid ${isSel?'var(--ac)':hasShows?'rgba(var(--ac-rgb),.25)':'var(--brd)'};background:${isSel?'var(--ac)':hasShows?'rgba(var(--ac-rgb),.08)':'transparent'};color:${isSel?'#000':hasShows?'var(--ac)':'var(--mu)'};position:relative;transition:all .15s;text-align:center;width:100%">
        ${isToday?`<span style="position:absolute;top:2px;right:2px;width:4px;height:4px;border-radius:50%;background:${isSel?'#000':'var(--ac)'}"></span>`:''}
        ${day}
      </button>`;
    }).join('');
  }

  // Update show list
  const sel = airingEntries.filter(e=>e.airingDay===d);
  const diff = (d - todayN + 7) % 7;
  const dayLbl = diff===0?'Today':diff===1?'Tomorrow':`in ${diff}d`;
  const lblCol = diff===0?'#4ade80':diff===1?'#fbbf24':'var(--mu)';
  const showsEl = document.getElementById('airing-shows');
  if (showsEl) {
    showsEl.innerHTML = sel.length
      ? sel.map(e=>`
          <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--brd);cursor:pointer" onclick="nav('media')">
            <div style="width:6px;height:6px;border-radius:50%;background:var(--ac);flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:var(--tx)">${esc(e.title)}</div>
              ${e.airingTime?`<div style="font-size:11px;color:var(--mu);margin-top:1px">${e.airingTime}</div>`:''}
            </div>
            <span style="font-size:11px;font-weight:700;color:${lblCol};white-space:nowrap">${dayLbl}</span>
          </div>`).join('')
      : `<div style="font-size:13px;color:var(--mu);text-align:center;padding:16px 0">Nothing airing</div>`;
  }
}

function renderUpcomingWidget(){
  const now=new Date(); now.setHours(0,0,0,0);
  const items=[];
  DATA.forEach(e=>{
    if(e.upcomingDate)items.push({title:e.title,date:e.upcomingDate,label:'New Release'});
    (e.timeline||[]).forEach(it=>{if(it.upcomingDate)items.push({title:e.title,date:it.upcomingDate,label:it.name||'New Season'})});
  });
  items.sort((a,b)=>new Date(a.date)-new Date(b.date));
  const rows=items.slice(0,5).map(it=>{
    const d=new Date(it.date+'T00:00:00');
    const diff=Math.ceil((d-now)/86400000);
    const mon=d.toLocaleString('default',{month:'short'}).toUpperCase();
    let cls='up-far',lbl=`${diff}d`;
    if(diff<=0){cls='up-past';lbl='Released';}
    else if(diff<=3){cls='up-soon';lbl=`${diff}d left`;}
    else if(diff<=14){cls='up-near';lbl=`${diff}d`;}
    return`<div class="up-card" style="padding:8px 11px">
      <div class="up-date-box"><div class="up-mon">${mon}</div><div class="up-day">${d.getDate()}</div></div>
      <div class="up-info">
        <div class="up-title" style="font-size:12px">${esc(it.title)}</div>
        <div class="up-sub" style="font-size:10px">${esc(it.label)}</div>
      </div>
      <div class="up-pill ${cls}">${lbl}</div>
    </div>`;
  }).join('');
  return`<div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);overflow:hidden">
    <div style="padding:12px 14px 8px;border-bottom:1px solid var(--brd)">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--mu)">🗓 Upcoming</div>
    </div>
    <div style="padding:10px">${rows||`<div style="color:var(--mu);font-size:13px;text-align:center;padding:14px">No upcoming items</div>`}</div>
  </div>`;
}
