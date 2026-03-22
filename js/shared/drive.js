let _gisReady=false, _tokenClient=null, _syncTimer=null, _driveFolderId=null;

function _getToken(){return Date.now()<parseInt(ls.str(K.DEXP)||'0')?ls.str(K.DTOKEN):null;}
function _isConnected(){return !!_getToken();}

function _updateDriveBtn(state){
  const btn=document.getElementById('drive-btn');if(!btn)return;
  const map={connected:['✓ Drive','var(--cd)'],syncing:['↻ Drive','var(--ch)'],pending:['… Drive','var(--ch)'],error:['✗ Drive','var(--cr)'],off:['☁ Drive','']};
  const[label,color]=map[state||(_isConnected()?'connected':'off')];
  btn.querySelector('span').textContent=label.split(' ')[1];
  btn.firstChild.textContent=label.split(' ')[0]+' ';
  btn.style.color=color;
  btn.title=state==='connected'?'Drive synced — click to disconnect':state==='syncing'?'Syncing...':state==='error'?'Sync error — click to retry':'Connect to Google Drive';
}

const _isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const _REDIRECT_KEY = 'ac_oauth_redirect';

// ── Mobile redirect OAuth flow ──
function _mobileOAuthRedirect() {
  // Save current section so we can restore after redirect
  localStorage.setItem(_REDIRECT_KEY, '1');
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: location.origin + location.pathname,
    response_type: 'token',
    scope: DRIVE_SCOPE,
    include_granted_scopes: 'true',
    state: location.hash || '#/',
  });
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

function _handleOAuthRedirect() {
  // Check for token in URL hash after redirect
  if (!localStorage.getItem(_REDIRECT_KEY)) return false;
  localStorage.removeItem(_REDIRECT_KEY);

  const hash = location.hash;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('access_token');
  const expiresIn = parseInt(params.get('expires_in') || '3600');

  if (token) {
    ls.setStr(K.DTOKEN, token);
    ls.setStr(K.DEXP, String(Date.now() + (expiresIn - 60) * 1000));
    // Clean up URL — remove token from hash
    history.replaceState({}, '', location.pathname + (localStorage.getItem('ac_last_section') ? '#/' + localStorage.getItem('ac_last_section') : ''));
    _updateDriveBtn('syncing');
    _driveInit();
    return true;
  }
  return false;
}

function initGIS(){
  // Handle redirect return first
  if (_handleOAuthRedirect()) return;

  if(!window.google?.accounts?.oauth2){setTimeout(initGIS,600);return;}

  // Silent token client - tries to get token without showing popup
  _tokenClient=google.accounts.oauth2.initTokenClient({
    client_id:CLIENT_ID, scope:DRIVE_SCOPE,
    prompt:'',  // empty = silent, no popup unless truly needed
    callback:resp=>{
      if(resp.error==='interaction_required'||resp.error==='user_logged_out'){
        // Silent failed - need user interaction, create a new client with prompt
        _tokenClient=google.accounts.oauth2.initTokenClient({
          client_id:CLIENT_ID, scope:DRIVE_SCOPE,
          callback:resp2=>{
            if(resp2.error){toast('Drive auth failed: '+resp2.error,'var(--cr)');_updateDriveBtn('error');return;}
            _saveToken(resp2);
          }
        });
        _tokenClient.requestAccessToken();
        return;
      }
      if(resp.error){toast('Drive auth failed: '+resp.error,'var(--cr)');_updateDriveBtn('error');return;}
      _saveToken(resp);
    }
  });

  _gisReady=true;

  if(_isConnected()){
    // Token still valid - reconnect silently, no popup
    _updateDriveBtn('syncing');
    _driveInit();
  } else if(ls.str(K.DTOKEN)){
    // Had a token before but it expired - try silent refresh
    _updateDriveBtn('syncing');
    _tokenClient.requestAccessToken();
  } else {
    _updateDriveBtn('off');
  }
}

function _saveToken(resp){
  ls.setStr(K.DTOKEN,resp.access_token);
  ls.setStr(K.DEXP,String(Date.now()+(resp.expires_in-60)*1000));
  _updateDriveBtn('syncing');
  _driveInit();
}

function _showDriveHint(){
  setTimeout(()=>{
    const el=document.getElementById('drive-hint-inner');
    if(el && DATA.length===0 && !_isConnected()) el.style.display='flex';
  }, 300);
}

function driveAction(){
  if(_isConnected()){
    showConfirm('Your data will stay in localStorage. You can reconnect anytime.',()=>{
    ls.del(K.DTOKEN);ls.del(K.DEXP);ls.del(K.DFILE);ls.del(K.DSYNC);
    _driveFolderId=null;_updateDriveBtn('off');toast('Disconnected from Drive');
  },{title:'Disconnect Drive?',okLabel:'Disconnect',danger:false});
  } else {
    // Mobile: use redirect flow — no popup issues
    if (_isMobile) {
      _mobileOAuthRedirect();
      return;
    }
    if(!_gisReady){toast('Google API loading, try again','var(--ch)');return;}
    // Desktop: use popup flow
    _tokenClient=google.accounts.oauth2.initTokenClient({
      client_id:CLIENT_ID, scope:DRIVE_SCOPE,
      callback:resp=>{
        if(resp.error){toast('Drive auth failed: '+resp.error,'var(--cr)');_updateDriveBtn('error');return;}
        _saveToken(resp);
      }
    });
    _tokenClient.requestAccessToken();
  }
}

