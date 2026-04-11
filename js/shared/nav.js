function nav(id,push=true){
  const prevId = CURRENT;
  CURRENT=id;
  localStorage.setItem('ac_last_section', id);
  if(push) try{history.pushState({},'',' #/'+(id==='home'?'':id));}catch(e){}
  const c=document.getElementById('content');
  // Directional slide based on section order
  const ORDER = ['home','media','games','books','music','vault','log','tools','settings'];
  const pi = ORDER.indexOf(prevId), ni = ORDER.indexOf(id);
  const goingRight = ni > pi;
  c.style.transition = 'none';
  c.style.opacity = '0';
  c.style.transform = prevId === id ? 'none' : goingRight ? 'translateX(12px)' : 'translateX(-12px)';
  setTimeout(()=>{
    c.style.transition = '';
    document.documentElement.setAttribute('data-section',id);
    // Keep inline bg in sync to prevent FOUC override conflicts
    const sectionBg = {
      home:'#070d0b', media:'#07000f', games:'#080600',
      books:'#f5f0e8', music:'#080400', vault:'#f0eefa',
      log:'#010c14', tools:'#080006', settings:'#0a0a12', notes:'#d0e8d0'
    };
    document.documentElement.style.background = sectionBg[id] || sectionBg.home;
    document.documentElement.style.backgroundColor = sectionBg[id] || sectionBg.home;
    document.querySelectorAll('.ni').forEach(el=>el.classList.toggle('active',el.dataset.r===id));
    document.querySelectorAll('.mob-ni').forEach(el=>el.classList.toggle('active',el.dataset.r===id));
    document.querySelectorAll('.bn-item').forEach(el=>el.classList.toggle('active',el.dataset.r===id));
    const m=SECTION_META[id]||{title:id,label:id};
    document.getElementById('nb-title').textContent=m.title;
    document.getElementById('nb-sec').textContent=m.label;
    const srch=document.getElementById('srch');
    srch.placeholder=id==='home'?'Search everything...':`Search ${m.label}...`;
    document.getElementById('filterbar').style.display=id==='media'?'flex':'none';
  // Auto-lock games when leaving
  if(CURRENT!=='games' && typeof GAMES_UNLOCKED!=='undefined'){
    GAMES_UNLOCKED=false; clearTimeout(GAMES_IDLE_TIMER);
  }
  // Auto-lock vault when leaving
  if(CURRENT!=='vault' && typeof VAULT_UNLOCKED!=='undefined') lockVaultOnNav();
  // Update games search
  if(id==='games') document.getElementById('srch').oninput=e=>{GSEARCH=e.target.value.toLowerCase();renderGamesBody();};
  else if(id==='music') document.getElementById('srch').oninput=e=>{MSEARCH=e.target.value.toLowerCase();renderMusicBody();};
  else if(id==='books') document.getElementById('srch').oninput=e=>{BSEARCH=e.target.value.toLowerCase();renderBooksBody();};
  else if(id==='vault') document.getElementById('srch').oninput=e=>{VSEARCH=e.target.value.toLowerCase();renderVaultBody();};
  else if(id==='log')   document.getElementById('srch').oninput=e=>{LSEARCH=e.target.value.toLowerCase();renderLogBody()};
  else if(id==='notes') document.getElementById('srch').oninput=e=>{NSEARCH=e.target.value.toLowerCase();renderNotesBody();};
  else document.getElementById('srch').oninput=e=>{onSearch(e.target.value)};
    // Apply genre CSS vars for media section without triggering a re-render
    if(id==='media'){
      const g=gbyid(GACTIVE); const c2=g.color;
      const _nbSec=document.getElementById('nb-sec'); if(_nbSec) _nbSec.textContent=g.name;
      document.documentElement.style.setProperty('--ac',c2);
      const[r,gg,b]=[parseInt(c2.slice(1,3),16),parseInt(c2.slice(3,5),16),parseInt(c2.slice(5,7),16)];
      document.documentElement.style.setProperty('--ac-rgb',`${r},${gg},${b}`);
    } else {
      // Remove inline overrides so section theme takes over
      document.documentElement.style.removeProperty('--ac');
      document.documentElement.style.removeProperty('--ac-rgb');
    }
    renderPage(id);
    // Slide in
    requestAnimationFrame(()=>{
      c.style.opacity = '1';
      c.style.transform = 'translateX(0)';
    });
  },150);
  closeMob();
}

window.addEventListener('hashchange',()=>{const h=location.hash.replace('#/','').replace('#','');nav(h||'home',false)});

// ═══════════════════════════════
//  PAGE ROUTER
// ═══════════════════════════════
