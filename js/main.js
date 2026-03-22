(function bootstrap(){
  // No seed data - data loads from Drive or localStorage only
  // Show connect prompt if no data and not connected
})();

// ═══════════════════════════════
//  INIT
// ═══════════════════════════════
SETTINGS = loadSettings();
(function init(){
  document.body.style.visibility = 'visible';
  // Check if we're in public share view mode
  if (checkPublicView()) return; // Stop normal init if public view
  const h=location.hash.replace('#/','').replace('#','');
  nav(h||'home',false);
  initGIS();
  initYTAuth();
  applySettings();
  setTimeout(initNotifications, 2000);
  initKeyboardShortcuts(); // Wait for data to load
})();
