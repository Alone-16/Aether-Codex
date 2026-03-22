// ═══════════════════════════════════════════════════════
//  AI ASSISTANT
// ═══════════════════════════════════════════════════════
const AI_KEY_STORAGE = 'ac_claude_key';
let AI_OPEN = false;
let AI_HISTORY = []; // {role, content}
let AI_TYPING = false;

function getAIKey() { return ls.str(AI_KEY_STORAGE) || null; }
function setAIKey(k) { ls.setStr(AI_KEY_STORAGE, k); }

// ── Build context for Claude ──
function buildAIContext() {
  const now = new Date();
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const today = days[now.getDay()];
  const dateStr = now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  // Compact media summary
  const watching = DATA.filter(e => e.status === 'watching').map(e => {
    const as = activeSeason(e);
    const st = entryStats(e);
    return `${e.title} (${gbyid(e.genreId).name}, ${st.cur}/${st.tot||'?'} ep${e.airingDay!=null?`, airs ${days[e.airingDay]}`:''}${e.rating?`, rated ${e.rating}`:''})`; 
  });

  const allMedia = DATA.map(e => {
    const st = entryStats(e);
    const tl = (e.timeline||[]).map(t => `${t.name||t.movieTitle||''}:${t.status||''}${t.type==='season'?`(${t.epWatched||0}/${t.eps||'?'}ep)`:'(movie)'}`).join('; ');
    return {
      id: e.id, title: e.title, genre: gbyid(e.genreId).name,
      status: e.status, watched: st.cur, total: st.tot||null,
      rating: e.rating||null, notes: e.notes||null,
      airingDay: e.airingDay!=null ? days[e.airingDay] : null,
      airingTime: e.airingTime||null,
      rewatchCount: e.rewatchCount||null,
      favorite: e.favorite||false,
      timeline: tl || null,
    };
  });

  const stats = {
    total: DATA.length,
    watching: DATA.filter(e=>e.status==='watching').length,
    completed: DATA.filter(e=>e.status==='completed').length,
    dropped: DATA.filter(e=>e.status==='dropped').length,
    planToWatch: DATA.filter(e=>e.status==='plan').length,
    avgRating: (() => { const r=DATA.filter(e=>e.rating); return r.length?(r.reduce((a,e)=>a+parseFloat(e.rating),0)/r.length).toFixed(1):'N/A'; })(),
    totalEpsWatched: DATA.reduce((a,e)=>a+entryStats(e).cur, 0),
  };

  return `You are an AI assistant for "The Aether Codex" — a personal media tracker. You are helping the user manage and explore their media data.

TODAY: ${dateStr}

USER STATS:
${JSON.stringify(stats, null, 2)}

ALL MEDIA ENTRIES (${allMedia.length} total):
${JSON.stringify(allMedia, null, 2)}

GAMES (${GDATA.length}):
${JSON.stringify(GDATA.map(g=>({id:g.id,title:g.title,platform:g.platform,status:g.status,hours:g.totalHours,rating:g.rating})), null, 2)}

BOOKS (${BDATA.length}):
${JSON.stringify(BDATA.map(b=>({id:b.id,title:b.title,author:b.author,status:b.status,rating:b.rating})), null, 2)}

MUSIC (${MDATA.filter(s=>!s.removedFromPlaylist).length} songs):
${JSON.stringify(MDATA.filter(s=>!s.removedFromPlaylist).slice(0,50).map(s=>({title:s.title,artist:s.artist,album:s.album})), null, 2)}${MDATA.length>50?`\n... and ${MDATA.length-50} more songs`:''}

INSTRUCTIONS:
- Be conversational, friendly and concise. Use short responses.
- For READ queries: answer directly from the data above.
- For ACTION requests (add/edit/delete/update): respond with a friendly confirmation message AND include a JSON block at the end of your response like this:
  <ACTION>{"type":"update_status","id":"entry_id","field":"status","value":"completed"}</ACTION>
  Valid action types: update_status, update_rating, update_episodes, update_hours, add_entry, delete_entry, update_notes
  For update_hours: {type:"update_hours", title, value} — updates totalHours for a game entry
  For add_entry include: {type:"add_entry", title, genreId, status, epTot(optional)}
  For update_episodes: {type:"update_episodes", id, epCur}
- Always confirm before destructive actions (delete).
- If data is not found, say so clearly.
- Keep responses under 150 words unless showing a list.
- Never make up data that isn't in the user's list.`;
}

