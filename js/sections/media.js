// MEDIA SECTION
// ═══════════════════════════════
function renderMedia(c){
  // Sub-tabs
  const tabs=['List','Dashboard','Upcoming','Incomplete'];
  const tabsHtml=`<div style="margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:nowrap">
      <div id="gdrop" style="position:relative;flex-shrink:0;z-index:200">
        <button class="nb-btn ac" style="height:32px;font-size:12px;font-weight:700;white-space:nowrap;padding:0 10px" onclick="toggleGdrop(event)">
          <span id="gdrop-lbl">${gbyid(GACTIVE).name}</span> ▾
        </button>
        <div id="gdrop-menu" style="position:absolute;top:calc(100% + 4px);left:0;background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);min-width:180px;z-index:9000;box-shadow:0 8px 24px rgba(0,0,0,.5);max-height:60vh;overflow-y:auto;display:none">
        </div>
      </div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;flex:1">
        <div class="sub-tabs" style="flex-shrink:0;flex-wrap:nowrap;white-space:nowrap">
          ${tabs.map((t,i)=>`<button class="stab${MEDIA_PAGE===['list','dashboard','upcoming','incomplete'][i]?' active':''}" onclick="setMediaPage('${['list','dashboard','upcoming','incomplete'][i]}')">${t}</button>`).join('')}
        </div>
      </div>
    </div>
  </div>`;

  c.innerHTML=tabsHtml+'<div id="media-body"></div>';
  buildGenreMenu();

  // Update gdot color
  const g=gbyid(GACTIVE);
  const _gd=document.getElementById('gdot'); if(_gd) _gd.style.background=g.color;
  document.getElementById('gdrop-lbl').textContent=g.name;

  renderMediaBody();
}

function setMediaPage(p){MEDIA_PAGE=p;SEARCH='';document.getElementById('srch').value='';document.getElementById('fstatus').value='';renderMediaBody()}
function renderMediaBody(){
  const el=document.getElementById('media-body'); if(!el)return;
  if(MEDIA_PAGE==='list')      renderList(el);
  else if(MEDIA_PAGE==='dashboard') renderDash(el);
  else if(MEDIA_PAGE==='upcoming')  renderUpcoming(el);
  else if(MEDIA_PAGE==='incomplete') renderIncomplete(el);
  // Update active tab
  document.querySelectorAll('.stab').forEach((t,i)=>{
    t.classList.toggle('active',['list','dashboard','upcoming','incomplete'][i]===MEDIA_PAGE);
  });
}

// ─── LIST ───
function filteredData(){
  let d=DATA.filter(e=>e.genreId===GACTIVE);
  const fst=document.getElementById('fstatus')?.value;
  const fs=document.getElementById('fsort')?.value;
  // Search queries FULL list - filter only applied when no search active
  if(SEARCH){
    d=d.filter(e=>e.title.toLowerCase().includes(SEARCH)||(e.timeline||[]).some(it=>(it.name||it.movieTitle||'').toLowerCase().includes(SEARCH)));
    // When searching ignore status filter so matches outside filter still appear
    if(fs==='added')d=[...d].sort((a,b)=>(b.addedAt||0)-(a.addedAt||0));
    else d=[...d].sort((a,b)=>a.title.localeCompare(b.title));
    return{data:d,fst:''}; // fst='' means show all statuses in results
  }
  if(fs==='added')d=[...d].sort((a,b)=>(b.addedAt||0)-(a.addedAt||0));
  else d=[...d].sort((a,b)=>a.title.localeCompare(b.title));
  return{data:d,fst};
}

function expandRows(entries,fst){
  const rows=[];
  entries.forEach(e=>{
    const tl=e.timeline||[];
    if(!tl.length){if(!fst||e.status===fst)rows.push({kind:'entry',e,status:e.status});}
    else tl.forEach((it,idx)=>{const st=it.status||'not_started';if(!fst||st===fst)rows.push({kind:'tl',e,it,idx,status:st});});
  });
  return rows;
}

function renderList(c){
  const {data,fst}=filteredData();
  const flat=expandRows(data,fst);
  const pCount=new Set(flat.map(r=>r.e.id)).size;
  document.getElementById('cnt-lbl').textContent=`${pCount} title${pCount!==1?'s':''} · ${flat.length} part${flat.length!==1?'s':''}`;
  if(!flat.length){c.innerHTML=`<div class="empty"><div class="empty-ico">◌</div><p>No titles here yet</p></div>`;return}
  const byS={};SO.forEach(s=>{byS[s]=flat.filter(r=>r.status===s)});
  let html='';
  SO.forEach(s=>{
    const rows=byS[s]; if(!rows?.length)return;
    const[col,lbl]=SSL[s];
    const coll=COLLAPSED[GACTIVE+'_'+s];
    html+=`<div class="ss-section">
      <div class="ss-head" onclick="toggleColl('${s}')">
        <span class="ss-lbl" style="color:${col}">${lbl}</span>
        <span class="ss-cnt">${rows.length}</span>
        <span class="ss-line" style="background:${col}22"></span>
        <span class="ss-arr${coll?' coll':''}">▾</span>
      </div>
      <div class="ss-rows${coll?' coll':''}">
        ${rows.map(r=>r.kind==='tl'?tlRowHtml(r.e,r.it,r.idx):rowHtml(r.e)).join('')}
      </div>
    </div>`;
  });
  c.innerHTML=html;
}

