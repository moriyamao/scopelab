const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const E = require('../dist/engine.js');
const source = fs.readFileSync(require.resolve('../dist/app.js'), 'utf8');
class Element {
  constructor() {
    this.listeners = {}; this.dataset = {}; this.attrs = {}; this.innerHTML = '';
    this.textContent = ''; this.value = ''; this.hidden = false; this.disabled = false;
    this.classes = new Set(); this.files = []; this.name = ''; this.id = '';
    this.classList = { add: s => this.classes.add(s), remove: s => this.classes.delete(s),
      contains: s => this.classes.has(s), toggle: (s, v) => v ? this.classes.add(s) : this.classes.delete(s) };
  }
  addEventListener(key, fn) { (this.listeners[key] ??= []).push(fn); }
  async fire(key, target = this, extra = {}) {
    for (const fn of this.listeners[key] ?? []) await fn({ target, preventDefault() {}, ...extra });
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  focus() {}
  closest(selector) { return selector === 'button' ? this : null; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  append() {}
  remove() {}
}
function setup({ stored, blocked = false, reduced = false } = {}) {
  const ids = ['app', 'toast', 'storage-status', 'storage-dot', 'sidebar-project-name',
    'decision-count', 'breadcrumb-view', 'workspace', 'menu-button', 'drawer-backdrop',
    'new-project', 'edit-project', 'quick-export', 'help-button', 'project-pack',
    'project-name', 'project-idea', 'project-form-hint', 'project-dialog-title',
    'project-dialog', 'project-form', 'help-dialog', 'project-file', 'import-project', 'motion-button'];
  const els = Object.fromEntries(ids.map(id => { const el = new Element(); el.id = id; return [id, el]; }));
  const dynamic = {};
  els.app.querySelector = selector => dynamic[selector] ??= new Element();
  const nav = ['lab', 'decisions', 'handoff'].map(view => { const el = new Element(); el.dataset.view = view; return el; });
  const document = new Element();
  document.body = new Element(); document.documentElement = new Element();
  document.querySelector = selector => els[selector.slice(1)];
  document.querySelectorAll = () => nav;
  const downloads = [];
  document.createElement = () => {
    const link = new Element(); link.click = () => downloads.push(link); return link;
  };
  const storage = new Map(stored ? [['scopelab-project-v1', stored]] : []);
  const localStorage = {
    getItem: key => { if (blocked) throw Error('blocked'); return storage.get(key); },
    setItem: (key, value) => { if (blocked) throw Error('blocked'); storage.set(key, value); }
  };
  const media = new Element(); media.matches = reduced;
  const window = { ScopeEngine: E, matchMedia: () => media, scrollTo() {} };
  const blobs = [];
  const URL = { createObjectURL: blob => { blobs.push(blob); return 'blob:test'; }, revokeObjectURL() {} };
  vm.runInNewContext(source, { window, document, localStorage, URL, Blob, setTimeout: () => 1, clearTimeout() {} });
  const action = async (name, data = {}) => {
    const target = new Element(); target.dataset = { action: name, ...data };
    await document.fire('click', target);
  };
  const choose = async policyId => {
    const target = new Element(); target.name = 'policy'; target.value = policyId;
    await els.app.fire('change', target);
  };
  const fixture = async (name, value) => {
    const target = new Element(); target.dataset.fixture = name; target.value = value;
    await els.app.fire('change', target);
  };
  const scenario = async id => {
    const target = new Element(); target.dataset.scenario = id;
    await document.fire('click', target);
  };
  const setView = async view => {
    const target = new Element(); target.dataset.view = view;
    await document.fire('click', target);
  };
  return { els, action, choose, fixture, scenario, setView, snapshot: window.ScopeLabSnapshot,
    storage, blobs, downloads, dynamic, document, media, nav };
}
test('initial workspace uses a real pack and does not fabricate saved decisions', () => {
  const app = setup();
  assert.equal(app.snapshot().project.packId, 'hotel');
  assert.deepEqual(app.snapshot().project.decisions, {});
  assert.match(app.els.app.innerHTML, /Run the baseline/);
  assert.match(app.els.app.innerHTML, /data-action="save" disabled/);
});
test('baseline failure and tested policy produce distinct model outcomes', async () => {
  const app = setup();
  await app.action('run');
  assert.equal(app.snapshot().run.expected.remaining, -1);
  await app.choose('hold');
  assert.equal(app.snapshot().run, null);
  await app.action('save');
  assert.deepEqual(app.snapshot().project.decisions, {});
  await app.action('run');
  assert.equal(app.snapshot().run.expected.remaining, 0);
  await app.action('save');
  assert.equal(app.snapshot().project.decisions.capacity.policyId, 'hold');
});
test('fixture edits invalidate a previously tested policy until it is rerun', async () => {
  const app = setup();
  await app.choose('queue'); await app.action('run');
  await app.fixture('requests', 6);
  assert.equal(app.snapshot().run, null);
  await app.action('save');
  assert.equal(app.snapshot().project.decisions.capacity, undefined);
  await app.action('run'); await app.action('save');
  assert.equal(app.snapshot().project.decisions.capacity.input.requests, 6);
  assert.equal(app.snapshot().run.expected.waitlisted, 5);
});
test('rationale and decisions persist and survive a fresh workspace load', async () => {
  const app = setup();
  await app.choose('hold'); await app.action('run');
  const note = new Element(); note.id = 'decision-note'; note.value = 'Reserve first.';
  await app.els.app.fire('input', note); await app.action('save');
  const next = setup({ stored: app.storage.get('scopelab-project-v1') });
  assert.equal(next.snapshot().policyId, 'hold');
  assert.equal(next.snapshot().project.decisions.capacity.note, 'Reserve first.');
  await next.setView('decisions');
  assert.match(next.els.app.innerHTML, /Reserve first/);
});
test('comparing the baseline cannot overwrite a tested saved rule', async () => {
  const app = setup();
  await app.choose('hold'); await app.action('run'); await app.action('save');
  await app.action('baseline'); await app.action('save');
  assert.equal(app.snapshot().project.decisions.capacity.policyId, 'hold');
  assert.equal(app.snapshot().run.policyId, null);
});
test('removing one decision preserves other recorded scenarios', async () => {
  const app = setup();
  await app.choose('hold'); await app.action('run'); await app.action('save');
  await app.scenario('duplicate'); await app.choose('dedupe'); await app.action('run'); await app.action('save');
  await app.action('remove', { id: 'capacity' });
  assert.equal(app.snapshot().project.decisions.capacity, undefined);
  assert.equal(app.snapshot().project.decisions.duplicate.policyId, 'dedupe');
});
test('invalid storage recovers; blocked storage keeps an exportable session', async () => {
  assert.equal(setup({ stored: '{invalid' }).snapshot().project.packId, 'hotel');
  const app = setup({ blocked: true });
  await app.choose('hold'); await app.action('run'); await app.action('save');
  assert.match(app.els['storage-status'].textContent, /Session only/);
  assert.equal(app.snapshot().project.decisions.capacity.policyId, 'hold');
});
test('all export formats include the saved decision and explicit unresolved cases', async () => {
  const app = setup();
  await app.choose('hold'); await app.action('run'); await app.action('save');
  for (const type of ['markdown', 'cases', 'project']) {
    const button = new Element(); button.dataset.export = type;
    await app.document.fire('click', button);
  }
  assert.equal(app.downloads.length, 3);
  const md = await app.blobs[0].text();
  assert.match(md, /Decisions recorded: 1\/6/);
  const cases = JSON.parse(await app.blobs[1].text());
  assert.equal(cases.rules[0].expected.accepted, 1);
  assert.equal(cases.openQuestions.length, 5);
  const saved = JSON.parse(await app.blobs[2].text());
  assert.equal(saved.decisions.capacity.policyId, 'hold');
});
test('project imports validate first and preserve the current draft on failure', async () => {
  const app = setup(), initial = app.snapshot().project.name;
  app.els['project-file'].files = [{ size: 4, text: async () => '{bad' }];
  await app.els['project-file'].fire('change');
  assert.equal(app.snapshot().project.name, initial);
  const project = E.createProject('commerce', 'Stock check', 'An online shop.');
  app.els['project-file'].files = [{ size: 100, text: async () => JSON.stringify(project) }];
  await app.els['project-file'].fire('change');
  assert.equal(app.snapshot().project.packId, 'commerce');
  assert.match(app.els.app.innerHTML, /One item/);
});
test('user-supplied text is escaped in the workspace, log, and handoff', async () => {
  const project = E.createProject('hotel', '<img src=x onerror=alert(1)>', '<script>bad()</script>');
  project.decisions.capacity = { policyId: 'hold', input: E.DEFAULTS.capacity, note: '<svg onload=bad()>' };
  const app = setup({ stored: JSON.stringify(project) });
  for (const view of ['lab', 'decisions', 'handoff']) {
    await app.setView(view);
    assert.doesNotMatch(app.els.app.innerHTML, /<img src=x|<script>bad|<svg onload/);
    assert.match(app.els.app.innerHTML, /&lt;img/);
  }
});
test('new projects use the selected pack while edits retain existing decisions', async () => {
  const app = setup();
  await app.choose('hold'); await app.action('run'); await app.action('save');
  await app.els['edit-project'].fire('click');
  app.els['project-name'].value = 'Edited brief'; app.els['project-idea'].value = 'Updated idea.';
  await app.els['project-form'].fire('submit');
  assert.equal(app.snapshot().project.decisions.capacity.policyId, 'hold');
  await app.els['new-project'].fire('click');
  app.els['project-pack'].value = 'appointments';
  app.els['project-name'].value = 'A clinic'; app.els['project-idea'].value = 'Book a time slot.';
  await app.els['project-form'].fire('submit');
  assert.equal(app.snapshot().project.packId, 'appointments');
  assert.deepEqual(app.snapshot().project.decisions, {});
});
test('OS reduced motion is respected and mobile navigation closes on Escape', async () => {
  const app = setup({ reduced: true });
  assert.equal(app.els['motion-button'].disabled, true);
  assert.equal(app.els['motion-button'].textContent, 'Reduced motion');
  await app.els['menu-button'].fire('click');
  assert.equal(app.els['menu-button'].attrs['aria-expanded'], 'true');
  await app.document.fire('keydown', app.document, { key: 'Escape' });
  assert.equal(app.els['menu-button'].attrs['aria-expanded'], 'false');
});