// ── Send message to Claude API ──
async function sendAIMessage(userMsg) {
  const key = 'proxy'; // Key handled by Cloudflare Worker

  AI_HISTORY.push({ role: 'user', parts: [{ text: userMsg }] });
  renderAIMessages();
  setAITyping(true);

  try {
    // Inject system context as first user/model exchange (same pattern as test file)
    const withContext = [
      { role: 'user',  parts: [{ text: buildAIContext() }] },
      { role: 'model', parts: [{ text: 'Understood. I have full access to your media data and am ready to help!' }] },
      ...AI_HISTORY
    ];

    const res = await fetch(
      'https://aether-codex-ai.nadeempubgmobile2-0.workers.dev',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: withContext })
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message || `API error ${res.status}`);
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.';
    const actionMatch = reply.match(/<ACTION>([\s\S]*?)<\/ACTION>/);

    AI_HISTORY.push({ role: 'model', parts: [{ text: reply }] });
    setAITyping(false);
    renderAIMessages();

    if (actionMatch) {
      try { const action = JSON.parse(actionMatch[1]); setTimeout(() => handleAIAction(action), 300); }
      catch(e) { console.warn('AI action parse failed:', e); }
    }
  } catch(e) {
    setAITyping(false);
    AI_HISTORY.push({ role: 'model', parts: [{ text: `Sorry, something went wrong: ${e.message}` }] });
    renderAIMessages();
  }
}