function toggleColl(s){const k=GACTIVE+'_'+s;COLLAPSED[k]=!COLLAPSED[k];renderMediaBody()}

function entryStats(e){
  const tl=e.timeline||[];const dur=parseInt(e.epDuration)||24;
  if(!tl.length){const cur=parseInt(e.epCur||0),tot=parseInt(e.epTot||0);const pct=tot?Math.round(cur/tot*100):(cur>0?100:0);return{cur,tot,pct,time:estTime(tot||cur,dur)}}
  let cur=0,tot=0;
  tl.forEach(it=>{if(it.type==='season'){cur+=parseInt(it.epWatched||0);tot+=parseInt(it.eps||0)}else if(it.type==='movie'&&it.watched){cur+=1;tot+=1}});
  return{cur,tot,pct:tot?Math.round(cur/tot*100):0,time:estTime(tot,dur)};
}

function activeSeason(e){
  const tl=(e.timeline||[]).filter(it=>it.type==='season');
  return tl.find(it=>it.status==='watching')||tl.find(it=>it.status==='not_started')||tl[tl.length-1]||null;
}

function airingCountdown(e) {
  if (e.airingDay == null || e.status !== 'watching') return '';
  const diff = (e.airingDay - new Date().getDay() + 7) % 7;
  const lbl  = diff === 0 ? 'Airs Today!' : diff === 1 ? 'Tomorrow' : `in ${diff}d`;
  const col  = diff === 0 ? '#4ade80' : diff === 1 ? '#fbbf24' : 'var(--mu)';
  return `<span style="font-size:10px;font-weight:700;color:${col};white-space:nowrap">📺 ${lbl}</span>`;
}

function rowHtml(e){
  const isA=PANEL&&PEDIT===e.id;
  const tl=e.timeline||[];
  const col=pcol(e.status);
  let rCur=0,rTot=0,rPct=0,showCtrl=false;
  if(tl.length){const as=activeSeason(e);if(as&&as.type==='season'){rCur=parseInt(as.epWatched||0);rTot=parseInt(as.eps||0);rPct=rTot?Math.round(rCur/rTot*100):(rCur>0?100:0);showCtrl=['watching','on_hold'].includes(as.status);}}
  else{rCur=parseInt(e.epCur||0);rTot=parseInt(e.epTot||0);rPct=rTot?Math.round(rCur/rTot*100):(rCur>0?100:0);showCtrl=['watching','completed','on_hold','dropped'].includes(e.status);}
  const hasBar=rTot>0||rCur>0;
  const seaC=tl.filter(t=>t.type==='season').length,movC=tl.filter(t=>t.type==='movie').length;
  return`<div class="row${isA?' active-row':''}" id="row-${e.id}" onclick="openDetail('${e.id}')">
    <div class="row-bar" style="background:${col}"></div>
    <div class="row-info">
      <div class="row-title">${esc(e.title)}</div>
      <div class="row-meta">${stag(e.status)}${tl.length?`<span style="font-size:10px;color:var(--mu)">${seaC}S${movC?' + '+movC+'M':''}</span>`:''}${rewatchBadge(e)}${airingCountdown(e)}</div>
    </div>
    <div class="row-r">
      ${hasBar?`<div class="row-prog"><div class="prog-bar"><div class="prog-fill" style="width:${rPct}%;background:${col}"></div></div><span class="prog-txt">${rCur}${rTot?'/'+rTot:''}</span></div>`:''}
      <div class="row-btns" onclick="event.stopPropagation()">
        ${showCtrl&&hasBar?`<div class="ep-inline"><button class="ep-pm" onclick="quickEp('${e.id}',-1)">−</button><span class="ep-val">${rCur}</span><button class="ep-pm" onclick="quickEp('${e.id}',1)">+</button></div>`:''}
        <button class="rbt" onclick="openEdit('${e.id}')">✏</button>
        <button class="rbt del" onclick="askDel('${e.id}')">✕</button>
        ${e.status==='watching'&&e.watchUrl?`<button class="rbt" style="background:rgba(var(--ac-rgb),.12);color:var(--ac);border-color:rgba(var(--ac-rgb),.3)" onclick="event.stopPropagation();window.open('${esc(e.watchUrl)}','_blank')" title="Watch">▶</button>`:''}
      </div>
    </div>
  </div>`;
}

