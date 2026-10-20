/* Browser workspace. Drafts are local; exports are files, never network requests. */
(() => {
  'use strict';
  const E = window.ScopeEngine;
  const $ = selector => document.querySelector(selector);
  const app = $('#app'), key = 'scopelab-project-v1';
  const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  let storageAvailable = true, project, view = 'lab', activeId = 'capacity';
  let policyId = null, draftInput, draftNote = '', run = null, toastTimer, editing = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motionPaused = reducedMotion.matches;
  try {
    const raw = localStorage.getItem(key);
    project = raw ? E.validateProject(JSON.parse(raw)) : E.createProject();
  } catch { project = E.createProject(); storageAvailable = false; }
  const count = () => Object.keys(project.decisions).length;
  const spec = () => E.SCENARIOS.find(item => item.id === activeId);
  const pack = () => E.PACKS[project.packId];
  const badge = (text, tone = 'neutral') => '<span class="pill ' + tone + '">' + esc(text) + '</span>';
  const stat = (value, label, detail) => '<div class="stat"><strong>' + esc(value) + '</strong><div><span>' + esc(label) + '</span><small>' + esc(detail) + '</small></div></div>';
  function notify(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message; $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
  }
  function persist() {
    project.updatedAt = new Date().toISOString();
    try { localStorage.setItem(key, JSON.stringify(project)); storageAvailable = true; }
    catch { storageAvailable = false; }
    $('#storage-status').textContent = storageAvailable ? 'Saved on this device' : 'Session only · export to keep';
    $('#storage-dot').classList.toggle('storage-error', !storageAvailable);
  }
  function selectScenario(id) {
    activeId = id;
    const decision = project.decisions[id];
    policyId = decision?.policyId || null;
    draftInput = E.clone(decision?.input || E.DEFAULTS[id]);
    draftNote = decision?.note || '';
    run = null;
  }
  function header() {
    $('#sidebar-project-name').textContent = project.name;
    $('#decision-count').textContent = count();
    $('#breadcrumb-view').textContent = ({ lab: 'Scenario lab', decisions: 'Decision log', handoff: 'Developer handoff' })[view];
    document.querySelectorAll('[data-view]').forEach(button => {
      if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    return '<div class="page-heading"><div><p class="eyebrow">' + esc(pack().name.toUpperCase()) + ' / PROJECT REHEARSAL</p><h1>' + esc(project.name) + '</h1><p class="project-description">' + esc(project.idea) + '</p></div><button type="button" class="button ghost edit-brief" data-action="edit-brief">Edit brief <span aria-hidden="true">↗</span></button></div><div class="stat-strip">' +
      stat('06', 'Scenarios to explore', 'Six recurring product edge cases') +
      stat(String(count()).padStart(2, '0'), 'Decisions recorded', 'Your rules, with a reason behind them') +
      stat(String(6 - count()).padStart(2, '0'), 'Open questions', 'Still yours to decide') + '</div>';
  }
  function scenarioTitle(item) {
    return item.id === 'capacity' ? 'Two people. One ' + pack().noun + '.' : item.title;
  }
  function rail() {
    return '<aside class="scenario-rail" aria-label="Scenarios"><div class="rail-heading"><span>THE SCENARIOS</span><span>06</span></div>' +
      E.SCENARIOS.map(item => '<button type="button" class="scenario-button ' + (activeId === item.id ? 'active' : '') + '" data-scenario="' + item.id + '"' + (activeId === item.id ? ' aria-current="step"' : '') + '><span class="scenario-number">' + (project.decisions[item.id] ? '✓' : item.number) + '</span><span><strong>' + esc(scenarioTitle(item)) + '</strong><small>' + item.category + '</small></span><span class="scenario-arrow" aria-hidden="true">↗</span></button>').join('') +
      '<div class="coverage-card"><div class="coverage-top"><span>YOUR REHEARSAL</span><strong>' + count() + '/6</strong></div><div class="coverage-track"><span style="width:' + count() / 6 * 100 + '%"></span></div><p>Recorded decisions become your developer brief.</p></div></aside>';
  }
  const numberField = (name, label, min, max) => '<label>' + label + '<input data-fixture="' + name + '" type="number" min="' + min + '" max="' + max + '" value="' + draftInput[name] + '"></label>';
  const selectField = (name, label, options) => '<label>' + label + '<select data-fixture="' + name + '">' + options.map(([value, text]) => '<option value="' + value + '"' + (draftInput[name] === value ? ' selected' : '') + '>' + text + '</option>').join('') + '</select></label>';
  function fixtures() {
    if (activeId === 'capacity') return numberField('capacity', 'Available ' + pack().plural, 1, 5) + numberField('requests', 'Concurrent requests', 2, 8);
    if (activeId === 'timeout') return selectField('paid', 'Actual provider result', [['yes', 'Payment succeeded'], ['no', 'Payment failed']]);
    if (activeId === 'duplicate') return numberField('deliveries', 'Copies of the same event', 2, 6);
    if (activeId === 'cancellation') return selectField('late', 'Cancellation timing', [['yes', 'After the cutoff'], ['no', 'Before the cutoff']]);
    if (activeId === 'price') return numberField('quoted', 'Quoted price', 1, 10000) + numberField('current', 'Current price', 1, 10000) + selectField('accepts', 'Customer accepts new total?', [['no', 'Not yet'], ['yes', 'Yes']]);
    return selectField('viewer', 'Requester', [['other', 'Different customer'], ['owner', 'Record owner'], ['staff', 'Authorized staff']]) + selectField('token', 'Valid record-bound guest token?', [['no', 'No'], ['yes', 'Yes']]);
  }
  function diagram() {
    const capacity = activeId === 'capacity';
    const labels = capacity ? pack().people : activeId === 'ownership' ? ['Requester', 'Private record'] : ['Customer', 'Application'];
    const resource = capacity ? pack().noun : ({ timeout: 'payment', duplicate: 'event', cancellation: 'refund', price: 'quote', ownership: 'record' })[activeId];
    const centerValue = capacity ? (run ? run.expected.remaining : draftInput.capacity) : run ? (run.level === 'risk' ? '!' : run.level === 'review' ? '…' : '✓') : '?';
    const state = !run ? 'Awaiting rehearsal' : run.level === 'risk' ? 'Failure exposed' : run.level === 'review' ? 'Needs a follow-up' : 'Policy applied';
    const card = (name, side) => '<div class="actor actor-' + side + '"><span class="actor-avatar">' + esc(name.slice(0, 1)) + '</span><strong>' + esc(name) + '</strong><small>' + (capacity ? 'wants 1 ' + pack().noun : side === 'left' ? 'sends a request' : 'applies the rule') + '</small><span class="actor-state">' + (run ? (run.level === 'risk' ? 'Check the trace ↓' : 'Outcome recorded ↓') : 'Ready to begin') + '</span></div>';
    return '<div class="simulation-scene ' + (run ? 'has-run ' + run.level : '') + '">' +
      '<div class="scene-grid" aria-hidden="true"></div><div class="scene-caption"><span class="live-dot" aria-hidden="true"></span> DETERMINISTIC REHEARSAL <span>SAMPLE DATA</span></div>' +
      '<div class="actor-flow">' + card(labels[0], 'left') + '<div class="flow-wire" aria-hidden="true"><span></span></div><div class="resource"><div class="resource-top"><span class="resource-icon" aria-hidden="true">▥</span><span>' + esc(resource.toUpperCase()) + '</span></div><strong>' + esc(centerValue) + '</strong><small>' + (capacity ? 'remaining' : 'policy state') + '</small></div><div class="flow-wire reverse" aria-hidden="true"><span></span></div>' + card(labels[1], 'right') + '</div>' +
      '<div class="scene-state">' + badge(state, run ? run.level : 'neutral') + '<span>' + (run ? (run.policyId ? 'CHOSEN POLICY' : 'INCOMPLETE BASELINE') : 'START WITH THE BASELINE') + '</span></div></div>';
  }
  function simulation() {
    const s = spec();
    const title = activeId === 'capacity' ? 'One ' + pack().noun + '. More than one request.' : s.question;
    const metrics = run ? '<div class="metric-row">' + run.metrics.map(item => '<div><span>' + esc(item.label) + '</span><strong>' + esc(item.value) + '</strong></div>').join('') + '</div>' : '';
    const trace = run ? '<ol class="trace">' + run.trace.map((event, n) => '<li style="--step:' + n + '"><span class="trace-dot ' + event.tone + '">' + String(n + 1).padStart(2, '0') + '</span><div><strong>' + esc(event.title) + '</strong><p>' + esc(event.detail) + '</p></div></li>').join('') + '</ol><div class="outcome ' + run.level + '"><span aria-hidden="true">' + (run.level === 'risk' ? '!' : run.level === 'review' ? '↳' : '✓') + '</span><p>' + esc(run.summary) + '</p></div>' : '<div class="trace-empty"><span aria-hidden="true">↳</span><div><strong>What happens when it gets messy?</strong><p>Run the baseline, then try a policy from the right.</p></div></div>';
    return '<div class="simulation-column"><section class="stage-panel" aria-labelledby="simulation-title"><div class="stage-heading"><span class="eyebrow">SCENARIO ' + s.number + ' / ' + s.category + '</span>' + badge(s.severity + ' impact', s.severity === 'High' ? 'impact-high' : 'neutral') + '</div><h2 id="simulation-title">' + esc(title) + '</h2><p class="trigger">' + esc(s.trigger) + '</p><div class="fixture-fields">' + fixtures() + '</div>' + diagram() + metrics + '<div class="run-toolbar"><span><span class="keyboard-label" aria-hidden="true">↵</span> Change a fixture. Rehearse again.</span><div>' + (policyId ? '<button type="button" class="button ghost" data-action="baseline">Compare baseline</button>' : '') + '<button type="button" class="button orange" data-action="run"><span class="play-icon" aria-hidden="true">▶</span>' + (policyId ? 'Test this policy' : 'Run the baseline') + '</button></div></div></section><section class="event-panel" aria-label="Simulation event trace"><div class="event-heading"><h3>Inside the rehearsal</h3><span>' + (run ? run.trace.length + ' EVENTS' : 'EVENT TRACE') + '</span></div>' + trace + '</section><details class="assumptions"><summary>What this scenario assumes <span aria-hidden="true">+</span></summary><p>' + esc(s.assumption) + '</p></details></div>';
  }
  function decisionPanel() {
    const s = spec(), saved = project.decisions[activeId];
    const tested = run && run.policyId && run.policyId === policyId;
    return '<aside class="decision-panel" aria-labelledby="decision-title"><p class="eyebrow">YOUR CALL</p><h2 id="decision-title">Make the rule<br>explicit.</h2><p class="decision-question">' + esc(s.question.replace('resource', pack().noun)) + '</p><fieldset class="policy-options"><legend class="sr-only">Choose a policy</legend>' +
      s.choices.map((choice, n) => '<label class="policy-option ' + (policyId === choice.id ? 'selected' : '') + '"><input type="radio" name="policy" value="' + choice.id + '"' + (policyId === choice.id ? ' checked' : '') + '><span class="policy-text"><strong>' + esc(choice.title) + '</strong><span>' + esc(choice.description) + '</span></span><span class="policy-letter" aria-hidden="true">' + String.fromCharCode(65 + n) + '</span></label>').join('') +
      '</fieldset><label class="note-label">Why this policy? <span>optional</span><textarea id="decision-note" rows="3" maxlength="600" placeholder="Capture the trade-off your team agreed to…">' + esc(draftNote) + '</textarea></label>' +
      '<button type="button" class="button dark save-decision" data-action="save"' + (!tested ? ' disabled' : '') + '>' + (saved ? 'Update decision' : 'Save decision') + ' <span aria-hidden="true">↗</span></button><p class="decision-hint">' + (tested ? 'This rule and its fixture will enter your brief.' : 'Choose a policy and test it before saving.') + '</p>' + (saved ? '<div class="saved-indicator"><span>✓ Decision recorded</span><button type="button" data-action="remove" data-id="' + activeId + '">Remove</button></div>' : '') + '<div class="insight-card"><span aria-hidden="true">✳</span><p>A policy is a trade-off.<br><strong>Make it deliberate.</strong></p></div></aside>';
  }
  function renderLab() {
    return header() + '<div class="lab-intro"><div><span class="tiny-square" aria-hidden="true"></span> SCENARIO LAB</div><p>Find the decisions hiding inside your idea.</p></div><div class="lab-grid">' + rail() + simulation() + decisionPanel() + '</div>';
  }
  function renderDecisions() {
    const brief = E.blueprint(project);
    return header() + '<div class="view-heading"><p class="eyebrow">THE DECISION LOG</p><h2>Your rules.<br><em>With the reasoning attached.</em></h2><p>' + count() + ' of 6 scenario decisions recorded. Change a decision whenever the product changes.</p></div>' +
      (brief.rules.length ? '<div class="decision-log">' + brief.rules.map((rule, n) => '<article class="log-card"><div class="log-card-heading"><span class="log-number">' + String(n + 1).padStart(2, '0') + '</span><div><p class="eyebrow">' + esc(rule.policy) + '</p><h3>' + esc(rule.scenario) + '</h3></div><button type="button" class="button ghost" data-edit="' + rule.id + '">Revisit ↗</button></div><p class="rule-statement">' + esc(rule.rule) + '</p>' + (rule.rationale ? '<blockquote>' + esc(rule.rationale) + '</blockquote>' : '<p class="no-note">No rationale added yet.</p>') + '<div class="log-result"><span>FIXTURE OUTCOME</span><p>' + esc(rule.then) + '</p></div></article>').join('') + '</div>' : '<div class="empty-state"><span aria-hidden="true">↳</span><h3>No rules recorded. Yet.</h3><p>Run a scenario, test a policy, and save your decision.</p><button class="button dark" data-action="lab">Go to the lab ↗</button></div>');
  }
  function renderHandoff() {
    const brief = E.blueprint(project);
    return header() + '<div class="view-heading"><p class="eyebrow">DEVELOPER HANDOFF</p><h2>Leave with a plan.<br><em>Not another vague brief.</em></h2><p>Your decisions become rules, acceptance fixtures, and a list of what remains open.</p></div><div class="handoff-grid"><div class="handoff-preview"><div class="document-bar"><span>▤ &nbsp; ' + esc(project.name) + '.md</span>' + badge(count() + '/6 decisions') + '</div><pre>' + esc(E.markdown(project)) + '</pre></div><aside class="export-panel"><p class="eyebrow">TAKE IT WITH YOU</p><h3>The developer brief</h3><p>Readable requirements, chosen policies, expected outcomes, and your rationale.</p><button class="button orange" data-export="markdown">Download brief <span>↓</span></button><button class="button ghost" data-export="cases">Acceptance cases · JSON <span>↓</span></button><button class="button ghost" data-export="project">Save editable project <span>↓</span></button><div class="export-divider"></div><h3>' + (brief.openQuestions.length ? 'Still to decide' : 'All scenarios decided') + '</h3>' + (brief.openQuestions.length ? '<ul class="open-questions">' + brief.openQuestions.map(q => '<li>' + esc(q) + '</li>').join('') + '</ul>' : '<p>Your six policies are recorded. Bring the assumptions into implementation and review.</p>') + '<div class="model-note">Acceptance cases are specifications for a developer to implement. They are not passing tests against your future application.</div></aside></div>';
  }
  function render() {
    app.innerHTML = view === 'lab' ? renderLab() : view === 'decisions' ? renderDecisions() : renderHandoff();
  }
  function switchView(next) {
    view = next; render(); closeDrawer();
    $('#workspace').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function download(type) {
    const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'scopelab';
    let body, suffix, mime;
    if (type === 'markdown') { body = E.markdown(project); suffix = '-brief.md'; mime = 'text/markdown'; }
    else if (type === 'cases') { body = JSON.stringify(E.blueprint(project), null, 2); suffix = '-acceptance-cases.json'; mime = 'application/json'; }
    else { body = JSON.stringify(project, null, 2); suffix = '-project.json'; mime = 'application/json'; }
    const url = URL.createObjectURL(new Blob([body], { type: mime }));
    const link = document.createElement('a'); link.href = url; link.download = slug + suffix;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    notify('Exported ' + (type === 'markdown' ? 'your developer brief.' : type === 'cases' ? 'your acceptance cases.' : 'an editable project backup.'));
  }
  function projectDialog(isEdit) {
    editing = isEdit;
    $('#project-dialog-title').textContent = isEdit ? 'Refine the starting point.' : 'What are you building?';
    $('#project-name').value = isEdit ? project.name : E.PACKS.hotel.project;
    $('#project-pack').value = isEdit ? project.packId : 'hotel';
    $('#project-pack').disabled = isEdit;
    $('#project-idea').value = isEdit ? project.idea : E.PACKS.hotel.idea;
    $('#project-form-hint').textContent = isEdit ? 'Your scenario decisions stay attached to this project. The pack cannot be changed after decisions are recorded.' : 'Starting a new brief replaces this browser’s current draft. Export your current project first if you want to keep it.';
    $('#project-dialog').showModal();
  }
  function closeDrawer() {
    document.body.classList.remove('drawer-open');
    $('#menu-button').setAttribute('aria-expanded', 'false');
    $('#drawer-backdrop').hidden = true;
  }
  document.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.view) switchView(target.dataset.view);
    if (target.dataset.scenario) { selectScenario(target.dataset.scenario); render(); }
    if (target.dataset.edit) { selectScenario(target.dataset.edit); switchView('lab'); }
    if (target.dataset.export) download(target.dataset.export);
    const action = target.dataset.action;
    if (action === 'edit-brief') projectDialog(true);
    if (action === 'run' || action === 'baseline') {
      run = E.simulate(project.packId, activeId, action === 'baseline' ? null : policyId, draftInput);
      render();
      notify(run.policyId ? 'Policy rehearsed. Review the trace, then save the decision.' : 'Baseline rehearsed. Inspect the outcome, then choose a policy.');
    }
    if (action === 'save' && run && run.policyId === policyId && policyId) {
      project.decisions[activeId] = { policyId, input: E.clone(run.input), note: draftNote };
      persist(); render(); notify('Decision recorded. Your developer brief has been updated.');
    }
    if (action === 'remove') {
      delete project.decisions[target.dataset.id]; persist(); selectScenario(activeId); render();
      notify('Decision removed. You can choose and save it again.');
    }
    if (action === 'lab') switchView('lab');
    if (target.classList.contains('close-dialog')) target.closest('dialog').close();
  });
  app.addEventListener('change', event => {
    if (event.target.name === 'policy') {
      policyId = event.target.value; run = null; render();
      app.querySelector('input[name="policy"]:checked')?.focus({ preventScroll: true });
    }
    if (event.target.dataset.fixture) {
      const raw = { ...draftInput, [event.target.dataset.fixture]: event.target.value };
      draftInput = E.inputs(activeId, raw); run = null;
      const save = app.querySelector('[data-action="save"]');
      if (save) save.disabled = true;
      const hint = app.querySelector('.decision-hint');
      if (hint) hint.textContent = 'Fixture changed. Test the policy again before saving.';
      const sceneState = app.querySelector('.scene-state');
      if (sceneState) sceneState.innerHTML = badge('Fixture changed · rerun required', 'review');
    }
  });
  app.addEventListener('input', event => {
    if (event.target.id === 'decision-note') draftNote = event.target.value.slice(0, 600);
  });
  $('#new-project').addEventListener('click', () => projectDialog(false));
  $('#edit-project').addEventListener('click', () => projectDialog(true));
  $('#quick-export').addEventListener('click', () => download('markdown'));
  $('#help-button').addEventListener('click', () => $('#help-dialog').showModal());
  $('#project-pack').addEventListener('change', event => {
    if (!editing) {
      $('#project-name').value = E.PACKS[event.target.value].project;
      $('#project-idea').value = E.PACKS[event.target.value].idea;
    }
  });
  $('#project-form').addEventListener('submit', event => {
    event.preventDefault();
    const name = $('#project-name').value.trim(), idea = $('#project-idea').value.trim();
    if (!name || !idea) { notify('Add a project name and a short idea.'); return; }
    if (editing) { project.name = name.slice(0, 100); project.idea = idea.slice(0, 1400); }
    else { project = E.createProject($('#project-pack').value, name, idea); selectScenario('capacity'); }
    persist(); $('#project-dialog').close(); switchView('lab');
    notify(editing ? 'Project brief updated.' : 'Your new rehearsal is ready.');
  });
  $('#import-project').addEventListener('click', () => $('#project-file').click());
  $('#project-file').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 300000) throw new Error('Project files must be smaller than 300 KB.');
      const data = JSON.parse(await file.text());
      const restored = E.validateProject(data.format === 'scopelab-brief' ? data.project : data);
      project = restored; persist(); selectScenario('capacity'); switchView('lab');
      notify('Project restored. Its saved decisions are ready to revisit.');
    } catch (error) { notify(error.message || 'Could not read that project.'); }
    event.target.value = '';
  });
  $('#menu-button').addEventListener('click', () => {
    const open = !document.body.classList.contains('drawer-open');
    document.body.classList.toggle('drawer-open', open);
    $('#menu-button').setAttribute('aria-expanded', String(open));
    $('#drawer-backdrop').hidden = !open;
  });
  $('#drawer-backdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(); });
  const applyMotion = () => {
    document.documentElement.dataset.motion = motionPaused ? 'paused' : 'playing';
    $('#motion-button').textContent = reducedMotion.matches ? 'Reduced motion' : motionPaused ? 'Play animation' : 'Pause animation';
    $('#motion-button').disabled = reducedMotion.matches;
    $('#motion-button').setAttribute('aria-pressed', String(motionPaused));
  };
  $('#motion-button').addEventListener('click', () => { motionPaused = !motionPaused; applyMotion(); });
  reducedMotion.addEventListener('change', event => { motionPaused = event.matches; applyMotion(); });
  applyMotion(); selectScenario('capacity'); render();
  $('#storage-status').textContent = storageAvailable ? 'Saved on this device' : 'Session only · export to keep';
  $('#storage-dot').classList.toggle('storage-error', !storageAvailable);
  // Exposed only as a non-mutating hook for dependency-free contract tests.
  window.ScopeLabSnapshot = () => E.clone({ project, view, activeId, policyId, draftInput, run });
})();