// ── Handle AI actions ──
function handleAIAction(action) {
  switch(action.type) {
    case 'update_status': {
      const e = DATA.find(x => x.id === action.id || x.title.toLowerCase() === (action.title||'').toLowerCase()) ||
                DATA.find(x => x.title.toLowerCase().includes((action.title||'').toLowerCase())) ||
                DATA.find(x => (action.title||'').toLowerCase().includes(x.title.toLowerCase().split(' ').slice(0,3).join(' ')));
      if (!e) { appendAIMessage('assistant', "I couldn't find that entry in your list."); return; }
      showConfirm(`Change "${e.title}" status to "${action.value}"?`, () => {
        e.status = action.value;
        if (action.value === 'completed' && !e.endDate) e.endDate = today();
        e.updatedAt = Date.now();
        saveData(DATA);
        if (CURRENT === 'media') render();
        appendAIMessage('assistant', `✓ Done! "${e.title}" is now ${action.value}.`);
      }, { title: 'Confirm Change', okLabel: 'Yes, update', danger: false });
      break;
    }
    case 'update_rating': {
      const e = DATA.find(x => x.id === action.id || x.title.toLowerCase() === (action.title||'').toLowerCase()) ||
                DATA.find(x => x.title.toLowerCase().includes((action.title||'').toLowerCase())) ||
                DATA.find(x => (action.title||'').toLowerCase().includes(x.title.toLowerCase().split(' ').slice(0,3).join(' ')));
      if (!e) { appendAIMessage('assistant', "I couldn't find that entry."); return; }
      showConfirm(`Set rating for "${e.title}" to ${action.value}?`, () => {
        e.rating = String(action.value);
        e.updatedAt = Date.now();
        saveData(DATA);
        if (CURRENT === 'media') render();
        appendAIMessage('assistant', `✓ Rating for "${e.title}" set to ${action.value}/10.`);
      }, { title: 'Confirm Rating', okLabel: 'Yes', danger: false });
      break;
    }
    case 'update_episodes': {
      const e = DATA.find(x => x.id === action.id || x.title.toLowerCase() === (action.title||'').toLowerCase()) ||
                DATA.find(x => x.title.toLowerCase().includes((action.title||'').toLowerCase())) ||
                DATA.find(x => (action.title||'').toLowerCase().includes(x.title.toLowerCase().split(' ').slice(0,3).join(' ')));
      if (!e) { appendAIMessage('assistant', "I couldn't find that entry."); return; }
      showConfirm(`Update "${e.title}" to episode ${action.epCur}?`, () => {
        if (e.timeline?.length) {
          const as = activeSeason(e);
          if (as) { as.epWatched = String(action.epCur); }
        } else {
          e.epCur = String(action.epCur);
        }
        e.updatedAt = Date.now();
        saveData(DATA);
        if (CURRENT === 'media') render();
        appendAIMessage('assistant', `✓ "${e.title}" updated to episode ${action.epCur}.`);
      }, { title: 'Confirm Update', okLabel: 'Yes', danger: false });
      break;
    }
    case 'add_entry': {
      showConfirm(`Add "${action.title}" to your ${action.genreId||'Anime'} list as ${action.status||'Plan to Watch'}?`, () => {
        const g = GENRES.find(g => g.name.toLowerCase() === (action.genreId||'anime').toLowerCase()) || GENRES[0];
        const entry = {
          id: uid(), title: action.title, genreId: g.id,
          status: action.status || 'plan',
          epTot: action.epTot||null, epCur: null,
          rating: null, notes: null, timeline: [],
          addedAt: Date.now(), updatedAt: Date.now(),
        };
        DATA.unshift(entry);
        saveData(DATA);
        if (CURRENT === 'media') render();
        appendAIMessage('assistant', `✓ Added "${action.title}" to your list!`);
      }, { title: 'Confirm Add', okLabel: 'Add', danger: false });
      break;
    }
    case 'update_hours': {
      const g = GDATA.find(x => x.id === action.id || x.title.toLowerCase() === (action.title||'').toLowerCase()) ||
                GDATA.find(x => x.title.toLowerCase().includes((action.title||'').toLowerCase())) ||
                GDATA.find(x => (action.title||'').toLowerCase().includes(x.title.toLowerCase().split(' ').slice(0,3).join(' ')));
      if (!g) { appendAIMessage('assistant', "I couldn't find that game."); return; }
      showConfirm(`Update hours for "${g.title}" to ${action.value}h?`, () => {
        g.totalHours = parseFloat(action.value);
        g.updatedAt = Date.now();
        saveGames(GDATA);
        if (CURRENT === 'games') renderGamesBody();
        appendAIMessage('assistant', `✓ Hours for "${g.title}" updated to ${action.value}h.`);
      }, { title: 'Confirm Update', okLabel: 'Yes', danger: false });
      break;
    }
    case 'delete_entry': {
      const e = DATA.find(x => x.id === action.id || x.title.toLowerCase() === (action.title||'').toLowerCase());
      if (!e) { appendAIMessage('assistant', "I couldn't find that entry."); return; }
      showConfirm(`Delete "${e.title}" permanently?`, () => {
        DATA = DATA.filter(x => x.id !== e.id);
        saveData(DATA);
        if (CURRENT === 'media') render();
        appendAIMessage('assistant', `✓ "${e.title}" has been deleted.`);
      }, { title: 'Delete Entry?', okLabel: 'Delete' });
      break;
    }
    case 'update_notes': {
      const e = DATA.find(x => x.id === action.id || x.title.toLowerCase() === (action.title||'').toLowerCase());
      if (!e) { appendAIMessage('assistant', "I couldn't find that entry."); return; }
      e.notes = action.value; e.updatedAt = Date.now();
      saveData(DATA);
      if (CURRENT === 'media') render();
      appendAIMessage('assistant', `✓ Notes updated for "${e.title}".`);
      break;
    }
  }
}