function tlRowHtml(e,it,idx){
  const isA=PANEL&&PEDIT===e.id;
  const isS=it.type==='season';const st=it.status||'not_started';
  const col=pcol(st);const w=parseInt(it.epWatched||0),t=parseInt(it.eps||0);
  const pct=t?Math.round(w/t*100):(w>0?100:0);
  const hasBar=t>0||w>0;const showCtrl=isS&&['watching','on_hold'].includes(st);
  const rawName=isS?(it.name||`Season ${it.num||idx+1}`):(it.movieTitle||it.name||'Movie');
  const fullName=`${e.title} · ${rawName}`;
  const pill=isS?`<span class="tl-pill">S${it.num||idx+1}</span>`:`<span class="tl-pill">🎬</span>`;
  return`<div class="row${isA?' active-row':''}" onclick="openDetail('${e.id}')">
    <div class="row-bar" style="background:${col}"></div>
    <div class="row-info">
      <div class="row-title" style="display:flex;align-items:center;gap:5px">${pill}${esc(fullName)}</div>
      <div class="row-meta">${stag(st)}</div>
    </div>
    <div class="row-r">
      ${hasBar?`<div class="row-prog"><div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:${col}"></div></div><span class="prog-txt">${w}${t?'/'+t:''}</span></div>`:''}
      <div class="row-btns" onclick="event.stopPropagation()">
        ${showCtrl?`<div class="ep-inline"><button class="ep-pm" onclick="quickTlEp('${e.id}',${idx},-1)">−</button><span class="ep-val">${w}</span><button class="ep-pm" onclick="quickTlEp('${e.id}',${idx},1)">+</button></div>`:''}
        <button class="rbt" onclick="openEdit('${e.id}')">✏</button>
        <button class="rbt del" onclick="askDel('${e.id}')">✕</button>
      </div>
    </div>
  </div>`;
}

// ─── QUICK EP ───
function quickEp(id,delta){
  const e=DATA.find(x=>x.id===id);if(!e)return;
  const tl=e.timeline||[];
  if(tl.length){const as=activeSeason(e);if(as){const w=Math.max(0,parseInt(as.epWatched||0)+delta);as.epWatched=as.eps?Math.min(w,parseInt(as.eps)):w;if(as.eps&&as.epWatched>=parseInt(as.eps)&&as.status==='watching')as.status='completed';}}
  else{e.epCur=Math.max(0,(parseInt(e.epCur)||0)+delta);if(e.epTot&&e.epCur>=parseInt(e.epTot)&&e.status==='watching'){e.status='completed';e.endDate=today();}}
  e.updatedAt=Date.now();saveData(DATA);renderMediaBody();if(PANEL==='detail'&&PEDIT===id)renderDetailPanel(DATA.find(x=>x.id===id));
}

function quickTlEp(eid,idx,delta){
  const e=DATA.find(x=>x.id===eid);if(!e)return;
  const it=e.timeline&&e.timeline[idx];if(!it||it.type!=='season')return;
  const w=Math.max(0,parseInt(it.epWatched||0)+delta);
  it.epWatched=it.eps?Math.min(w,parseInt(it.eps)):w;
  if(it.eps&&it.epWatched>=parseInt(it.eps)&&it.status==='watching'){it.status='completed';if((e.timeline||[]).filter(t=>t.type==='season').every(s=>s.status==='completed'))e.status='completed';}
  e.updatedAt=Date.now();saveData(DATA);renderMediaBody();if(PANEL==='detail'&&PEDIT===eid)renderDetailPanel(e);
}

// ─── DASHBOARD ───
function renderDash(c){
  const d=DATA.filter(e=>e.genreId===GACTIVE);
  const cnt={};d.forEach(e=>{cnt[e.status]=(cnt[e.status]||0)+1});
  let epTotal=0,rSum=0,rN=0,totalMin=0;
  d.forEach(e=>{
    const st=entryStats(e);epTotal+=st.cur;
    const dur=parseInt(e.epDuration||24);
    const tl=e.timeline||[];
    if(tl.length)tl.forEach(it=>{if(it.type==='season')totalMin+=parseInt(it.epWatched||0)*parseInt(it.epDuration||dur);});
    else totalMin+=parseInt(e.epCur||0)*dur;
    if(e.rating){rSum+=parseFloat(e.rating);rN++}
    (e.timeline||[]).forEach(it=>{if(it.rating){rSum+=parseFloat(it.rating);rN++}});
  });
  const avg=rN?(rSum/rN).toFixed(1):'—';
  const g=gbyid(GACTIVE);
  const byGenre=GENRES.map(gg=>{const cnt2=DATA.filter(e=>e.genreId===gg.id).length;return cnt2?`
    <div class="gb-row">
      <span style="width:7px;height:7px;border-radius:50%;background:${gg.color};flex-shrink:0;display:inline-block"></span>
      <span style="flex:1;font-size:13px">${esc(gg.name)}</span>
      <span style="font-size:12px;color:var(--tx2);font-weight:700">${cnt2}</span>
    </div>`:''}).join('');
  c.innerHTML=`
    <div style="font-family:var(--fd);font-size:18px;font-weight:700;margin-bottom:16px;letter-spacing:1px;text-transform:uppercase;color:var(--ac)">◉ ${g.name} Dashboard</div>
    <div class="dash-grid">
      <div class="dc"><div class="dc-v">${d.length}</div><div class="dc-l">Total</div></div>
      <div class="dc"><div class="dc-v">${cnt.watching||0}</div><div class="dc-l">Watching</div></div>
      <div class="dc"><div class="dc-v">${cnt.completed||0}</div><div class="dc-l">Completed</div></div>
      <div class="dc"><div class="dc-v">${cnt.plan||0}</div><div class="dc-l">Planned</div></div>
      <div class="dc"><div class="dc-v">${cnt.on_hold||0}</div><div class="dc-l">On Hold</div></div>
      <div class="dc"><div class="dc-v">${cnt.dropped||0}</div><div class="dc-l">Dropped</div></div>
      <div class="dc"><div class="dc-v">${epTotal.toLocaleString()}</div><div class="dc-l">Eps Watched</div></div>
      <div class="dc"><div class="dc-v">${avg}</div><div class="dc-l">Avg Rating</div></div>
    </div>
    <div class="time-cards">
      <div class="tc"><div class="tc-v">${fmtMin(totalMin)}</div><div class="tc-l">Time Watched</div><div class="tc-d">${(totalMin/60).toFixed(0)} hours total</div></div>
      <div class="tc"><div class="tc-v">${Math.floor(totalMin/1440)}</div><div class="tc-l">Days Watched</div><div class="tc-d">of continuous watching</div></div>
    </div>
    <div class="genre-breakdown">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--mu);margin-bottom:10px;display:flex;justify-content:space-between"><span>All Genres</span><span style="font-weight:400;opacity:.6">count</span></div>
      ${byGenre||'<div style="color:var(--mu);font-size:13px">No data</div>'}
    </div>`;
}

// ─── UPCOMING ───
function renderUpcoming(c){
  const now=new Date();now.setHours(0,0,0,0);
  const items=[];
  DATA.filter(e=>e.genreId===GACTIVE).forEach(e=>{
    if(e.upcomingDate)items.push({id:e.id,title:e.title,date:e.upcomingDate,time:e.upcomingTime||null,label:'New Release'});
    (e.timeline||[]).forEach(it=>{if(it.upcomingDate)items.push({id:e.id,title:e.title,date:it.upcomingDate,time:it.upcomingTime||null,label:it.name||'New Season'});});
  });
  items.sort((a,b)=>new Date(a.date)-new Date(b.date));
  const rows=items.map(it=>{
    const d=new Date(it.date+'T00:00:00');
    const diff=Math.ceil((d-now)/86400000);
    const mon=d.toLocaleString('default',{month:'short'}).toUpperCase();
    let cls='up-far',lbl=`${diff}d`;
    if(diff<=0){cls='up-past';lbl='Released';}else if(diff<=3){cls='up-soon';lbl=`${diff}d left`;}else if(diff<=14){cls='up-near';lbl=`${diff}d`;}
    return`<div class="up-card" onclick="openDetail('${it.id}')">
      <div class="up-date-box"><div class="up-mon">${mon}</div><div class="up-day">${d.getDate()}</div></div>
      <div class="up-info"><div class="up-title">${esc(it.title)}</div><div class="up-sub">${esc(it.label)}${it.time?' · '+it.time:''}</div></div>
      <div class="up-pill ${cls}">${lbl}</div>
    </div>`;
  }).join('');
  c.innerHTML=`<div style="font-family:var(--fd);font-size:18px;font-weight:700;margin-bottom:16px;letter-spacing:1px;text-transform:uppercase;color:var(--ac)">🗓 Upcoming</div>${rows||`<div class="empty"><div class="empty-ico">📅</div><p>No upcoming items</p></div>`}`;
}

// ─── INCOMPLETE ───
function renderIncomplete(c){
  const items=DATA.filter(e=>e.genreId===GACTIVE&&(()=>{const s=(e.timeline||[]).filter(t=>t.type==='season');return s.some(x=>x.status==='completed')&&s.some(x=>['not_started','plan','watching'].includes(x.status));})());
  c.innerHTML=`<div style="font-family:var(--fd);font-size:18px;font-weight:700;margin-bottom:16px;letter-spacing:1px;text-transform:uppercase;color:var(--ac)">⚠ Incomplete Seasons</div>`+(items.length?items.map(e=>{
    const g=gbyid(e.genreId);const seas=(e.timeline||[]).filter(t=>t.type==='season');const done=seas.filter(s=>s.status==='completed').length;
    return`<div class="row" style="margin-bottom:3px" onclick="openDetail('${e.id}')">
      <div class="row-bar" style="background:${g.color}"></div>
      <div class="row-info"><div class="row-title">${esc(e.title)}</div><div class="row-meta">${stag(e.status)}<span style="font-size:10px;color:var(--mu)">${done}/${seas.length} seasons done</span></div></div>
      <div class="row-r"><div class="row-btns" onclick="event.stopPropagation()"><button class="rbt" onclick="openEdit('${e.id}')">✏</button></div></div>
    </div>`;
  }).join(''):`<div class="empty"><div class="empty-ico">🎉</div><p>All caught up!</p></div>`);
}

// ═══════════════════════════════
//  PANEL MANAGEMENT
// ═══════════════════════════════
function openPanel(mode,id){
  PANEL=mode;PEDIT=id;
  document.getElementById('rpanel').classList.add('open');
  document.getElementById('poverlay').classList.add('show');
  document.getElementById('content').classList.add('pushed');
  if(mode==='detail'){const e=DATA.find(x=>x.id===id);if(e)renderDetailPanel(e)}
  else if(mode==='add')renderFormPanel(null);
  else if(mode==='edit'){const e=DATA.find(x=>x.id===id);if(e)renderFormPanel(e)}
}
function closePanel(){
  PANEL=null;PEDIT=null;
  document.getElementById('rpanel').classList.remove('open');
  document.getElementById('poverlay').classList.remove('show');
  document.getElementById('content').classList.remove('pushed');
  render();
}
function openDetail(id){openPanel('detail',id)}
function openEdit(id){openPanel('edit',id)}
function openAdd(){openPanel('add',null)}

// ─── DETAIL PANEL ───
function renderDetailPanel(e){
  const st=entryStats(e);const g=gbyid(e.genreId);const tl=e.timeline||[];
  document.getElementById('panel-inner').innerHTML=`
    <div class="ph">
      <div>
        <div class="ph-title">${esc(e.title)}</div>
        <div class="pbadges">
          <span class="genre-badge" style="background:${h2r(g.color,.12)};color:${g.color}">${esc(g.name)}</span>
          ${stag(e.status)}
          ${e.favorite?'<span style="color:#fbbf24">★</span>':''}
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
    ${(e.startDate||e.endDate)?`<div style="padding:7px 16px;border-bottom:1px solid var(--brd);display:flex;gap:14px;font-size:11px;color:var(--mu)">
      ${e.startDate?`<span>Started: <b style="color:var(--tx2)">${fmtDate(e.startDate)}</b></span>`:''}
      ${e.endDate?`<span>Finished: <b style="color:var(--tx2)">${fmtDate(e.endDate)}</b></span>`:''}
    </div>`:''}
    ${tl.length?`
    <div class="sec-div"><span class="sec-div-lbl">Timeline</span><div class="sec-div-line"></div><span class="sec-div-hint">drag ↕ to reorder</span></div>
    <div class="tl-wrap" id="dtl-wrap">${tl.map((it,i)=>tlViewHtml(it,i,e.id,e.title)).join('')}</div>`
    :`<div style="padding:12px 16px;border-bottom:1px solid var(--brd)">
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
          ${e.rating?`<div style="background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:9px 11px">
            <div style="color:var(--mu);font-size:10px;margin-bottom:3px">RATING</div>
            <div style="font-weight:600;color:#fbbf24">★ ${e.rating} / 10</div>
          </div>`:''}
          ${e.rewatchCount?`<div style="background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:9px 11px">
            <div style="color:var(--mu);font-size:10px;margin-bottom:3px">REWATCHED</div>
            <div style="font-weight:600;color:var(--tx)">${e.rewatchCount}×</div>
          </div>`:''}
          ${e.startDate?`<div style="background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:9px 11px">
            <div style="color:var(--mu);font-size:10px;margin-bottom:3px">STARTED</div>
            <div style="font-weight:600;color:var(--tx)">${fmtDate(e.startDate)}</div>
          </div>`:''}
          ${e.endDate?`<div style="background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:9px 11px">
            <div style="color:var(--mu);font-size:10px;margin-bottom:3px">FINISHED</div>
            <div style="font-weight:600;color:#4ade80">${fmtDate(e.endDate)}</div>
          </div>`:''}
          ${e.airingDay!=null?`<div style="background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:9px 11px;grid-column:span 2">
            <div style="color:var(--mu);font-size:10px;margin-bottom:3px">AIRING</div>
            <div style="font-weight:600;color:var(--ac)">📺 ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][e.airingDay]}${e.airingTime?' at '+e.airingTime:''}</div>
          </div>`:''}
        </div>
        <div style="margin-top:10px;font-size:11px;color:var(--mu)">No seasons added yet — click Edit to add seasons or movies</div>
      </div>`
    }
    ${e.notes?`<div class="sec-div"><span class="sec-div-lbl">Notes</span><div class="sec-div-line"></div></div><div class="pnotes"><div class="pnotes-box">${esc(e.notes)}</div></div>`:''}
    ${e.status==='completed'&&(e.rewatches||[]).length?`
    <div class="sec-div"><span class="sec-div-lbl">↺ Rewatches (${e.rewatches.length})</span><div class="sec-div-line"></div></div>
    <div style="padding:0 16px 8px">
      ${e.rewatches.map((r,i)=>`
        <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:8px 11px;margin-bottom:5px;font-size:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
            <span style="font-weight:600;color:var(--tx)">Rewatch #${i+1}</span>
            ${r.rating?`<span style="color:#fbbf24">★ ${r.rating}</span>`:''}
          </div>
          <div style="color:var(--mu);display:flex;gap:12px;flex-wrap:wrap;margin-bottom:6px">
            ${r.epWatched?`<span>${r.epWatched} ep</span>`:''}
            ${r.startDate?`<span>📅 ${fmtDate(r.startDate)}</span>`:''}
            ${r.endDate?`<span>🏁 ${fmtDate(r.endDate)}</span>`:''}
          </div>
          ${r.notes?`<div style="margin-top:2px;margin-bottom:6px;color:var(--tx2);font-style:italic">${esc(r.notes)}</div>`:''}
          <div style="display:flex;gap:6px;align-items:center">
            <div class="ep-inline" style="flex-shrink:0">
              <button class="ep-pm" onclick="updateRewatchEp('${e.id}',${i},-1)">−</button>
              <span class="ep-val" id="rw-ep-${e.id}-${i}">${r.epWatched||0}</span>
              <button class="ep-pm" onclick="updateRewatchEp('${e.id}',${i},1)">+</button>
            </div>
            <span style="font-size:11px;color:var(--mu)">/ ${entryStats(e).tot||'?'} ep</span>
            <button onclick="openEditRewatch('${e.id}',${i})" style="margin-left:auto;font-size:11px;color:var(--ac);background:none;border:1px solid rgba(var(--ac-rgb),.3);border-radius:4px;padding:2px 8px;cursor:pointer">Edit</button>
          </div>
        </div>`).join('')}
    </div>`:''}
    <div class="panel-actions">
      <button class="btn-del" onclick="askDel('${e.id}')">Delete</button>
      ${e.status==='completed'?`<button class="btn-cancel" onclick="startRewatch('${e.id}')" style="background:rgba(var(--ac-rgb),.1);color:var(--ac);border:1px solid rgba(var(--ac-rgb),.3)">↺ Rewatch</button>`:''}
      <button class="btn-cancel" onclick="openEdit('${e.id}')">Edit</button>
    </div>`;
  initDetailDrag(e);
}

function tlViewHtml(it,i,eid,parentTitle){
  const isS=it.type==='season';const isCur=isS&&it.status==='watching';
  const w=parseInt(it.epWatched||0),t=parseInt(it.eps||0);
  const pct=t?Math.round(w/t*100):0;const sc=pcol(it.status);
  const rawName=isS?(it.name||`Season ${it.num||i+1}`):(it.movieTitle||it.name||'Movie');
  const fullName=`${parentTitle} · ${rawName}`;
  return`<div class="tl-item${isCur?' tl-cur':''}${!isS?' tl-mov':''}" draggable="true" data-idx="${i}"
    ondragstart="dDragStart(event,${i})" ondragover="dDragOver(event,${i})" ondrop="dDrop(event,${i})" ondragleave="this.classList.remove('drag-over')">
    <span class="tl-drag">⠿</span>
    <span class="tl-type-pill ${isS?'tp-s':'tp-m'}">${isS?`S${it.num||i+1}`:'🎬'}</span>
    <div class="tl-info">
      <div class="tl-name">${esc(fullName)}</div>
      <div class="tl-sub">
        ${stag(it.status||'not_started')}
        ${it.endDate?`<span style="font-size:10px;color:#4ade80">✓ ${fmtDate(it.endDate)}</span>`:''}
        ${it.rating?`<span style="font-size:10px;color:#fbbf24">★ ${it.rating}</span>`:''}
        ${it.upcomingDate?`<span style="font-size:10px;color:#fb923c">📅 ${fmtDate(it.upcomingDate)}</span>`:''}
      </div>
    </div>
    <div class="tl-r">
      ${isS&&(t||w)?`<span class="tl-ep">${w}${t?'/'+t:''} ep</span><div class="mini-bar"><div class="mini-fill" style="width:${pct}%;background:${sc}"></div></div>`:''}
      ${isS&&it.status==='watching'?`<div class="ep-ctrl">
        <button class="ep-ctrl-pm" onclick="panelEp('${eid}',${i},-1)">−</button>
        <span class="ep-num">${w}</span>
        <button class="ep-ctrl-pm" onclick="panelEp('${eid}',${i},1)">+</button>
      </div>`:''}
    </div>
  </div>`;
}

function panelEp(eid,idx,delta){
  const e=DATA.find(x=>x.id===eid);if(!e)return;
  const it=e.timeline[idx];if(!it||it.type!=='season')return;
  const w=Math.max(0,parseInt(it.epWatched||0)+delta);
  it.epWatched=it.eps?Math.min(w,parseInt(it.eps)):w;
  if(it.eps&&it.epWatched>=parseInt(it.eps)&&it.status==='watching')it.status='completed';
  e.updatedAt=Date.now();saveData(DATA);renderDetailPanel(e);renderMediaBody();
}


function dDragStart(ev,i){DDRG=i;ev.currentTarget.classList.add('dragging')}
function dDragOver(ev,i){ev.preventDefault();if(DDRG===i)return;ev.currentTarget.classList.add('drag-over')}
function dDrop(ev,i){
  ev.preventDefault();ev.currentTarget.classList.remove('drag-over');
  if(DDRG===null||DDRG===i)return;
  const e=DATA.find(x=>x.id===PEDIT);if(!e)return;
  const item=e.timeline.splice(DDRG,1)[0];e.timeline.splice(i,0,item);
  DDRG=null;saveData(DATA);renderDetailPanel(e);
}
function initDetailDrag(e){
  document.querySelectorAll('#dtl-wrap .tl-item').forEach(el=>{
    el.addEventListener('dragend',()=>{el.classList.remove('dragging');document.querySelectorAll('.tl-item').forEach(x=>x.classList.remove('drag-over'))});
  });
}

// ─── FORM PANEL ───
function renderFormPanel(e){
  const isEdit=!!e;
  // Pre-load Season 1 for new entries
  if(e){
    FORM_TL=JSON.parse(JSON.stringify(e.timeline||[]));
  } else {
    FORM_TL=[{id:uid(),type:'season',num:1,name:'Season 1',status:'not_started',eps:null,epWatched:null,startDate:null,endDate:null,rating:null,epDuration:null,upcomingDate:null,upcomingTime:null}];
  }
  const gOpts=GENRES.map(g=>`<option value="${g.id}" ${(e?e.genreId:GACTIVE)===g.id?'selected':''}>${esc(g.name)}</option>`).join('');
  const status=e?e.status:'not_started';
  const airingDays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  document.getElementById('panel-inner').innerHTML=`
    <div class="ph">
      <div class="ph-title">${isEdit?'Edit Entry':'Add New Title'}</div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    <div class="form-wrap">
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
            <option value="watching" ${status==='watching'?'selected':''}>▶ Watching</option>
            <option value="plan" ${status==='plan'?'selected':''}>◻ Plan to Watch</option>
            <option value="completed" ${status==='completed'?'selected':''}>✓ Completed</option>
            <option value="on_hold" ${status==='on_hold'?'selected':''}>⏸ On Hold</option>
            <option value="dropped" ${status==='dropped'?'selected':''}>✗ Dropped</option>
            <option value="upcoming" ${status==='upcoming'?'selected':''}>◉ Upcoming</option>
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
        <div class="fg"><label class="flbl">Rewatch Count</label><input class="fin" type="number" id="f-rewatch" min="0" placeholder="0" value="${e&&e.rewatchCount?e.rewatchCount:''}"></div>
        <div class="fg" style="display:flex;align-items:center;gap:8px;padding-top:18px">
          <input type="checkbox" id="f-fav" ${e&&e.favorite?'checked':''} style="width:14px;height:14px;cursor:pointer;accent-color:var(--ac)">
          <label for="f-fav" class="flbl" style="margin:0;cursor:pointer">★ Favorite</label>
        </div>
      </div>
      <div class="fg"><label class="flbl">Notes</label><textarea class="fin" id="f-notes" placeholder="Your thoughts...">${esc(e?e.notes||'':'')}</textarea></div>
      <div class="fg"><label class="flbl">Watch URL</label><input class="fin" id="f-url" type="url" placeholder="https://..." value="${esc(e?e.watchUrl||'':'')}"></div>

      <div class="f-sec">Seasons &amp; Movies</div>
      <div id="ftl-list">${FORM_TL.map((it,i)=>tlFormHtml(it,i)).join('')}</div>
      <div class="ftl-add-row">
        <button class="ftl-add" onclick="addTlSeason()">+ Add Season</button>
        <button class="ftl-add" onclick="addTlMovie()">+ Add Movie</button>
      </div>
    </div>
    <div class="panel-actions">
      ${isEdit?`<button class="btn-del" onclick="askDel('${e.id}')">Delete</button>`:''}
      <button class="btn-cancel" onclick="closePanel()">Cancel</button>
      <button class="btn-save" onclick="saveEntry('${e?e.id:''}')">Save</button>
    </div>`;
}

function tlFormHtml(it,i){
  const isS=it.type==='season';const ss=it.status||'not_started';const showUp=ss==='upcoming';
  return`<div class="ftl-item" draggable="true" data-idx="${i}" data-type="${it.type}" data-id="${it.id||''}"
    ondragstart="fDragStart(event,${i})" ondragover="fDragOver(event,${i})" ondrop="fDrop(event,${i})">
    <button class="ftl-rm" onclick="removeTlItem(${i})">✕</button>
    <div class="ftl-head">
      <span class="ftl-drag">⠿</span>
      <span class="tl-type-pill ${isS?'tp-s':'tp-m'}">${isS?'Season':'Movie'}</span>
      ${isS?`<span style="font-size:10px;color:var(--mu)">S${it.num||i+1}</span>`:''}
    </div>
    <div class="fg-row" style="margin-bottom:7px">
      <div class="fg"><label class="flbl">${isS?'Season Name':'Movie Title'}</label><input class="fin" data-fi="name" value="${esc(it.name||it.movieTitle||'')}" placeholder="${isS?'e.g. Season 1':'Movie title'}"></div>
      <div class="fg"><label class="flbl">Status</label>
        <select class="fin" data-fi="status" onchange="onTlSC(this,${i})">
          <option value="not_started" ${ss==='not_started'?'selected':''}>○ Not Started</option>
          <option value="plan" ${ss==='plan'?'selected':''}>◻ Planned</option>
          <option value="watching" ${ss==='watching'?'selected':''}>▶ Watching</option>
          <option value="completed" ${ss==='completed'?'selected':''}>✓ Completed</option>
          <option value="upcoming" ${ss==='upcoming'?'selected':''}>◉ Upcoming</option>
          <option value="dropped" ${ss==='dropped'?'selected':''}>✗ Dropped</option>
        </select>
      </div>
    </div>
    ${isS?`<div class="fg-row" style="margin-bottom:7px">
      <div class="fg"><label class="flbl">Total Eps</label><input class="fin" type="number" data-fi="eps" value="${it.eps||''}" placeholder="e.g. 12"></div>
      <div class="fg"><label class="flbl">Watched</label><input class="fin" type="number" data-fi="epWatched" value="${it.epWatched||''}" placeholder="0"></div>
    </div>`:''}
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

