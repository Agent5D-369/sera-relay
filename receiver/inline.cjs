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
  function openReview(id, retry = false) { window.VoiceReview.open(id, states.get(id), retry); }
  const style = document.createElement('style');
  style.textContent = `
  .voice-transcriber,.voice-tools,.vt-select,.vt-text-mark{--vt-bg:#202c33;--vt-ink:#e9edef;--vt-muted:#b9c6cd;--vt-accent:#63dec6;--vt-action:#006b56;--vt-line:#71858f;--vt-font:system-ui,sans-serif;color:var(--vt-ink);font:14px/1.5 var(--vt-font)}
  .voice-transcriber{box-sizing:border-box;max-width:560px;margin:8px 12px 12px;padding:12px 14px;border:1px solid var(--vt-line);border-radius:10px;background:var(--incoming-background,var(--vt-bg));white-space:normal;overflow-wrap:anywhere}
  .voice-transcriber{--vt-attention:#ff8a80;--vt-reviewed:#c9a7ff;--vt-ready:#ffd54f;--vt-saved:#5ee08a}.voice-transcriber[data-state=pending]{border-left:4px dashed var(--vt-ready)}.voice-transcriber[data-state=pending] .vt-heading{color:var(--vt-ready)}.voice-transcriber[data-state=transcribed]{border-left:4px solid var(--vt-ready);background:linear-gradient(rgba(255,213,79,.07),rgba(255,213,79,.07)),var(--incoming-background,var(--vt-bg))}.voice-transcriber[data-state=transcribed] .vt-heading{color:var(--vt-ready)}.voice-transcriber[data-state=reviewed]{border-left:4px solid var(--vt-reviewed);background:linear-gradient(rgba(201,167,255,.08),rgba(201,167,255,.08)),var(--incoming-background,var(--vt-bg))}.voice-transcriber[data-state=reviewed] .vt-heading{color:var(--vt-reviewed)}.voice-transcriber[data-state=saved]{border-left:4px solid var(--vt-saved);background:linear-gradient(rgba(94,224,138,.07),rgba(94,224,138,.07)),var(--incoming-background,var(--vt-bg))}.voice-transcriber[data-state=saved] .vt-heading{color:var(--vt-saved)}.voice-transcriber[data-state=attention]{border-left:4px solid var(--vt-attention);background:linear-gradient(rgba(255,138,128,.08),rgba(255,138,128,.08)),var(--incoming-background,var(--vt-bg))}.voice-transcriber[data-state=attention] .vt-heading{color:var(--vt-attention)}.voice-transcriber .vt-hide{margin:0 0 8px}
  .voice-transcriber button,.voice-tools button,.vt-select button{font:600 13px var(--vt-font);border:1px solid var(--vt-line);border-radius:7px;background:transparent;color:var(--vt-ink);padding:8px 10px;min-height:38px;cursor:pointer;white-space:nowrap;margin:0 6px 6px 0}
  .voice-transcriber button:hover,.voice-tools button:hover,.vt-select button:hover{border-color:var(--vt-accent)}.voice-transcriber button:focus-visible,.voice-tools button:focus-visible,.vt-select button:focus-visible,.voice-transcriber summary:focus-visible{outline:2px solid var(--vt-accent);outline-offset:3px}.voice-transcriber button:active{transform:translateY(1px)}.voice-transcriber button:disabled,.vt-select button:disabled,.voice-tools button:disabled{opacity:.6;cursor:default}.voice-transcriber .vt-primary,.vt-select .vt-primary{background:var(--vt-action);border-color:var(--vt-action)}
  .voice-transcriber p{margin:8px 0 12px;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}.voice-transcriber small{display:block;margin:6px 0;color:var(--vt-muted)}.voice-transcriber a{color:var(--vt-accent);display:inline-block;margin:8px 12px 0 0}.voice-transcriber summary{cursor:pointer;padding:6px 0;font-weight:600}.voice-transcriber .vt-heading{font-size:12px;font-weight:600;letter-spacing:.02em;margin:0 0 10px;color:var(--vt-accent)}
  .vt-rail{position:fixed;z-index:900;width:24px;display:flex;flex-direction:column;align-items:center;gap:4px;font:600 11px/1 system-ui,sans-serif;color:#e9edef}.vt-rail[hidden]{display:none}.vt-rail-track{position:relative;flex:1;width:14px;border-radius:7px;background:rgba(233,237,239,.08)}.vt-rail-band{position:absolute;left:-2px;right:-2px;min-height:6px;border-radius:5px;background:rgba(233,237,239,.16);pointer-events:none}.vt-rail-dot{position:absolute;left:1px;width:12px;height:7px;margin-top:-3px;padding:0;border:2px solid #ffd54f;border-radius:4px;cursor:pointer;background:transparent;box-sizing:border-box}.vt-rail-dot[data-state=transcribed]{background:#ffd54f;border-color:#ffd54f}.vt-rail-dot[data-state=reviewed]{background:#c9a7ff;border-color:#c9a7ff}.vt-rail-dot[data-state=saved]{background:#5ee08a;border-color:#5ee08a}.vt-rail-dot[data-state=attention]{background:#ff8a80;border-color:#ff8a80}.vt-rail-dot:hover,.vt-rail-dot:focus-visible{outline:2px solid #e9edef;outline-offset:1px}.vt-rail button.vt-rail-step{width:24px;height:22px;padding:0;border:1px solid #71858f;border-radius:6px;background:#202c33;color:#e9edef;font:inherit;cursor:pointer}.vt-rail button.vt-rail-step:disabled{opacity:.45;cursor:default}.vt-rail-count{padding:3px 4px;border-radius:6px;background:#202c33}
  .voice-tools{position:fixed;right:16px;bottom:16px;z-index:1000;max-width:calc(100% - 32px);background:var(--vt-bg);border:1px solid var(--vt-line);border-radius:10px;padding:8px 12px}.voice-tools.vt-sidebar{position:static;flex:none;margin:8px 12px;max-width:100%;z-index:auto}.voice-tools summary{cursor:pointer;font-weight:600;white-space:nowrap}.voice-tools p{max-width:260px;margin:10px 0}.voice-tools button{margin-bottom:0}.voice-transcriber[aria-busy=true] .vt-heading{color:var(--vt-muted)}
  .vt-select{position:fixed;z-index:950;transform:translate(-50%,-100%);width:max-content;box-sizing:border-box;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;max-width:min(640px,calc(100vw - 16px));padding:8px 10px;border:1px solid var(--vt-line);border-radius:10px;background:var(--vt-bg);box-shadow:0 2px 10px rgba(0,0,0,.35)}.vt-select[hidden],.vt-select [hidden]{display:none}.vt-select button{margin:0}.vt-select small{flex-basis:100%;text-align:center;color:var(--vt-muted)}.vt-select small:empty{display:none}.vt-select .vt-count{font-weight:600}
  [data-vt-text].vt-pickable{cursor:pointer;box-shadow:inset 4px 0 rgba(233,237,239,.28)}[data-vt-text].vt-picked{background:rgba(99,222,198,.16);box-shadow:inset 4px 0 #63dec6}
  .vt-text-mark{display:block;margin:2px 12px 6px auto;padding:3px 8px;min-height:0;border:1px solid var(--vt-line);border-radius:12px;background:var(--vt-bg);color:var(--vt-ink);font:600 12px var(--vt-font);cursor:pointer}.vt-text-mark[data-state=transcribed]{border-color:#ffd54f}.vt-text-mark[data-state=reviewed]{border-color:#c9a7ff}.vt-text-mark[data-state=saved]{border-color:#5ee08a;color:#5ee08a}.vt-text-mark[data-state=attention]{border-color:#ff8a80;color:#ff8a80}.vt-text-mark:focus-visible{outline:2px solid var(--vt-accent);outline-offset:2px}
  .voice-tools .vt-inbox{border-top:1px solid var(--vt-line);margin-top:10px;padding-top:4px}.voice-tools .vt-inbox button{margin:0 6px 6px 0}.voice-tools .vt-inbox small{display:block;max-width:260px;color:var(--vt-muted)}
  @media(max-width:560px){.voice-transcriber{margin:6px 0;max-width:100%;padding:10px}.voice-tools{right:8px;bottom:8px}}
  @media(prefers-reduced-motion:reduce){.voice-transcriber button:active{transform:none}}
  `;
  document.head.appendChild(style);
  const tools = document.createElement('details'); tools.className = 'voice-tools';
  const toolsTitle = document.createElement('summary'); toolsTitle.textContent = 'Voice notes + Sera';
  const help = document.createElement('p'); help.textContent = 'Voice notes: use the Transcribe button under the note. Written messages: open a chat, choose Select messages for Sera, pick the messages, then Review with Sera.';
  const settings = document.createElement('button'); settings.type = 'button'; settings.textContent = 'Sera settings'; settings.onclick = () => { tools.open = false; void window.onSeraConnect(); };
  const inboxBox = document.createElement('div'); inboxBox.className = 'vt-inbox';
  tools.append(toolsTitle,help,settings,inboxBox); document.body.append(tools);
  const disclosures = new Map();
  function kindOf(state = {}) {
    const saved = !!state.memory?.draft?.verified || (state.memory?.status === 'done' && state.memory?.url && state.memory?.content_state === 'complete');
    const attention = state.status === 'failed' || ['uncertain','review_error'].includes(state.memory?.status) || (!!state.memory?.url && !saved);
    return attention ? 'attention' : saved ? 'saved' : state.reviewed && state.status === 'done' ? 'reviewed' : state.status === 'done' ? 'transcribed' : 'pending';
  }
  function render(id, panel) {
    const keyOf = d => id + '|' + (d.dataset.key || d.querySelector('summary')?.textContent || '');
    for (const d of panel.querySelectorAll('details')) disclosures.set(keyOf(d), d.open);
    paint(id, panel);
    for (const d of panel.querySelectorAll('details')) {
      const key = keyOf(d);
      if (disclosures.has(key)) d.open = disclosures.get(key);
    }
  }
  function paint(id, panel) {
    const state = states.get(id) || {};
    panel.replaceChildren();
    const saved = !!state.memory?.draft?.verified || (state.memory?.status === 'done' && state.memory?.url && state.memory?.content_state === 'complete');
    const attention = state.status === 'failed' || ['uncertain','review_error'].includes(state.memory?.status) || (!!state.memory?.url && !saved);
    const reviewed = !!state.reviewed && state.status === 'done' && !saved && !attention;
    panel.dataset.state = kindOf(state);
    panel.setAttribute('aria-busy', String(!!state.busy || ['downloading','queued','processing'].includes(state.status)));
    const heading = document.createElement('div'); heading.className = 'vt-heading'; heading.textContent = attention ? (state.memory?.url ? 'Saved \u00b7 Needs attention' : 'Needs attention') : saved ? '\u2713 Saved to Living Memory' : reviewed ? '\u2713 Reviewed \u00b7 Not saved' : state.status === 'done' ? 'To review \u00b7 Transcribed' : 'Not transcribed yet'; panel.appendChild(heading);
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
      if (text.textContent.length > 500) {
        const disclosure = document.createElement('details'), summary = document.createElement('summary'), hide = document.createElement('button');
        disclosure.dataset.key = 'transcript'; summary.textContent = 'Read transcript';
        hide.type = 'button'; hide.className = 'vt-hide'; hide.textContent = 'Hide transcript';
        hide.addEventListener('click', event => { event.stopPropagation(); disclosure.open = false; summary.scrollIntoView({ block: 'nearest' }); });
        disclosure.addEventListener('toggle', () => { summary.textContent = disclosure.open ? 'Hide transcript' : 'Read transcript'; });
        if (disclosures.get(id + '|transcript')) summary.textContent = 'Hide transcript';
        disclosure.append(summary, text, hide); panel.appendChild(disclosure);
      } else panel.appendChild(text);
      const memory = state.memory || { status: 'disconnected' };
      const send = document.createElement('button'); send.type = 'button';
      send.style.marginTop = '8px'; send.style.marginRight = '8px';
      send.textContent = ({ disconnected: 'Connect Sera', saved: 'Ask Sera', saving: 'Saving to Living Memory...', advising: 'Asking Sera...', done: 'Saved to Living Memory', uncertain: 'Check Living Memory' })[memory.status] || 'Send to Sera';
      send.disabled = !!state.busy;
      if (memory.status !== 'disconnected') send.textContent = memory.draft?.verified ? 'View memory & tasks' : memory.status === 'review_error' ? 'Retry Sera review' : memory.status === 'uncertain' ? 'Check saved record' : 'Review and publish';
      if (memory.content_state === 'source_only' && memory.advice && memory.url) { send.textContent = 'Save Sera breakdown'; send.disabled = false; }
      if (memory.content_state === 'analysis_saving') { send.textContent = 'Saving Sera breakdown...'; send.disabled = true; }
      if (memory.content_state === 'analysis_uncertain') { send.textContent = 'Review and verify'; send.disabled = !!state.busy; }
      if (state.busy && memory.status !== 'disconnected' && memory.content_state !== 'analysis_saving') { send.textContent = 'Sera is working \u00b7 View progress'; send.disabled = false; }
      send.addEventListener('click', async event => {
        event.stopPropagation(); send.disabled = true;
        try {
          if (memory.status === 'disconnected') await window.onSeraConnect();
          else openReview(id, ['review_error','uncertain'].includes(memory.status));
        } catch { send.disabled = false; }
        send.disabled = false;
      });
      send.className = 'vt-primary'; panel.appendChild(send);
      if (!saved) {
        const mark = document.createElement('button'); mark.type = 'button'; mark.style.marginTop = '8px';
        mark.textContent = state.reviewed ? 'Unmark reviewed' : 'Mark reviewed';
        mark.title = 'Only on this computer. Nothing is sent to Sera.';
        mark.addEventListener('click', async event => {
          event.stopPropagation(); mark.disabled = true;
          states.set(id, { ...state, reviewed: !state.reviewed }); render(id, panel);
          try { await window.onVoiceReviewed(id, !state.reviewed); } catch { states.set(id, state); render(id, panel); }
        });
        panel.appendChild(mark);
      }
      const note = document.createElement('small');
      note.textContent = memory.error || (memory.status === 'ready' ? 'Sends this transcript and its source details to your Sera workspace.' : '');
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
        const advice = document.createElement('p'); advice.textContent = memory.advice; const d = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = "Sera's breakdown"; d.append(summary,advice); panel.appendChild(d);
      }
    } else if (state.status) {
      const note = document.createElement('small');
      note.textContent = { downloading: 'Downloading voice note...', queued: 'Waiting for local transcription...', processing: 'Transcribing on this computer...', failed: state.error || 'Transcription failed. Try again.' }[state.status] || '';
      panel.appendChild(note);
    }
  }
  function scan() {
    const sidebar = document.querySelector('#side');
    if (sidebar && tools.parentElement !== sidebar) { tools.classList.add('vt-sidebar'); sidebar.insertBefore(tools, sidebar.querySelector('#pane-side')); }
    const lookup = [], textLookup = [];
    for (const bubble of document.querySelectorAll('[data-id]')) {
      const domId = bubble.getAttribute('data-id');
      if (!domId) continue;
      const existing = bubble.querySelector('.voice-transcriber');
      const store = window.require('WAWebCollections').Msg;
      const msg = store.get(domId) || store.getModelsArray().find(msg => msg.id?.id === domId);
      if (msg && writable(msg)) decorateText(bubble, msg, textLookup);
      else if (bubble.dataset.vtText) clearText(bubble);
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
    if (textLookup.length && window.onTextLookup) void window.onTextLookup(textLookup.slice(0, 500)).catch(() => {});
    scheduleRail();
  }

  // Voice-note rail: one colored dot per voice note in the open chat, in chat order.
  // Positions come from WhatsApp's message store, so notes outside the rendered window still appear.
  const rail = document.createElement('nav'); rail.className = 'vt-rail'; rail.hidden = true; rail.setAttribute('aria-label', 'Voice notes in this chat');
  const railCount = document.createElement('span'); railCount.className = 'vt-rail-count';
  const railOlder = document.createElement('button'); railOlder.type = 'button'; railOlder.className = 'vt-rail-step'; railOlder.textContent = '\u22ef'; railOlder.title = 'Load older messages to find more voice notes';
  const railPrev = document.createElement('button'); railPrev.type = 'button'; railPrev.className = 'vt-rail-step'; railPrev.textContent = '\u25b2'; railPrev.title = 'Previous voice note';
  const railTrack = document.createElement('div'); railTrack.className = 'vt-rail-track';
  const railBand = document.createElement('div'); railBand.className = 'vt-rail-band';
  const railNext = document.createElement('button'); railNext.type = 'button'; railNext.className = 'vt-rail-step'; railNext.textContent = '\u25bc'; railNext.title = 'Next voice note';
  rail.append(railCount, railOlder, railPrev, railTrack, railNext); document.body.append(rail);
  const railLabels = { pending: 'Not transcribed yet', transcribed: 'To review', reviewed: 'Reviewed, not saved', saved: 'Saved to Living Memory', attention: 'Needs attention' };
  let railChat = null, railNotes = [], railSpan = 1, railScroller = null, railFrame = 0;
  function activeChat() { try { return window.require('WAWebCollections').Chat.getModelsArray().find(c => c.active) || null; } catch { return null; } }
  function jumpTo(msg) {
    try {
      const context = window.require('WAWebChatMessageSearch').getSearchContext({ chat: railChat, msgKey: msg.id });
      window.require('WAWebCmd').Cmd.openChatAt({ chat: railChat, msgContext: context });
    } catch { /* WhatsApp internals changed; the rail stays informational. */ }
  }
  function visibleRange() {
    if (!railScroller) return null;
    const view = railScroller.getBoundingClientRect(), index = new Map(railChat.msgs.getModelsArray().map((m, i) => [m.id.id, i]));
    let low = Infinity, high = -Infinity;
    for (const bubble of railScroller.querySelectorAll('[data-id]')) {
      const box = bubble.getBoundingClientRect();
      if (box.bottom < view.top || box.top > view.bottom) continue;
      const i = index.get(bubble.getAttribute('data-id')); if (i === undefined) continue;
      low = Math.min(low, i); high = Math.max(high, i);
    }
    return low === Infinity ? null : { low, high };
  }
  function drawBand() {
    const range = railChat && visibleRange();
    railBand.hidden = !range;
    if (range) { railBand.style.top = (range.low / railSpan * 100) + '%'; railBand.style.height = Math.max((range.high - range.low) / railSpan * 100, 1) + '%'; }
    railPrev.disabled = !railNotes.some(n => !range || n.index < range.low);
    railNext.disabled = !railNotes.some(n => !range || n.index > range.high);
  }
  function drawRail() {
    railFrame = 0;
    const scroller = document.querySelector('[data-testid="conversation-panel-messages"]'), chat = activeChat();
    if (scroller !== railScroller) { railScroller?.removeEventListener('scroll', scheduleBand); scroller?.addEventListener('scroll', scheduleBand, { passive: true }); railScroller = scroller; }
    railChat = chat;
    placeBar(scroller, chat);
    if (!scroller || !chat) { rail.hidden = true; return; }
    const all = chat.msgs.getModelsArray();
    railSpan = Math.max(all.length - 1, 1);
    railNotes = [];
    all.forEach((m, index) => { if (m.type === 'ptt' && !m.isStatusV3) railNotes.push({ msg: m, index, id: m.id.toString() }); });
    const noEarlier = !!chat.msgs.msgLoadState?.noEarlierMsgs;
    rail.hidden = !railNotes.length && noEarlier;
    if (rail.hidden) return;
    const box = scroller.getBoundingClientRect();
    rail.style.top = (box.top + 8) + 'px'; rail.style.height = Math.max(box.height - 16, 120) + 'px'; rail.style.left = (box.right - 40) + 'px';
    const lookup = railNotes.map(n => n.id).filter(id => !requested.has(id)).slice(0, 200);
    for (const id of lookup) requested.add(id);
    if (lookup.length) void window.onVoiceLookup(lookup).catch(() => {});
    railTrack.replaceChildren(railBand);
    for (const note of railNotes) {
      const kind = kindOf(states.get(note.id)), when = new Date(note.msg.t * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      const dot = document.createElement('button'); dot.type = 'button'; dot.className = 'vt-rail-dot'; dot.dataset.state = kind;
      dot.style.top = (note.index / railSpan * 100) + '%';
      dot.title = dot.ariaLabel = (note.msg.id.fromMe ? 'Sent' : 'Received') + ' voice note \u00b7 ' + when + ' \u00b7 ' + railLabels[kind];
      dot.addEventListener('click', event => { event.stopPropagation(); jumpTo(note.msg); });
      railTrack.append(dot);
    }
    railCount.textContent = String(railNotes.length); railCount.title = railNotes.length + ' voice notes loaded in this chat';
    railOlder.hidden = noEarlier;
    drawBand();
  }
  function scheduleRail() { if (!railFrame) railFrame = requestAnimationFrame(drawRail); }
  function scheduleBand() { requestAnimationFrame(drawBand); }
  railPrev.addEventListener('click', () => { const range = visibleRange(); const note = [...railNotes].reverse().find(n => !range || n.index < range.low); if (note) jumpTo(note.msg); });
  railNext.addEventListener('click', () => { const range = visibleRange(); const note = railNotes.find(n => !range || n.index > range.high); if (note) jumpTo(note.msg); });
  railOlder.addEventListener('click', async () => {
    if (!railChat) return; railOlder.disabled = true;
    try {
      const loader = window.require('WAWebChatLoadMessages'), before = railNotes.length;
      for (let i = 0; i < 10 && railNotes.length === before; i++) {
        const loaded = await loader.loadEarlierMsgs({ chat: railChat });
        drawRail(); if (!loaded || !loaded.length) break;
      }
    } catch { /* Loading older history is best effort. */ }
    railOlder.disabled = false; drawRail();
  });
  window.addEventListener('resize', scheduleRail);

  // Written messages: pick them in the open chat, then review and publish through the same Sera review.
  // The page only sends message IDs; the receiver reads the exact text from the linked session.
  const sourceItem = new Map(), textRequested = new Set(), picked = new Set();
  let selecting = null, anchor = null, openWhenReady = null, inboxState = null, inboxConfirm = false;
  const textLabels = { pending: 'Sent to Sera', transcribed: 'Sent to Sera · To review', reviewed: 'Sera · Reviewed, not saved', saved: '✓ Saved to Sera', attention: 'Sera · Needs attention' };
  const serial = msg => msg?.id?._serialized || (msg?.id && typeof msg.id.toString === 'function' && msg.id.toString() !== '[object Object]' ? msg.id.toString() : '');
  function writable(msg) {
    if (msg.isStatusV3) return false;
    if (msg.type === 'chat') return !!String(msg.body || '').trim();
    return ['image', 'video', 'document'].includes(msg.type) && !!String(msg.caption || '').trim();
  }
  function decorateText(bubble, msg, lookup) {
    const id = serial(msg); if (!id) return;
    if (bubble.dataset.vtText !== id) bubble.dataset.vtText = id;
    bubble.classList.toggle('vt-pickable', !!selecting);
    bubble.classList.toggle('vt-picked', !!selecting && picked.has(id));
    const item = sourceItem.get(id); let mark = bubble.querySelector(':scope > .vt-text-mark');
    if (!item) { mark?.remove(); if (!textRequested.has(id)) { textRequested.add(id); lookup.push(id); } return; }
    if (!mark) {
      mark = document.createElement('button'); mark.type = 'button'; mark.className = 'vt-text-mark';
      mark.addEventListener('click', event => { event.stopPropagation(); event.preventDefault(); openReview(mark.dataset.item); });
      bubble.appendChild(mark);
    }
    const kind = kindOf(states.get(item));
    mark.dataset.item = item;
    if (mark.dataset.state !== kind) { mark.dataset.state = kind; mark.textContent = textLabels[kind]; mark.title = 'Open the Sera review for this message'; }
  }
  function clearText(bubble) { delete bubble.dataset.vtText; bubble.classList.remove('vt-pickable', 'vt-picked'); bubble.querySelector(':scope > .vt-text-mark')?.remove(); }
  const bar = document.createElement('div'); bar.className = 'vt-select'; bar.hidden = true; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Send written messages to Sera');
  const barButton = (text, action, primary) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; if (primary) b.className = 'vt-primary'; b.addEventListener('click', event => { event.stopPropagation(); void action(); }); return b; };
  const startPick = barButton('Select messages for Sera', () => startSelecting(railChat));
  const pickCount = document.createElement('span'); pickCount.className = 'vt-count'; pickCount.setAttribute('aria-live', 'polite');
  const reviewPick = barButton('Review with Sera', reviewSelection, true);
  const dismissPick = barButton('Mark as handled', dismissSelection);
  const cancelPick = barButton('Cancel', () => stopSelecting());
  const pickNote = document.createElement('small'); pickNote.setAttribute('aria-live', 'polite');
  bar.append(startPick, pickCount, reviewPick, dismissPick, cancelPick, pickNote); document.body.append(bar);
  function chatId(chat) { return chat?.id?._serialized || (chat?.id ? String(chat.id) : ''); }
  function startSelecting(chat) { if (!chat) return; selecting = chat; picked.clear(); anchor = null; pickNote.textContent = 'Select the messages to send. Shift-select picks a range.'; paintBar(); scan(); }
  function stopSelecting(note = '') { selecting = null; picked.clear(); anchor = null; pickNote.textContent = note; paintBar(); }
  function paintBar() {
    const on = !!selecting, inInbox = on && !!inboxState && chatId(selecting) === inboxState.chat;
    startPick.hidden = on; pickCount.hidden = reviewPick.hidden = cancelPick.hidden = !on; dismissPick.hidden = !inInbox;
    pickCount.textContent = picked.size === 1 ? '1 message selected' : picked.size + ' messages selected';
    reviewPick.disabled = dismissPick.disabled = !picked.size || picked.size > 100;
    if (picked.size > 100) pickNote.textContent = 'Select at most 100 messages at a time.';
    for (const row of document.querySelectorAll('[data-vt-text]')) { row.classList.toggle('vt-pickable', on); row.classList.toggle('vt-picked', on && picked.has(row.dataset.vtText)); }
  }
  function placeBar(scroller, chat) {
    if (selecting && chat !== selecting) stopSelecting();
    bar.hidden = !scroller || !chat;
    if (bar.hidden) return;
    const box = scroller.getBoundingClientRect();
    // Centered on the chat, but never off-screen in a narrow window.
    const half = Math.min(bar.offsetWidth, innerWidth - 16) / 2;
    bar.style.left = Math.min(Math.max(box.left + box.width / 2, half + 8), innerWidth - half - 8) + 'px'; bar.style.top = (box.bottom - 12) + 'px';
  }
  function pick(event) {
    if (!selecting || event.target.closest('.vt-select,.voice-transcriber,.vt-text-mark,.voice-tools,.vt-rail,dialog,a')) return;
    const row = event.target.closest('[data-vt-text]'); if (!row) return;
    event.preventDefault(); event.stopPropagation();
    const id = row.dataset.vtText;
    if (event.shiftKey && anchor && anchor !== id) {
      const order = selecting.msgs.getModelsArray().filter(writable).map(serial), from = order.indexOf(anchor), to = order.indexOf(id);
      if (from >= 0 && to >= 0) for (const each of order.slice(Math.min(from, to), Math.max(from, to) + 1)) picked.add(each);
      else picked.add(id);
    } else if (picked.has(id)) picked.delete(id); else picked.add(id);
    anchor = id; pickNote.textContent = ''; paintBar();
  }
  document.addEventListener('click', pick, true);
  async function reviewSelection() {
    const ids = [...picked]; reviewPick.disabled = true; pickNote.textContent = 'Reading the selected messages...';
    let result;
    try { result = await window.onTextCapture(ids); } catch { result = { error: 'Could not read the selected messages. Try again.' }; }
    if (!result?.id) { pickNote.textContent = result?.error || 'Could not read the selected messages. Try again.'; paintBar(); return; }
    for (const id of ids) sourceItem.set(id, result.id);
    if (inboxState?.pending) inboxState.pending = inboxState.pending.filter(id => !picked.has(id));
    openWhenReady = result.id; stopSelecting(); paintInbox();
    if (states.get(result.id)?.status === 'done') { openWhenReady = null; openReview(result.id); }
  }
  async function dismissSelection() {
    const ids = [...picked];
    try { await window.onTextDismiss(ids); } catch { pickNote.textContent = 'Could not update the inbox. Try again.'; return; }
    if (inboxState?.pending) inboxState.pending = inboxState.pending.filter(id => !picked.has(id));
    stopSelecting((ids.length === 1 ? '1 message' : ids.length + ' messages') + ' marked as handled. Nothing was sent to Sera.'); paintInbox();
  }
  function findChat(id) {
    try {
      const chats = window.require('WAWebCollections').Chat;
      return chats.get(id) || chats.getModelsArray().find(chat => chatId(chat) === id) || null;
    } catch { return null; }
  }
  async function openInbox() {
    const chat = findChat(inboxState?.chat);
    if (!chat) { inboxNote('Open the inbox chat in WhatsApp once, then try again.'); return; }
    try { await window.require('WAWebCmd').Cmd.openChatBottom({ chat }); } catch { /* The chat may already be open. */ }
    tools.open = false; startSelecting(chat);
    for (const id of inboxState.pending || []) picked.add(id);
    pickNote.textContent = picked.size ? 'New inbox messages are selected. Adjust the selection, then Review with Sera.' : 'No new messages. Select messages to send.';
    paintBar(); scheduleRail();
  }
  function inboxNote(text) { const note = inboxBox.querySelector('small'); if (note) note.textContent = text; }
  const CONSENT = 'Everyone who posts in this chat should know their messages may be saved to Sera after review.';
  function paintInbox() {
    inboxBox.replaceChildren();
    const intro = document.createElement('p'), note = document.createElement('small');
    if (inboxState?.chat) {
      const fresh = inboxState.pending?.length || 0;
      intro.textContent = 'Sera inbox: ' + (inboxState.name || 'chosen chat') + (fresh ? ' · ' + fresh + ' new' : ' · nothing new');
      inboxBox.append(intro, barButton(fresh ? 'Review new inbox messages' : 'Open Sera inbox', openInbox), barButton('Stop using as inbox', () => window.onInboxClear()), note);
      return;
    }
    const chat = activeChat();
    intro.textContent = 'Sera inbox: pick one chat where people forward messages for Sera. This app only reads it and never posts.';
    const use = barButton(inboxConfirm ? 'Confirm: use ' + (chat?.formattedTitle || chat?.name || 'this chat') : 'Use the open chat as Sera inbox', async () => {
      const current = activeChat();
      if (!current) { inboxNote('Open the chat you want to use first.'); return; }
      if (!inboxConfirm) { inboxConfirm = true; paintInbox(); return; }
      inboxConfirm = false; await window.onInboxSet(chatId(current), current.formattedTitle || current.name || '');
    });
    use.disabled = !chat;
    note.textContent = inboxConfirm ? CONSENT : chat ? '' : 'Open a chat to choose it.';
    inboxBox.append(intro, use, note);
  }
  tools.addEventListener('toggle', () => { if (tools.open) { inboxConfirm = false; paintInbox(); } });
  paintInbox();
  window.VoiceTranscriber = { update(entries) {
    let texts = false;
    for (const entry of entries) {
      const previous = states.get(entry.id);
      states.set(entry.id, entry);
      if (panels.has(entry.id) && JSON.stringify(previous) !== JSON.stringify(entry)) render(entry.id, panels.get(entry.id));
      if (entry.kind === 'text' && Array.isArray(entry.sources)) { texts = true; for (const source of entry.sources) sourceItem.set(source, entry.id); }
    }
    window.VoiceReview.update(entries);
    const ready = openWhenReady && entries.find(entry => entry.id === openWhenReady && entry.status === 'done');
    if (ready) { openWhenReady = null; openReview(ready.id); }
    if (texts) { clearTimeout(timer); timer = setTimeout(scan, 50); }
    scheduleRail();
  }, summary(pending, inbox) {
    inboxState = inbox && typeof inbox.chat === 'string' ? inbox : null;
    const fresh = inboxState?.pending?.length || 0;
    toolsTitle.textContent = 'Voice notes + Sera' + (pending > 0 ? ' \u00b7 ' + pending + ' to review' : '') + (fresh ? ' \u00b7 ' + fresh + ' new in inbox' : '');
    paintInbox(); paintBar();
  }, scan, dispose() { document.removeEventListener('click', recordClick, true); document.removeEventListener('click', pick, true); bar.remove(); for (const row of document.querySelectorAll('[data-vt-text]')) clearText(row); observer.disconnect(); clearTimeout(timer); for (const panel of panels.values()) panel.remove(); style.remove(); tools.remove(); rail.remove(); railScroller?.removeEventListener('scroll', scheduleBand); window.removeEventListener('resize', scheduleRail); window.VoiceReview?.dispose(); delete window.VoiceTranscriber; } };
  let timer;
  const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(scan, 150); });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-id'] });
  scan();
}
async function installInline(client, emit, openExternal, captureText) {
  const ids = (value, limit) => Array.isArray(value) && value.length <= limit && value.every(id => typeof id === 'string' && id && id.length <= 1024);
  if (captureText && !await client.pupPage.evaluate(() => typeof window.onTextCapture === 'function')) await client.pupPage.exposeFunction('onTextCapture', async selection => {
    if (!ids(selection, 100) || !selection.length) return { error: 'Select between 1 and 100 messages.' };
    try { return { id: await captureText(selection) }; } catch (error) { return { error: String(error.message || error).slice(0, 300) }; }
  });
  if (!await client.pupPage.evaluate(() => typeof window.onTextLookup === 'function')) await client.pupPage.exposeFunction('onTextLookup', list => {
    if (ids(list, 500)) emit({ type: 'inline_text_lookup', ids: list });
  });
  if (!await client.pupPage.evaluate(() => typeof window.onTextDismiss === 'function')) await client.pupPage.exposeFunction('onTextDismiss', list => {
    if (ids(list, 500) && list.length) emit({ type: 'inline_text_dismiss', ids: list });
  });
  if (!await client.pupPage.evaluate(() => typeof window.onInboxSet === 'function')) await client.pupPage.exposeFunction('onInboxSet', (chat, name) => {
    if (typeof chat === 'string' && chat && chat.length <= 1024 && chat !== 'status@broadcast') emit({ type: 'inline_inbox_set', chat, name: String(name || chat).slice(0, 200) });
  });
  if (!await client.pupPage.evaluate(() => typeof window.onInboxClear === 'function')) await client.pupPage.exposeFunction('onInboxClear', () => emit({ type: 'inline_inbox_clear' }));
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
  if (!await client.pupPage.evaluate(() => typeof window.onVoiceReviewed === 'function')) await client.pupPage.exposeFunction('onVoiceReviewed', (id, reviewed) => {
    if (typeof id === 'string' && id.length <= 1024) emit({ type: 'inline_reviewed', id, reviewed: !!reviewed });
  });
  if (!await client.pupPage.evaluate(() => typeof window.onVoiceLookup === 'function')) await client.pupPage.exposeFunction('onVoiceLookup', ids => {
    if (Array.isArray(ids)) emit({ type: 'inline_lookup', ids: ids.filter(id => typeof id === 'string' && id.length <= 1024).slice(0, 200) });
  });
  await client.pupPage.evaluate(installReviewUI);
  await client.pupPage.evaluate(installPageInline);
}
module.exports = { installInline, installPageInline };
