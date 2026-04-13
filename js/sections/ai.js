// ═══════════════════════════════════════════════════════
//  AI ASSISTANT
// ═══════════════════════════════════════════════════════
const AI_KEY_STORAGE = 'ac_claude_key';
let AI_OPEN = false;
let AI_HISTORY = []; // {role, content}
let AI_TYPING = false;

function getAIKey() { return ls.str(AI_KEY_STORAGE) || null; }
function setAIKey(k) { ls.setStr(AI_KEY_STORAGE, k); }

function aiWorkerUrl() {
  const w = typeof window !== 'undefined' && window._WORKER;
  return (w && String(w).replace(/\/$/, '')) || 'https://aether-codex-ai.nadeempubgmobile2-0.workers.dev';
}

// ── Build context for Claude ──
function buildAIContext() {
  const now = new Date();
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const today = days[now.getDay()];
  const dateStr = now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  const getTopMods = (data, getVal) => {
    const counts = {};
    data.forEach(e => {
      const v = getVal(e);
      if (v) counts[v] = (counts[v]||0)+1;
    });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0]).join(', ');
  };

  const getStats = (data, getTop) => {
    if (!data || !data.length) return { total: 0, completed: 0, completionRate: '0%' };
    const comps = data.filter(e => e.status === 'completed' || e.status === 'finished').length;
    return {
      total: data.length,
      completed: comps,
      completionRate: Math.round((comps / data.length) * 100) + '%',
      topGenres: getTop ? getTop(data) : undefined
    };
  };

  const stats = {
    media: getStats(DATA, d => getTopMods(d, e => window.gbyid ? window.gbyid(e.genreId)?.name : null)),
    games: getStats(window.GDATA, d => getTopMods(d, e => e.platform)),
    books: getStats(window.BDATA),
    music: { total: (window.MDATA||[]).length, topArtists: getTopMods(window.MDATA||[], e => e.artist) }
  };

  const sortByRecent = (arr) => [...arr].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0, 30);
  const recentMedia = sortByRecent(DATA).map(e => ({id:e.id, title:e.title, status:e.status}));
  const recentGames = sortByRecent(window.GDATA||[]).map(g => ({title:g.title, status:g.status}));
  const recentBooks = sortByRecent(window.BDATA||[]).map(b => ({title:b.title, status:b.status}));

  return `You are an AI assistant for "The Aether Codex" — a personal media tracker.

TODAY: ${dateStr}

SUMMARY STATS:
${JSON.stringify(stats, null, 2)}

RECENTLY UPDATED ENTRIES (Top 30 per category):
Media: ${JSON.stringify(recentMedia)}
Games: ${JSON.stringify(recentGames)}
Books: ${JSON.stringify(recentBooks)}

INSTRUCTIONS:
- Be conversational, friendly and concise. Use short responses.
- To ANSWER about a specific entry not in the recent list, or to GET FULL DETAILS before answering, use the ACTION:
  <ACTION>{"type":"search_entry","title":"exact or partial title"}</ACTION>
  (I will immediately reply with the full details of matching entries for you to complete your answer).
- For ACTION requests (add/edit/delete/update): respond with a friendly confirmation message AND include a JSON block at the end of your response like this:
  <ACTION>{"type":"update_status","id":"entry_id","field":"status","value":"completed"}</ACTION>
  Valid action types: update_status, update_rating, update_episodes, update_hours, add_entry, delete_entry, update_notes, search_entry
  For update_hours: {type:"update_hours", title, value}
  For add_entry include: {type:"add_entry", title, genreId, status, epTot(optional)}
  For update_episodes: {type:"update_episodes", id, epCur}
- Always confirm before destructive actions (delete).
- If data is not found, say so clearly.
- Keep responses under 150 words unless showing a list.
- Never make up data that isn't in the user's list.`;
}