function onTlSC(sel,i){
  const v=sel.value;const row=document.getElementById(`ftl-upd-${i}`);
  if(row)row.style.display=v==='upcoming'?'grid':'none';
  if(v==='completed'){const endEl=sel.closest('.ftl-item').querySelector('[data-fi="endDate"]');if(endEl&&!endEl.value)endEl.value=today();}
}

function collectFormTl(){
  const items=[];let sNum=0;
  document.querySelectorAll('#ftl-list .ftl-item').forEach(el=>{
    const type=el.dataset.type||'season';const id=el.dataset.id||uid();const isS=type==='season';
    if(isS)sNum++; // movies never increment season counter
    const get=fi=>{const x=el.querySelector(`[data-fi="${fi}"]`);return x?x.value:''};
    const name=get('name'),status=get('status')||'not_started';
    let endDate=get('endDate')||null;if(status==='completed'&&!endDate)endDate=today();
    items.push({id,type,num:isS?sNum:null,name:name||null,movieTitle:!isS?(name||null):null,status,
      eps:isS?(get('eps')||null):null,epWatched:isS?(get('epWatched')||null):null,
      watched:!isS&&status==='completed',
      startDate:get('startDate')||null,endDate,
      rating:get('rating')||null,epDuration:get('epDuration')?parseInt(get('epDuration')):null,
      upcomingDate:get('upcomingDate')||null,upcomingTime:get('upcomingTime')||null,
    });
  });
  return items;
}