// ── UI ──
function toggleAI() {
  AI_OPEN = !AI_OPEN;
  const panel = document.getElementById('ai-panel');
  if (!panel) return;
  const isMobile = window.innerWidth <= 640;
  if(isMobile) panel.style.right='0';
  panel.style.transform = AI_OPEN ? 'translateY(0)' : 'translateY(100%)';
  panel.style.opacity = AI_OPEN ? '1' : '0';
  if (AI_OPEN && !getAIKey()) showAIKeyPrompt();
  else if (AI_OPEN) document.getElementById('ai-input')?.focus();
}

function showAIKeyPrompt() {
  appendAIMessage('assistant', `👋 Hi! To use me, paste your **Gemini API key**.

Get one free at [aistudio.google.com](https://aistudio.google.com) → Get API Key → Create API key in new project.

Go to **Settings → AI Assistant** to paste it, or type it below:`);
  // Show key input inline
  const msgs = document.getElementById('ai-messages');
  if (!msgs) return;
  const inp = document.createElement('div');
  inp.style.cssText = 'padding:8px 12px';
  inp.innerHTML = `<div style="display:flex;gap:6px">
    <input id="ai-key-inp" type="password" placeholder="AIzaSy..." style="flex:1;background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:8px 10px;font-size:12px;color:var(--tx);outline:none">
    <button onclick="saveAIKeyFromInput()" style="background:var(--ac);color:#000;border:none;border-radius:5px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer">Save</button>
  </div>`;
  msgs.appendChild(inp);
  msgs.scrollTop = msgs.scrollHeight;
}

function saveAIKeyFromInput() {
  const val = document.getElementById('ai-key-inp')?.value?.trim();
  if (!val) { toast('Please enter an API key', 'var(--cr)'); return; }
  setAIKey(val);
  AI_HISTORY = [];
  renderAIMessages();
  toast('✓ API key saved', 'var(--cd)');
  appendAIMessage('assistant', "✓ Key saved! I'm ready. Ask me anything about your media collection — or tell me to make changes!");
}

function renderAIMessages() {
  const msgs = document.getElementById('ai-messages'); if (!msgs) return;
  if (!AI_HISTORY.length) {
    msgs.innerHTML = `<div style="padding:20px;text-align:center;color:var(--mu);font-size:13px">
      <div style="font-size:28px;margin-bottom:8px">✦</div>
      <div style="font-weight:600;color:var(--tx2);margin-bottom:4px">AI Assistant</div>
      <div>Ask me about your media, or tell me to make changes.</div>
    </div>`;
    return;
  }
  msgs.innerHTML = AI_HISTORY
    .map(m => {
      const isUser = m.role === 'user';
      const rawText = m.parts?.[0]?.text || '';
      const clean = rawText.replace(/<ACTION>[\s\S]*?<\/ACTION>/g, '').trim();
      return `<div style="display:flex;justify-content:${isUser?'flex-end':'flex-start'};padding:4px 12px">
        <div style="max-width:85%;padding:9px 13px;border-radius:${isUser?'12px 12px 3px 12px':'12px 12px 12px 3px'};background:${isUser?'var(--ac)':'var(--surf2)'};color:${isUser?'#000':'var(--tx)'};font-size:13px;line-height:1.5;border:${isUser?'none':'1px solid var(--brd)'}">
          ${clean.replace(/\n/g,'<br>').replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')}
        </div>
      </div>`;
    }).join('');
  msgs.scrollTop = msgs.scrollHeight;
}

function appendAIMessage(role, content) {
  AI_HISTORY.push({ role: role === 'assistant' ? 'model' : role, parts: [{ text: content }] });
  renderAIMessages();
}

function setAITyping(v) {
  AI_TYPING = v;
  const ind = document.getElementById('ai-typing');
  if (ind) ind.style.display = v ? 'flex' : 'none';
}

function aiSend() {
  const inp = document.getElementById('ai-input');
  const msg = inp?.value?.trim(); if (!msg || AI_TYPING) return;
  inp.value = '';
  sendAIMessage(msg);
}

function aiKeydown(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiSend(); } }