// ── Send message to Claude API ──
async function sendAIMessage(userMsg, isSecondPass = false) {
  const key = 'proxy'; // Key handled by Cloudflare Worker

  if (!isSecondPass) {
    AI_HISTORY.push({ role: 'user', parts: [{ text: userMsg }] });
    renderAIMessages();
    setAITyping(true);
  }

  try {
    // Inject system context as first user/model exchange
    const withContext = [
      { role: 'user',  parts: [{ text: buildAIContext() }] },
      { role: 'model', parts: [{ text: 'Understood. I have access to your summary stats and recent entries. I will search for full details when needed.' }] },
      ...AI_HISTORY.map(m => ({ role: m.role, parts: m.parts }))
    ];

    const res = await fetch(aiWorkerUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Action': 'gemini_ai'
      },
      body: JSON.stringify({ contents: withContext }),
    });

    const data = await res.json();

    if (res.status === 401 || data?.error === 'no_key') {
      setAITyping(false);
      appendAIMessage('assistant', '⚠️ AI is not available: add **GEMINI_API_KEY** (or your Worker’s secret) in Cloudflare → Workers → your worker → Variables and secrets.');
      return;
    }

    if (!res.ok) {
      setAITyping(false);
      appendAIMessage('assistant', `⚠️ AI Error: ${data.error?.message || 'API error ' + res.status}`);
      return;
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.';
    const actionMatch = reply.match(/<ACTION>([\s\S]*?)<\/ACTION>/);
    let parsedAction = null;
    if (actionMatch) {
      try { parsedAction = JSON.parse(actionMatch[1]); } catch(e) { console.warn('AI action parse failed:', e); }
    }

    // Second AI pass for specific titles
    if (parsedAction && parsedAction.type === 'search_entry') {
      AI_HISTORY.push({ role: 'model', parts: [{ text: reply }], hidden: true });
      const t = (parsedAction.title || '').toLowerCase();
      let found = [];
      DATA.forEach(e => { if(e.title.toLowerCase().includes(t)) found.push({category:'media', ...e}); });
      (window.GDATA||[]).forEach(e => { if(e.title.toLowerCase().includes(t)) found.push({category:'games', ...e}); });
      (window.BDATA||[]).forEach(e => { if(e.title.toLowerCase().includes(t)) found.push({category:'books', ...e}); });
      
      const searchRes = `SYSTEM: Search results for "${parsedAction.title}": ${found.length ? JSON.stringify(found.slice(0,5)) : 'No results found.'}. Please respond to the user based on these details.`;
      AI_HISTORY.push({ role: 'user', parts: [{ text: searchRes }], hidden: true });
      
      return sendAIMessage(null, true);
    }

    AI_HISTORY.push({ role: 'model', parts: [{ text: reply }] });
    setAITyping(false);
    renderAIMessages();

    if (parsedAction && parsedAction.type !== 'search_entry') {
      setTimeout(() => handleAIAction(parsedAction), 300);
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
      const g = window.GDATA.find(x => x.id === action.id || x.title.toLowerCase() === (action.title||'').toLowerCase()) ||
                window.GDATA.find(x => x.title.toLowerCase().includes((action.title||'').toLowerCase())) ||
                window.GDATA.find(x => (action.title||'').toLowerCase().includes(x.title.toLowerCase().split(' ').slice(0,3).join(' ')));
      if (!g) { appendAIMessage('assistant', "I couldn't find that game."); return; }
      showConfirm(`Update hours for "${g.title}" to ${action.value}h?`, () => {
        g.totalHours = parseFloat(action.value);
        g.updatedAt = Date.now();
        window.saveGames(window.GDATA);
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
  if (AI_OPEN) document.getElementById('ai-input')?.focus();
}

function showAIKeyPrompt() {
  appendAIMessage('assistant', '👋 Ask about your lists or tell me to update entries. The API key is configured on your **Cloudflare Worker**, not in the browser.');
}

function saveAIKeyFromInput() {
  toast('Configure Gemini in Cloudflare Worker secrets (Settings → AI tab).', 'var(--mu)');
}

function renderAIMessages() {
  const msgs = document.getElementById('ai-messages'); if (!msgs) return;
  const visibleHistory = AI_HISTORY.filter(m => !m.hidden);
  if (!visibleHistory.length) {
    msgs.innerHTML = `<div style="padding:20px;text-align:center;color:var(--mu);font-size:13px">
      <div style="font-size:28px;margin-bottom:8px">✦</div>
      <div style="font-weight:600;color:var(--tx2);margin-bottom:4px">AI Assistant</div>
      <div>Ask me about your media, or tell me to make changes.</div>
    </div>`;
    return;
  }
  msgs.innerHTML = visibleHistory
    .map(m => {
      const isUser = m.role === 'user';
      const rawText = m.parts?.[0]?.text || '';
      const clean = rawText.replace(/<ACTION>[\s\S]*?<\/ACTION>/g, '').trim();
      const escaped = window.esc ? esc(clean) : clean.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<div style="display:flex;justify-content:${isUser?'flex-end':'flex-start'};padding:4px 12px">
        <div style="max-width:85%;padding:9px 13px;border-radius:${isUser?'12px 12px 3px 12px':'12px 12px 12px 3px'};background:${isUser?'var(--ac)':'var(--surf2)'};color:${isUser?'#000':'var(--tx)'};font-size:13px;line-height:1.5;border:${isUser?'none':'1px solid var(--brd)'}">
          ${escaped.replace(/\n/g,'<br>').replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')}
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

// ── Register all AI functions as globals ─────────────────────────────────
Object.assign(window, {
  getAIKey, setAIKey,
  buildAIContext, sendAIMessage, handleAIAction,
  toggleAI, showAIKeyPrompt, saveAIKeyFromInput,
  renderAIMessages, appendAIMessage, setAITyping,
  aiSend, aiKeydown,
  AI_HISTORY, AI_OPEN, AI_TYPING,
});