function addTlSeason(){
  const cur=collectFormTl();
  // Only count seasons (not movies) for numbering
  const num=(cur.filter(x=>x.type==='season').length)+1;
  cur.push({id:uid(),type:'season',num,name:`Season ${num}`,status:'not_started',eps:null,epWatched:null,startDate:null,endDate:null,rating:null,epDuration:null,upcomingDate:null,upcomingTime:null});
  FORM_TL=cur;refreshFtl();
}
function addTlMovie(){const cur=collectFormTl();cur.push({id:uid(),type:'movie',movieTitle:'',name:'',status:'not_started',watched:false,upcomingDate:null,upcomingTime:null});FORM_TL=cur;refreshFtl()}
function removeTlItem(i){const c=collectFormTl();c.splice(i,1);FORM_TL=c;refreshFtl()}
function refreshFtl(){document.getElementById('ftl-list').innerHTML=FORM_TL.map((it,i)=>tlFormHtml(it,i)).join('')}


function fDragStart(ev,i){FDRG=i;ev.currentTarget.classList.add('dragging')}
function fDragOver(ev,i){ev.preventDefault();if(FDRG===i)return;document.querySelectorAll('.ftl-item').forEach(x=>x.classList.remove('drag-over'));ev.currentTarget.classList.add('drag-over')}
function fDrop(ev,i){ev.preventDefault();document.querySelectorAll('.ftl-item').forEach(x=>x.classList.remove('drag-over','dragging'));if(FDRG===null||FDRG===i)return;const c=collectFormTl();const item=c.splice(FDRG,1)[0];c.splice(i,0,item);FORM_TL=c;FDRG=null;refreshFtl()}

