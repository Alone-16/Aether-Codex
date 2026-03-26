function renderPage(id){
  const c=document.getElementById('content');
  if(id==='media')    renderMedia(c);
  else if(id==='home')     renderHome(c);
  else if(id==='games')    renderGames(c);
  else if(id==='music')    renderMusic(c);
  else if(id==='books')    renderBooks(c);
  else if(id==='vault')    renderVault(c);
  else if(id==='log')      renderLog(c);
  else if(id==='settings') renderSettings(c);
  else renderSectionStub(id,c);
}
function render(){renderPage(CURRENT)}

// ═══════════════════════════════
//  HOME DASHBOARD
// ═══════════════════════════════