async function _req(url,opts={}){
  const token=_getToken();if(!token)return null;
  try{
    const r=await fetch(url,{...opts,headers:{Authorization:`Bearer ${token}`,... (opts.headers||{})}});
    if(r.status===401){ls.del(K.DTOKEN);ls.del(K.DEXP);_updateDriveBtn('off');return null;}
    return r;
  }catch{return null;}
}

async function _getOrCreateFolder(){
  if(_driveFolderId)return _driveFolderId;
  const r=await _req(`https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_FOLDER}'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id)`);
  if(!r)return null;
  const d=await r.json();
  if(d.files?.length){_driveFolderId=d.files[0].id;return _driveFolderId;}
  const cr=await _req('https://www.googleapis.com/drive/v3/files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:DRIVE_FOLDER,mimeType:'application/vnd.google-apps.folder'})});
  if(!cr)return null;
  const cf=await cr.json();_driveFolderId=cf.id;return _driveFolderId;
}

async function _getOrCreateFile(){
  const cached=ls.str(K.DFILE);if(cached)return cached;
  const folderId=await _getOrCreateFolder();if(!folderId)return null;
  const r=await _req(`https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_FILE}'+and+'${folderId}'+in+parents+and+trashed=false&fields=files(id,modifiedTime)`);
  if(!r)return null;
  const d=await r.json();
  if(d.files?.length){ls.setStr(K.DFILE,d.files[0].id);return d.files[0].id;}
  const cr=await _req('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{
    method:'POST',
    headers:{'Content-Type':'multipart/related; boundary=boundary'},
    body:`--boundary\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({name:DRIVE_FILE,parents:[folderId]})}\r\n--boundary\r\nContent-Type: application/json\r\n\r\n{}\r\n--boundary--`
  });
  if(!cr)return null;
  const cf=await cr.json();ls.setStr(K.DFILE,cf.id);return cf.id;
}

async function _pushToDrive(){
  _updateDriveBtn('syncing');
  try{
    const fileId=await _getOrCreateFile();if(!fileId)throw new Error('No file');
    const payload=JSON.stringify({version:DATA_VERSION,savedAt:parseInt(ls.str(K.SAVED)||'0'),data:DATA,genres:GENRES,games:GDATA,music:MDATA,playlists:MPLAYLISTS,books:BDATA,vault:VDATA,log:LDATA});
    const r=await _req(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:payload});
    if(!r||!r.ok)throw new Error('Upload failed');
    ls.setStr(K.DSYNC,String(Date.now()));
    _updateDriveBtn('connected');
  }catch(e){_updateDriveBtn('error');toast('Drive sync failed: '+e.message,'var(--cr)');}
}

async function _pullFromDrive(){
  try{
    const fileId=await _getOrCreateFile();if(!fileId)return null;
    const r=await _req(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    if(!r||!r.ok)return null;
    return await r.json();
  }catch{return null;}
}

// Entry-level merge — newer entry per ID wins
function _mergeData(local,remote){
  const map=new Map();
  local.forEach(e=>map.set(e.id,e));
  remote.forEach(e=>{
    const l=map.get(e.id);
    if(!l||(e.updatedAt||0)>(l.updatedAt||0))map.set(e.id,e);
  });
  return Array.from(map.values()).sort((a,b)=>a.title.localeCompare(b.title));
}

async function _driveInit(){
  _updateDriveBtn('syncing');
  const remote=await _pullFromDrive();
  if(!remote){await _pushToDrive();return;}
  const localSaved=parseInt(ls.str(K.SAVED)||'0');
  const remoteSaved=remote.savedAt||0;
  if(remoteSaved>localSaved){
    // Remote has changes local doesn't — merge
    DATA=_mergeData(DATA,remote.data||[]);
    if(remote.genres){
      const gids=new Set(GENRES.map(g=>g.id));
      (remote.genres||[]).filter(g=>!gids.has(g.id)).forEach(g=>GENRES.push(g));
      saveGenres(GENRES);
    }
    if(remote.games&&Array.isArray(remote.games)){
      GDATA=_mergeData(GDATA,remote.games);
      saveGames(GDATA);
    }
    if(remote.music&&Array.isArray(remote.music)){
      MDATA=_mergeData(MDATA,remote.music);
      saveMusic(MDATA);
    }
    if(remote.playlists&&Array.isArray(remote.playlists)){
      MPLAYLISTS=remote.playlists;
      savePlaylists(MPLAYLISTS);
    }
    if(remote.books&&Array.isArray(remote.books)){
      BDATA=_mergeData(BDATA,remote.books);
      saveBooks(BDATA);
    }
    if(remote.vault&&Array.isArray(remote.vault)){
      VDATA=_mergeData(VDATA,remote.vault);
      saveVault(VDATA);
    }
    if(remote.log&&Array.isArray(remote.log)){
      LDATA=remote.log;
      saveLog(LDATA);
    }
    saveData(DATA);render();
    toast('✓ Synced from Drive','var(--cd)');
  } else if(localSaved>remoteSaved){
    await _pushToDrive();
  } else {
    _updateDriveBtn('connected');
  }
}

function scheduleDriveSync(){
  if(!_isConnected())return;
  clearTimeout(_syncTimer);
  _updateDriveBtn('pending');
  _syncTimer=setTimeout(_pushToDrive,3000);
}

// ═══════════════════════════════
//  MOBILE
// ═══════════════════════════════
function openMob(){document.getElementById('mob-ov').classList.add('show');document.getElementById('mob-sb').classList.add('open')}
function closeMob(){document.getElementById('mob-ov').classList.remove('show');document.getElementById('mob-sb').classList.remove('open')}

// ═══════════════════════════════
//  BOOTSTRAP
// ═══════════════════════════════