function saveEntry(eid){
  const title=document.getElementById('f-title').value.trim();if(!title){showAlert('Please enter a title',{title:'Missing Title'});return}
  const existing=eid?DATA.find(x=>x.id===eid):null;
  const tl=collectFormTl();
  const g=f=>{const el=document.getElementById(f);return el?el.value||null:null};
  const airingDayEl=document.getElementById('f-airingday');
  const airingDay=airingDayEl?.value!==''?parseInt(airingDayEl.value):null;
  const entry={
    id:eid||uid(),title,
    genreId:g('f-genre'),status:g('f-status'),
    airingDay: isNaN(airingDay)?null:airingDay,
    airingTime:g('f-airingtime'),
    rewatchCount:document.getElementById('f-rewatch')?.value?parseInt(document.getElementById('f-rewatch').value):(existing?.rewatchCount||null),
    rewatches:   existing?.rewatches||[],
    favorite:document.getElementById('f-fav')?.checked||false,
    epCur:existing?.epCur||null,
    epTot:existing?.epTot||null,
    startDate:existing?.startDate||null,endDate:existing?.endDate||null,
    rating:existing?.rating||null,epDuration:existing?.epDuration||null,
    upcomingDate:existing?.upcomingDate||null,upcomingTime:existing?.upcomingTime||null,
    notes:g('f-notes'),
    watchUrl:document.getElementById('f-url')?.value?.trim()||null,
    timeline:tl,
    addedAt:existing?existing.addedAt:Date.now(),updatedAt:Date.now(),
  };
  if(entry.status==='completed'&&!entry.endDate&&!tl.length)entry.endDate=today();
  if(eid){const i=DATA.findIndex(x=>x.id===eid);DATA[i]=entry;}else DATA.unshift(entry);
  saveData(DATA);closePanel();render();toast('✓ Saved');
}

