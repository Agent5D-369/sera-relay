'use strict';
function installReviewUI() {
  if (window.VoiceReview) return;
  // Hallmark pre-emit critique: Philosophy 4, Hierarchy 5, Execution 4, Specificity 5, Restraint 5, Variety 4.
  // Component: review; genre: modern minimal; theme: existing WhatsApp; no decorative motion.
  const style = document.createElement('style');
  style.textContent = `
  .voice-review,.voice-help{--vr-bg:#202c33;--vr-input:#111b21;--vr-ink:#e9edef;--vr-muted:#b9c6cd;--vr-line:#71858f;--vr-accent:#63dec6;--vr-action:#006b56;--vr-error:#ffb4ab;--vr-overlay:rgba(0,0,0,.65);--vr-font:system-ui,sans-serif;color:var(--vr-ink);background:var(--vr-bg);font:14px/1.5 var(--vr-font);color-scheme:dark}
  .voice-review{box-sizing:border-box;width:min(880px,calc(100% - 24px));max-width:none;height:min(850px,calc(100dvh - 24px));max-height:calc(100dvh - 24px);padding:0;border:1px solid var(--vr-line);border-radius:16px;overflow:hidden}
  .voice-review[open]{display:flex;flex-direction:column}.voice-review::backdrop{background:var(--vr-overlay)}
  .voice-review *{box-sizing:border-box}.voice-review [hidden]{display:none!important}.voice-review h2,.voice-review h3{font-style:normal;margin:0;overflow-wrap:anywhere;min-width:0}.voice-review h2{font-size:20px;line-height:1.25}.voice-review h3{font-size:16px;margin-bottom:12px}
  .voice-review header,.voice-review footer{flex:none;padding:18px 24px;background:var(--vr-bg)}.voice-review header{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid var(--vr-line)}
  .voice-review footer{display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--vr-line)}.voice-review .vr-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:20px 24px}.voice-review section{margin:20px 0}.voice-review p{margin:8px 0;overflow-wrap:anywhere}
  .voice-review button,.voice-help button{font:600 14px var(--vr-font);color:var(--vr-ink);background:transparent;border:1px solid var(--vr-line);border-radius:8px;padding:9px 12px;min-height:42px;white-space:nowrap;cursor:pointer}
  .voice-review button:hover,.voice-review button.is-hover,.voice-help button:hover{border-color:var(--vr-accent)}.voice-review button:active,.voice-review button.is-active{transform:translateY(1px)}.voice-review button:focus-visible,.voice-review button.is-focus,.voice-review input:focus-visible,.voice-review textarea:focus-visible,.voice-review summary:focus-visible{outline:2px solid var(--vr-accent);outline-offset:3px}
  .voice-review button:disabled{opacity:.5;cursor:default}.voice-review .vr-primary{background:var(--vr-action);border-color:var(--vr-action)}.voice-review [data-state=loading]{opacity:.8}.voice-review [data-state=error]{color:var(--vr-error)}.voice-review [data-state=success]{color:var(--vr-accent)}
  .voice-review label{display:block}.voice-review input:not([type=checkbox]),.voice-review textarea{display:block;width:100%;min-width:0;margin:8px 0 14px;padding:10px;border:1px solid var(--vr-line);border-radius:8px;background:var(--vr-input);color:var(--vr-ink);font:inherit}.voice-review textarea{min-height:160px;resize:vertical}.voice-review input[type=checkbox]{accent-color:var(--vr-action);width:18px;height:18px;flex:none;margin:0}
  .voice-review .vr-check{display:flex;align-items:flex-start;gap:10px;padding:10px 0;cursor:pointer}.voice-review a{color:var(--vr-accent);overflow-wrap:anywhere}.voice-review small,.voice-review .vr-muted{color:var(--vr-muted)}
  .voice-review details{border-bottom:1px solid var(--vr-line);padding:12px 0}.voice-review summary{cursor:pointer;font-weight:600;min-height:32px}.voice-review .vr-status{flex:none;display:flex;align-items:center;gap:12px;margin:12px 24px 0;padding:12px 14px;background:var(--vr-input);border-radius:8px}.voice-review .vr-status img{width:44px;height:44px;border-radius:50%;object-fit:cover;flex:none}.voice-review .vr-status-copy{min-width:0}.voice-review .vr-record-links a{display:block;margin-top:4px;font-size:13px}.voice-review .vr-status-title{display:block;font-weight:600;color:var(--vr-ink)}.voice-review .vr-status p{margin:2px 0;font-size:13px}.voice-review .vr-thinking{display:inline-block;margin-left:6px;color:var(--vr-accent);animation:vr-think 1.4s ease-in-out infinite}@keyframes vr-think{50%{opacity:.3}}.voice-review .vr-task{padding:16px 0;border-top:1px solid var(--vr-line)}
  .voice-review .vr-people{max-height:180px;overflow:auto;border:1px solid var(--vr-line);border-radius:8px;padding:0 12px}.voice-review .vr-person{display:flex;gap:10px;align-items:center;padding:9px 0;cursor:pointer}.voice-review .vr-selected{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.voice-review .vr-chip{padding:4px 9px;border-radius:20px;background:var(--vr-input);font-size:12px}.voice-review .vr-evidence{border-left:2px solid var(--vr-line);padding-left:12px;margin:12px 0}.voice-review .vr-kind{color:var(--vr-accent);font-size:12px;font-weight:600}
  @media(max-width:560px){.voice-review header,.voice-review footer{padding:14px}.voice-review .vr-scroll{padding:14px}.voice-review .vr-status{margin:10px 14px 0}.voice-review h2{font-size:18px}.voice-review footer button{flex:1}.voice-review header button{flex:none}.voice-review .vr-people{max-height:150px}}
  @media(prefers-reduced-motion:reduce){.voice-review button:active,.voice-review button.is-active{transform:none}.voice-review .vr-thinking{animation:none}}
  `;
  document.head.appendChild(style);
  const cache = new Map(), views = new Map();
  let active;
  function element(tag, text, cls) { const el = document.createElement(tag); if (text) el.textContent = text; if (cls) el.className = cls; return el; }
  function link(text, href) {
    if (!/^https:\/\/(www\.)?notion\.so\/[a-zA-Z0-9\-/]+$/.test(href || '')) return element('span', text);
    const el = element('a', text); el.href = href; el.target = '_blank'; el.rel = 'noopener noreferrer'; return el;
  }
  function remember() { if (active) views.set(active.id, { title: active.title.value, transcript: active.transcript.value, tasks: active.tasks }); }
  function close() { if (!active) return; remember(); clearInterval(active.tick); active.dialog.close(); active.dialog.remove(); active = null; }
  function button(text, action) { const b = element('button', text); b.type = 'button'; b.onclick = action; return b; }
  function details(title, content) { const d = element('details'); d.append(element('summary', title), content); return d; }
  function field(parent, text, tag = 'input') { const l = element('label', text), f = element(tag); f.setAttribute('aria-label', text); l.append(f); parent.append(l); return f; }
  async function request(name, values) {
    const r = active; if (!r || r.pending || cache.get(r.id)?.busy) return;
    r.pending = name; r.started = Date.now(); r.error = ''; refresh();
    try { await window.onSeraAction(r.id, name, values); }
    catch { r.pending = null; r.error = 'Could not send the request. Try again.'; refresh(); }
  }
  function refresh() {
    const r = active; if (!r) return;
    const state = cache.get(r.id) || {}, memory = state.memory || {}, draft = memory.draft;
    const busy = !!state.busy || !!r.pending, verified = !!draft?.verified;
    const changed = !!draft && draft.transcript !== r.transcript.value;
    r.preview.disabled = busy || verified; const plan = r.taskSelection?.() || { ok: true, count: 0 };
    r.publish.disabled = busy || !draft || changed || verified || !plan.ok; r.verify.disabled = busy || !draft;
    r.verify.hidden = !draft?.page_id && !draft?.url && !draft?.duplicate && memory.status !== 'uncertain';
    r.preview.textContent = memory.status === 'review_error' || r.error ? 'Retry Sera review' : changed ? 'Refresh breakdown' : 'Refresh preview';
    r.publish.textContent = (draft?.duplicate ? 'Use existing memory' : 'Publish memory') + (plan.count ? ` + create ${plan.count} task${plan.count === 1 ? '' : 's'}` : '');
    r.publish.hidden = verified; r.preview.hidden = verified;
    r.title.readOnly = verified; r.transcript.readOnly = verified;
    const error = r.error || (!busy && (['uncertain','review_error'].includes(memory.status) || (!draft && memory.error) || /fail|could not|not confirmed/i.test(memory.error || '')) ? memory.error : '');
    r.status.dataset.state = error ? 'error' : busy ? 'loading' : verified ? 'success' : '';
    r.status.setAttribute('aria-busy', String(busy && !error));
    r.statusTitle.textContent = error ? 'Sera needs your attention' : busy ? (r.pending === 'prepare' || !draft ? 'Sera is thinking' : 'Sera is working') : verified ? 'Memory saved' : 'Sera\u2019s review';
    r.thinking.hidden = !busy || !!error;
    r.statusText.textContent = error || (busy ? ({prepare:'Reading your transcript, preparing a summary, and checking duplicates.',publish:'Publishing, checking the saved record, then creating any selected tasks.',verify:'Checking the saved record.',tasks:'Creating your selected shared tasks.'}[r.pending] || 'Working...') : verified ? (draft.tasks?.length ? `Memory saved. ${draft.tasks.length} task${draft.tasks.length === 1 ? '' : 's'} created.` : 'Published and verified. You can now assign follow-ups.') : changed ? 'Transcript changed. Refresh the breakdown before publishing.' : draft ? 'Preview ready. Check the summary, then publish when ready.' : 'Preview unavailable. Choose Refresh preview to try again.');
    if (busy && !error) { const seconds = Math.floor((Date.now() - r.started) / 1000); r.statusText.textContent += ` ${seconds}s elapsed.`; if (seconds >= 15) r.statusText.textContent += ' You can close review and continue using WhatsApp while this finishes.'; }
    r.recordLinks.replaceChildren();
    if (verified && !busy) {
      if (draft.url) r.recordLinks.append(link('Open memory: ' + draft.title, draft.url));
      for (const task of draft.tasks || []) r.recordLinks.append(link('Open task: ' + task.title, task.url));
    }
    r.updateTasks?.(busy);
    if (!draft || JSON.stringify(draft) === r.signature) return;
    remember(); r.signature = JSON.stringify(draft);
    if (!r.title.value) r.title.value = draft.title;
    r.contents.replaceChildren(); r.taskSelection = null; r.updateTasks = null;
    const summary = element('section'); summary.append(element('h3', 'Sera\u2019s summary'), element('p', draft.summary || 'No summary returned.'));
    r.contents.append(summary);
    if (draft.duplicate) { const p = element('p', 'This transcript already exists. Publishing will reuse it: '); p.append(link(draft.duplicate.title, draft.duplicate.url)); summary.prepend(p); }
    if (draft.url) summary.append(link('Open saved memory', draft.url));
    const evidence = element('div');
    for (const c of draft.claims || []) { const item = element('div', '', 'vr-evidence'); item.append(element('span', c.kind, 'vr-kind'), element('p', c.text)); item.append(c.kind === 'Institutional memory' ? link('Source record', c.evidence) : element('small', c.evidence)); evidence.append(item); }
    r.contents.append(details('Evidence and interpretation', evidence));
    if (draft.related?.length) {
      const section = element('section'); section.append(element('h3', 'Related memory'));
      for (const topic of draft.related) { const l = element('label', '', 'vr-check'), c = element('input'); c.type = 'checkbox'; c.dataset.related = topic.id; c.checked = draft.selected_related.includes(topic.id); c.disabled = verified; l.append(c, link(topic.title, topic.url)); section.append(l); }
      r.contents.append(section);
    }
    if (draft.actions?.length) {
      const section = element('section'); section.append(element('h3', 'Follow-ups'), element('p', 'Optional. Check a follow-up, choose people and a due date, and it is created as a shared task when you publish.', 'vr-muted'));
      const rows = [];
      draft.actions.forEach((a, index) => {
        const saved = r.tasks[index] || (r.tasks[index] = { checked: false, owners: [], date: '' });
        const completed = draft.tasks?.some(t => t.title === a.title);
        if (completed) saved.checked = false;
        const row = element('div', '', 'vr-task'), check = element('input'); check.type = 'checkbox'; check.dataset.task = index; check.checked = saved.checked; check.disabled = busy;
        const l = element('label', '', 'vr-check'); l.append(check, element('span', a.title + (completed ? ' \u00b7 Task created' : ''))); row.append(l);
        const picker = element('div'); picker.hidden = !check.checked;
        const search = field(picker, 'Find people'); search.type = 'search'; search.placeholder = 'Search by name';
        const chips = element('div', '', 'vr-selected'); chips.setAttribute('aria-live', 'polite'); picker.append(chips);
        const people = element('div', '', 'vr-people'); people.setAttribute('role', 'group'); people.setAttribute('aria-label', 'Task assignees');
        const sorted = [...(draft.owners || [])].sort((a,b) => a.name.localeCompare(b.name));
        function selected() { chips.replaceChildren(); for (const o of sorted.filter(o => saved.owners.includes(o.id))) chips.append(element('span', o.name, 'vr-chip')); if (!saved.owners.length) chips.append(element('small', 'No people selected')); }
        for (const o of sorted) { const label = element('label', '', 'vr-person'), c = element('input'); c.type = 'checkbox'; c.dataset.owner = o.id; c.checked = saved.owners.includes(o.id); c.disabled = busy; label.dataset.name = o.name.toLocaleLowerCase(); label.append(c, element('span', o.name)); c.onchange = () => { saved.owners = [...people.querySelectorAll(':checked')].map(e => e.dataset.owner); selected(); refresh(); }; people.append(label); }
        const empty = element('small', 'No matching people. Try another name.'); empty.hidden = true; people.append(empty); picker.append(people); selected();
        search.oninput = () => { let count = 0; for (const label of people.querySelectorAll('[data-name]')) { label.hidden = !label.dataset.name.includes(search.value.trim().toLocaleLowerCase()); if (!label.hidden) count++; } empty.hidden = count > 0; };
        const date = field(picker, 'Due date'); date.type = 'date'; date.value = saved.date; date.disabled = busy;
        date.oninput = () => { saved.date = date.value; refresh(); };
        check.onchange = () => { saved.checked = check.checked; picker.hidden = !check.checked; refresh(); };
        row.append(picker); section.append(row); rows.push({ index, saved, check, date, completed });
      });
      const isValid = x => x.saved.owners.length > 0 && x.saved.owners.length <= 20 && x.saved.date && x.date.checkValidity();
      r.taskSelection = () => { const picked = rows.filter(x => x.saved.checked && !x.completed); return { ok: picked.every(isValid), count: picked.length, selection: picked.map(x => ({index:x.index,owner_ids:x.saved.owners,due_date:x.saved.date})) }; };
      const create = button('Create shared tasks', () => void request('tasks', { selection: r.taskSelection().selection })); create.className = 'vr-primary';
      const hint = element('p', '', 'vr-muted'); hint.setAttribute('aria-live', 'polite');
      r.updateTasks = nextBusy => { const plan = r.taskSelection(), n = plan.count, valid = n && plan.ok; create.hidden = !verified; create.disabled = nextBusy || !valid; hint.textContent = n && !plan.ok ? 'Choose 1 to 20 people and a due date for each checked follow-up, or uncheck it.' : !verified ? (n ? `${n} shared task${n === 1 ? '' : 's'} will be created when you publish.` : 'Nothing selected. The memory publishes without tasks.') : !n ? 'Check a follow-up to add a task to this saved memory.' : `${n} shared task${n === 1 ? '' : 's'} ready to create.`; for (const el of section.querySelectorAll('input[type=checkbox],input[type=date]')) el.disabled = nextBusy; for (const row of rows) if (row.completed) row.check.disabled = true; };
      section.append(create, hint); r.contents.append(section); r.updateTasks(busy);
    }
    for (const task of draft.tasks || []) { const p = element('p'); p.append(link('Task created: ' + task.title, task.url)); r.contents.append(p); }
  }
  window.VoiceReview = {
    open(id, state, retry = false) {
      close(); cache.set(id, state || {});
      const saved = views.get(id), draft = state?.memory?.draft;
      const dialog = element('dialog', '', 'voice-review'); dialog.setAttribute('aria-label', 'Review voice note for Living Memory');
      const header = element('header'); const heading = element('h2', draft?.verified ? 'Saved memory' : 'Review voice note'); const x = button('Close', close); x.setAttribute('aria-label', 'Close review'); header.append(heading, x);
      const scroll = element('div', '', 'vr-scroll');
      const title = field(scroll, 'Memory title'); title.value = saved?.title || draft?.title || ''; title.placeholder = 'Sera is naming this note...'; title.maxLength = 200;
      const source = element('div'), transcript = field(source, 'Transcript', 'textarea'); transcript.value = saved?.transcript ?? draft?.transcript ?? state?.transcript ?? '';
      const sourceDisclosure = details('Transcript \u00b7 review or edit', source); sourceDisclosure.open = !draft?.verified; scroll.append(sourceDisclosure);
      const status = element('div', '', 'vr-status'); status.setAttribute('role','status'); const avatar = element('img'); avatar.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4Ij48cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgcng9IjY0IiBmaWxsPSIjMTExYjIxIi8+PHBhdGggZD0iTTM2IDMyaDU2djMySDM2Vjk2aDU2IiBmaWxsPSJub25lIiBzdHJva2U9IiM2M2RlYzYiIHN0cm9rZS13aWR0aD0iMTIiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4='; avatar.alt = 'Sera'; avatar.width = 44; avatar.height = 44; const statusCopy = element('div', '', 'vr-status-copy'), statusTitle = element('span', '', 'vr-status-title'), thinking = element('span', '\u2022\u2022\u2022', 'vr-thinking'), statusText = element('p'); thinking.setAttribute('aria-hidden','true'); const statusHeading = element('div'); statusHeading.append(statusTitle,thinking); statusTitle.setAttribute('aria-live','polite'); const recordLinks = element('div', '', 'vr-record-links'); statusCopy.append(statusHeading,statusText,recordLinks); status.append(avatar,statusCopy); const contents = element('div'); scroll.append(contents);
      const footer = element('footer'); const preview = button('Refresh preview', () => void request('prepare',{title:title.value,transcript:transcript.value}));
      const publish = button('Publish memory', () => void request('publish',{title:title.value,transcript:transcript.value,related_ids:[...contents.querySelectorAll('[data-related]:checked')].map(x=>x.dataset.related),selection:(active?.taskSelection?.().selection || [])})); publish.className = 'vr-primary';
      const verify = button('Check saved record', () => void request('verify',{})); footer.append(publish,preview,verify);
      dialog.append(header,status,scroll,footer); document.body.append(dialog);
      active = {id,dialog,title,transcript,status,statusTitle,statusText,thinking,recordLinks,contents,preview,publish,verify,tasks:saved?.tasks || {},signature:'',pending:null,error:''};
      active.started = Date.now(); active.lastLookup = Date.now(); active.tick = setInterval(() => { refresh(); if (active && (active.pending || cache.get(active.id)?.busy) && Date.now() - active.lastLookup >= 15000 && window.onVoiceLookup) { active.lastLookup = Date.now(); void window.onVoiceLookup([active.id]).catch(() => {}); } }, 1000);
      transcript.oninput = () => { remember(); refresh(); }; title.oninput = remember;
      dialog.addEventListener('cancel', e => {e.preventDefault();close();});
      dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
      dialog.showModal(); refresh(); x.focus();
      if (!state?.busy && !draft?.verified && (retry || !draft)) {
        if (state?.memory?.status === 'uncertain' && draft) void request('verify',{});
        else void request('prepare',{title:title.value,transcript:transcript.value});
      }
    },
    update(entries) { for (const entry of entries) { cache.set(entry.id,entry); if (active?.id === entry.id && !entry.busy) { active.pending = null; if (entry.memory?.error && (!entry.memory.draft || ['review_error','uncertain'].includes(entry.memory.status))) active.error = entry.memory.error; else if (entry.memory?.draft && !entry.memory.error) active.error = ''; } } refresh(); },
    dispose() { close(); style.remove(); delete window.VoiceReview; }
  };
}
module.exports = { installReviewUI };
