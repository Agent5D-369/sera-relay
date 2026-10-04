'use strict';
const { installReviewUI } = require('./review-ui.cjs');
function installPageInline() {
  if (window.VoiceTranscriber) return;
  const recordClick = async event => {
    const a = event.target.closest('a');
    if (!a || !a.closest('.voice-transcriber,.voice-review') || !/^https:\/\/(www\.)?notion\.so\//.test(a.href)) return;
    event.preventDefault(); event.stopPropagation();
    try { if (await window.onOpenRecord?.(a.href)) return; } catch {}
    const old = a.textContent; a.textContent = 'Focus your signed-in Chrome or Edge window, then retry';
    setTimeout(() => { if (a.isConnected) a.textContent = old; }, 5000);
  };
  document.addEventListener('click', recordClick, true);
  const states = new Map();
  const panels = new Map();
  const requested = new Set();
  function openReview(id) { window.VoiceReview.open(id, states.get(id)); }
  const style = document.createElement('style');
  style.textContent = `
  .voice-transcriber,.voice-tools{--vt-bg:#202c33;--vt-ink:#e9edef;--vt-muted:#b9c6cd;--vt-accent:#63dec6;--vt-action:#006b56;--vt-line:#71858f;--vt-font:system-ui,sans-serif;color:var(--vt-ink);font:14px/1.5 var(--vt-font)}
  .voice-transcriber{box-sizing:border-box;max-width:560px;margin:8px 12px 12px;padding:12px 14px;border:1px solid var(--vt-line);border-radius:10px;background:var(--incoming-background,var(--vt-bg));white-space:normal;overflow-wrap:anywhere}
  .voice-transcriber{--vt-attention:#ffd18a;--vt-ready:#9bc7ff}.voice-transcriber[data-state=saved]{border-left:4px solid var(--vt-accent)}.voice-transcriber[data-state=transcribed]{border-left:4px solid var(--vt-ready)}.voice-transcriber[data-state=attention]{border-left:4px solid var(--vt-attention)}.voice-transcriber[data-state=attention] .vt-heading{color:var(--vt-attention)}.voice-transcriber[data-state=transcribed] .vt-heading{color:var(--vt-ready)}
  .voice-transcriber button,.voice-tools button{font:600 13px var(--vt-font);border:1px solid var(--vt-line);border-radius:7px;background:transparent;color:var(--vt-ink);padding:8px 10px;min-height:38px;cursor:pointer;white-space:nowrap;margin:0 6px 6px 0}
  .voice-transcriber button:hover,.voice-tools button:hover{border-color:var(--vt-accent)}.voice-transcriber button:focus-visible,.voice-tools button:focus-visible,.voice-transcriber summary:focus-visible{outline:2px solid var(--vt-accent);outline-offset:3px}.voice-transcriber button:active{transform:translateY(1px)}.voice-transcriber button:disabled{opacity:.6;cursor:default}.voice-transcriber .vt-primary{background:var(--vt-action);border-color:var(--vt-action)}
  .voice-transcriber p{margin:8px 0 12px;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}.voice-transcriber small{display:block;margin:6px 0;color:var(--vt-muted)}.voice-transcriber a{color:var(--vt-accent);display:inline-block;margin:8px 12px 0 0}.voice-transcriber summary{cursor:pointer;padding:6px 0;font-weight:600}.voice-transcriber .vt-heading{font-size:12px;font-weight:600;letter-spacing:.02em;margin:0 0 10px;color:var(--vt-accent)}
  .voice-tools{position:fixed;right:16px;bottom:16px;z-index:1000;max-width:calc(100% - 32px);background:var(--vt-bg);border:1px solid var(--vt-line);border-radius:10px;padding:8px 12px}.voice-tools.vt-sidebar{position:static;flex:none;margin:8px 12px;max-width:100%;z-index:auto}.voice-tools summary{cursor:pointer;font-weight:600;white-space:nowrap}.voice-tools p{max-width:260px;margin:10px 0}.voice-tools button{margin-bottom:0}.voice-transcriber[aria-busy=true] .vt-heading{color:var(--vt-muted)}
  @media(max-width:560px){.voice-transcriber{margin:6px 0;max-width:100%;padding:10px}.voice-tools{right:8px;bottom:8px}}
  @media(prefers-reduced-motion:reduce){.voice-transcriber button:active{transform:none}}
  `;
  document.head.appendChild(style);
  const tools = document.createElement('details'); tools.className = 'voice-tools';
  const toolsTitle = document.createElement('summary'); toolsTitle.textContent = 'Voice notes + Sera';
  const help = document.createElement('p'); help.textContent = 'Open a chat with a received voice note. Use its Transcribe button, then Review and publish to save the text and assign follow-ups.';
  const settings = document.createElement('button'); settings.type = 'button'; settings.textContent = 'Sera settings'; settings.onclick = () => { tools.open = false; void window.onSeraConnect(); };
  tools.append(toolsTitle,help,settings); document.body.append(tools);
  function render(id, panel) {
    const state = states.get(id) || {};
    panel.replaceChildren();
    const saved = !!state.memory?.draft?.verified || (state.memory?.status === 'done' && state.memory?.url && state.memory?.content_state === 'complete');
    const attention = state.status === 'failed' || ['uncertain','review_error'].includes(state.memory?.status) || (!!state.memory?.url && !saved);
    panel.dataset.state = attention ? 'attention' : saved ? 'saved' : state.status === 'done' ? 'transcribed' : 'pending';
    panel.setAttribute('aria-busy', String(!!state.busy || ['downloading','queued','processing'].includes(state.status)));
    const heading = document.createElement('div'); heading.className = 'vt-heading'; heading.textContent = attention ? (state.memory?.url ? 'Saved · Needs attention' : 'Needs attention') : saved ? 'Saved to Living Memory' : state.status === 'done' ? 'Transcribed · Not saved yet' : 'Voice note to text'; panel.appendChild(heading);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = state.status === 'done' ? 'Copy transcript' : state.status === 'failed' ? 'Retry transcription' : ({ downloading: 'Downloading...', queued: 'Queued...', processing: 'Transcribing...' }[state.status] || 'Transcribe');
    button.disabled = ['downloading', 'queued', 'processing'].includes(state.status);
    button.addEventListener('click', async event => {
      event.stopPropagation();
      try {
        if (state.status === 'done') {
          await navigator.clipboard.writeText(state.memory?.draft?.verified ? state.memory.draft.transcript : state.transcript);
          button.textContent = 'Copied';
          setTimeout(() => { if (button.isConnected) button.textContent = 'Copy transcript'; }, 1500);
        } else {
          states.set(id, { status: 'downloading' }); render(id, panel);
          await window.onVoiceTranscribe(id);
        }
      } catch {
        if (state.status === 'done') button.textContent = 'Copy unavailable';
        else { states.set(id, { status: 'failed', error: 'Could not complete the request. Try again.' }); render(id, panel); }
      }
    });
    panel.appendChild(button);
    if (state.status === 'done') {
      const text = document.createElement('p'); text.textContent = state.memory?.draft?.verified ? state.memory.draft.transcript : state.transcript;
      if (text.textContent.length > 500) { const disclosure = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Read transcript'; disclosure.append(summary,text); panel.appendChild(disclosure); } else panel.appendChild(text);
      const memory = state.memory || { status: 'disconnected' };
      const send = document.createElement('button'); send.type = 'button';
      send.style.marginTop = '8px'; send.style.marginRight = '8px';
      send.textContent = ({ disconnected: 'Connect Sera', saved: 'Ask Sera', saving: 'Saving to Living Memory...', advising: 'Asking Sera...', done: 'Saved to Living Memory', uncertain: 'Check Living Memory' })[memory.status] || 'Send to Sera';
      send.disabled = !!state.busy;
      if (memory.status !== 'disconnected') send.textContent = memory.draft?.verified ? 'View memory & tasks' : 'Review and publish';
      if (memory.content_state === 'source_only' && memory.advice && memory.url) { send.textContent = 'Save Sera breakdown'; send.disabled = false; }
      if (memory.content_state === 'analysis_saving') { send.textContent = 'Saving Sera breakdown...'; send.disabled = true; }
      if (memory.content_state === 'analysis_uncertain') { send.textContent = 'Review and verify'; send.disabled = !!state.busy; }
      send.addEventListener('click', async event => {
        event.stopPropagation(); send.disabled = true;
        if (memory.status !== 'disconnected') send.textContent = 'Preparing Sera breakdown...';
        try {
          if (memory.status === 'disconnected') await window.onSeraConnect();
          else openReview(id);
        } catch { send.disabled = false; }
        send.disabled = false;
      });
      send.className = 'vt-primary'; panel.appendChild(send);
      const note = document.createElement('small');
      note.textContent = memory.error || (memory.status === 'ready' ? 'Sends this transcript and its source details to Amora Living Memory.' : '');
      panel.appendChild(note);
      if (memory.url && /^https:\/\/(www\.)?notion\.so\//.test(memory.url)) {
        const link = document.createElement('a'); link.href = memory.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = 'Open saved memory'; link.style.color = 'var(--vt-accent)'; panel.appendChild(link);
      }
      if (memory.analysis_url && memory.analysis_url !== memory.url && /^https:\/\/(www\.)?notion\.so\//.test(memory.analysis_url)) {
        const link = document.createElement('a'); link.href = memory.analysis_url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = 'Open saved breakdown'; link.style.color = 'var(--vt-accent)'; link.style.marginLeft = '10px'; panel.appendChild(link);
      }
      if (memory.draft?.verified) {
        const response = document.createElement('div'); response.className = 'vt-sera-response';
        const title = document.createElement('strong'); title.textContent = "Sera's response";
        const message = document.createElement('p'); message.textContent = memory.draft.tasks?.length ? 'Your memory is saved and your shared tasks are created.' : 'Your memory is saved.';
        response.append(title, message);
        const records = [{title: 'Open memory: ' + memory.draft.title, url: memory.draft.url}, ...(memory.draft.tasks || []).map(t => ({title: 'Open task: ' + t.title, url: t.url}))];
        for (const record of records) {
          if (!/^https:\/\/(www\.)?notion\.so\/[a-zA-Z0-9\-/]+$/.test(record.url || '')) continue;
          const a = document.createElement('a'); a.textContent = record.title; a.href = record.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.display = 'block'; a.style.color = 'var(--vt-accent)'; response.append(a);
        }
        panel.append(response);
      }
      if (memory.advice) {
        const advice = document.createElement('p'); advice.textContent = memory.advice; const d = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Sera’s breakdown'; d.append(summary,advice); panel.appendChild(d);
      }
    } else if (state.status) {
      const note = document.createElement('small');
      note.textContent = { downloading: 'Downloading voice note…', queued: 'Waiting for local transcription…', processing: 'Transcribing on this computer…', failed: state.error || 'Transcription failed. Try again.' }[state.status] || '';
      panel.appendChild(note);
    }
  }
  function scan() {
    const sidebar = document.querySelector('#side');
    if (sidebar && tools.parentElement !== sidebar) { tools.classList.add('vt-sidebar'); sidebar.insertBefore(tools, sidebar.querySelector('#pane-side')); }
    const lookup = [];
    for (const bubble of document.querySelectorAll('[data-id]')) {
      const domId = bubble.getAttribute('data-id');
      if (!domId) continue;
      const existing = bubble.querySelector('.voice-transcriber');
      const store = window.require('WAWebCollections').Msg;
      const msg = store.get(domId) || store.getModelsArray().find(msg => msg.id?.id === domId);
      if (!msg || msg.type !== 'ptt' || msg.isStatusV3) { existing?.remove(); continue; }
      const id = window.WWebJS?.getMessageModel(msg)?.id?._serialized || domId;
      if (existing?.dataset.voiceMessage === id) continue;
      existing?.remove();
      const panel = document.createElement('div'); panel.className = 'voice-transcriber';
      panel.dataset.voiceMessage = id;
      panel.setAttribute('aria-label', 'Local voice note transcription');
      panel.addEventListener('click', event => event.stopPropagation());
      bubble.appendChild(panel); panels.set(id, panel); render(id, panel);
      if (!requested.has(id)) { requested.add(id); lookup.push(id); }
    }
    for (const [id, panel] of panels) if (!panel.isConnected) panels.delete(id);
    if (lookup.length) void window.onVoiceLookup(lookup).catch(() => {});
  }
  window.VoiceTranscriber = { update(entries) {
    for (const entry of entries) {
      const previous = states.get(entry.id);
      states.set(entry.id, entry);
      if (panels.has(entry.id) && JSON.stringify(previous) !== JSON.stringify(entry)) render(entry.id, panels.get(entry.id));
    }
    window.VoiceReview.update(entries);
  }, scan, dispose() { document.removeEventListener('click', recordClick, true); observer.disconnect(); clearTimeout(timer); for (const panel of panels.values()) panel.remove(); style.remove(); tools.remove(); window.VoiceReview?.dispose(); delete window.VoiceTranscriber; } };
  let timer;
  const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(scan, 150); });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-id'] });
  scan();
}
async function installInline(client, emit, openExternal) {
  if (openExternal && !await client.pupPage.evaluate(() => typeof window.onOpenRecord === 'function')) await client.pupPage.exposeFunction('onOpenRecord', openExternal);
  if (!await client.pupPage.evaluate(() => typeof window.onSeraAction === 'function')) await client.pupPage.exposeFunction('onSeraAction', (id, action, values) => {
    if (typeof id === 'string' && id.length <= 1024 && ['prepare', 'publish', 'verify', 'tasks'].includes(action) && values && typeof values === 'object' && JSON.stringify(values).length <= 120000) emit({ type: 'sera_action', id, action, values });
  });
  if (!await client.pupPage.evaluate(() => typeof window.onSeraConnect === 'function')) await client.pupPage.exposeFunction('onSeraConnect', () => emit({ type: 'sera_connect' }));
  if (!await client.pupPage.evaluate(() => typeof window.onSeraSend === 'function')) await client.pupPage.exposeFunction('onSeraSend', id => {
    if (typeof id === 'string' && id.length <= 1024) emit({ type: 'sera_send', id });
  });
  if (!await client.pupPage.evaluate(() => typeof window.onVoiceTranscribe === 'function')) await client.pupPage.exposeFunction('onVoiceTranscribe', id => {
    if (typeof id === 'string' && id.length <= 1024) emit({ type: 'inline_request', id });
  });
  if (!await client.pupPage.evaluate(() => typeof window.onVoiceLookup === 'function')) await client.pupPage.exposeFunction('onVoiceLookup', ids => {
    if (Array.isArray(ids)) emit({ type: 'inline_lookup', ids: ids.filter(id => typeof id === 'string' && id.length <= 1024).slice(0, 200) });
  });
  await client.pupPage.evaluate(installReviewUI);
  await client.pupPage.evaluate(installPageInline);
}
module.exports = { installInline, installPageInline };