function askDel(id){
  showConfirm('This entry will be permanently deleted.',()=>{
  const _del=DATA.find(x=>x.id===id);
  DATA=DATA.filter(x=>x.id!==id);
  if(_del) addLog('media','Deleted',_del.title);
  saveData(DATA);closePanel();render();
  if(_del) toastWithUndo(_del.title,()=>{DATA.push(_del);saveData(DATA);render();});
},{title:'Delete Entry?',okLabel:'Delete'});
}

// ═══════════════════════════════
//  SECTION STUBS
// ═══════════════════════════════
function renderSectionStub(id,c){
  const meta={games:{icon:'◈',color:'#f59e0b',phase:5},books:{icon:'◎',color:'#a78bfa',phase:6},music:{icon:'♪',color:'#fb923c',phase:7},settings:{icon:'⚙',color:'#8888aa',phase:8}};
  const m=meta[id]||{icon:'?',color:'var(--ac)',phase:'?'};
  c.innerHTML=`<div style="font-family:var(--fd);font-size:clamp(18px,3vw,30px);font-weight:700;margin-bottom:16px;letter-spacing:1px;text-transform:uppercase;color:${m.color}">${m.icon} ${id.charAt(0).toUpperCase()+id.slice(1)} Codex</div>
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);padding:40px 24px;text-align:center;color:var(--tx2)">
      <div style="font-size:36px;opacity:.3;margin-bottom:12px">${m.icon}</div>
      <p style="font-size:14px">Full section coming in Phase ${m.phase}</p>
      <small style="font-size:12px;color:var(--mu);display:block;margin-top:6px">Architecture planned and ready</small>
    </div>`;
}

// ═══════════════════════════════════════════════════════
//
