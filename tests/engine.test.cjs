const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../dist/engine.js');

for (const pack of Object.keys(E.PACKS)) {
  test(pack + ': the baseline exposes overselling while policies conserve capacity', () => {
    assert.equal(E.simulate(pack, 'capacity', null).expected.remaining, -1);
    for (let capacity = 1; capacity <= 5; capacity++) {
      for (let requests = 2; requests <= 8; requests++) {
        for (const policy of ['hold', 'commit', 'queue']) {
          const { expected } = E.simulate(pack, 'capacity', policy, { capacity, requests });
          assert.ok(expected.remaining >= 0);
          assert.equal(expected.accepted + expected.remaining, capacity);
          assert.equal(expected.accepted + expected.rejected + expected.waitlisted, requests);
          if (policy !== 'queue') assert.equal(expected.waitlisted, 0);
        }
      }
    }
  });
  test(pack + ': provider timeout outcomes never create an extra policy charge', () => {
    assert.equal(E.simulate(pack, 'timeout', null, { paid: 'yes' }).expected.charges, 2);
    for (const paid of ['yes', 'no']) {
      for (const policy of ['reconcile', 'refund', 'review']) {
        const result = E.simulate(pack, 'timeout', policy, { paid });
        assert.equal(result.expected.charges, paid === 'yes' ? 1 : 0);
        assert.ok(result.expected.refunds <= result.expected.charges);
        assert.equal(result.expected.review, policy === 'review');
        assert.equal(result.expected.pending, policy === 'review');
      }
    }
    assert.equal(E.simulate(pack, 'timeout', 'refund', { paid: 'yes' }).expected.confirmed, 0);
    assert.equal(E.simulate(pack, 'timeout', 'reconcile', { paid: 'yes' }).expected.confirmed, 1);
  });
  test(pack + ': repeated deliveries have a single confirmation under every policy', () => {
    for (let deliveries = 2; deliveries <= 6; deliveries++) {
      assert.equal(E.simulate(pack, 'duplicate', null, { deliveries }).expected.records, deliveries);
      for (const policy of ['dedupe', 'transition', 'review']) {
        const out = E.simulate(pack, 'duplicate', policy, { deliveries }).expected;
        assert.equal(out.records, 1);
        assert.equal(out.duplicatesIgnored + out.reviews, deliveries - 1);
      }
    }
  });
  test(pack + ': cancellation conserves paid value and releases capacity', () => {
    assert.equal(E.simulate(pack, 'cancellation', null).expected.released, 0);
    for (const late of ['yes', 'no']) {
      for (const policy of ['cutoff', 'flexible', 'credit']) {
        const out = E.simulate(pack, 'cancellation', policy, { late }).expected;
        assert.equal(out.refund + out.fee + out.credit, 100);
        assert.equal(out.released, 1);
      }
    }
    assert.equal(E.simulate(pack, 'cancellation', 'cutoff', { late: 'yes' }).expected.fee, 25);
    assert.equal(E.simulate(pack, 'cancellation', 'cutoff', { late: 'no' }).expected.fee, 0);
  });
  test(pack + ': pricing honors quotes or waits for consent', () => {
    for (const current of [60, 100, 140]) {
      const input = { quoted: 100, current, accepts: 'no' };
      assert.equal(E.simulate(pack, 'price', 'lock', input).expected.charge, 100);
      assert.equal(E.simulate(pack, 'price', 'lower', input).expected.charge, Math.min(100, current));
      const consent = E.simulate(pack, 'price', 'consent', input).expected;
      assert.equal(consent.committed, current === 100);
      assert.equal(consent.charge, current === 100 ? 100 : 0);
      const accepted = E.simulate(pack, 'price', 'consent', { ...input, accepts: 'yes' }).expected;
      assert.equal(accepted.charge, current);
    }
  });
  test(pack + ': owner, staff, and guest access follow distinct contracts', () => {
    assert.equal(E.simulate(pack, 'ownership', null).expected.allowed, true);
    for (const viewer of ['owner', 'other', 'staff']) {
      for (const token of ['yes', 'no']) {
        assert.equal(E.simulate(pack, 'ownership', 'owner', { viewer, token }).expected.allowed, viewer === 'owner');
        assert.equal(E.simulate(pack, 'ownership', 'staff', { viewer, token }).expected.allowed, viewer === 'owner' || viewer === 'staff');
        assert.equal(E.simulate(pack, 'ownership', 'token', { viewer, token }).expected.allowed, viewer === 'owner' || token === 'yes');
      }
    }
  });
}
test('empty and complete briefs preserve open decisions honestly', () => {
  const project = E.createProject();
  assert.equal(E.blueprint(project).openQuestions.length, 6);
  for (const spec of E.SCENARIOS) project.decisions[spec.id] = { policyId: spec.choices[0].id, input: E.DEFAULTS[spec.id], note: 'Agreed by the team.' };
  const brief = E.blueprint(project);
  assert.equal(brief.coverage.decided, 6);
  assert.equal(brief.openQuestions.length, 0);
  for (const rule of brief.rules) {
    const saved = project.decisions[rule.id];
    assert.deepEqual(rule.expected, E.simulate(project.packId, rule.id, saved.policyId, saved.input).expected);
    assert.equal(rule.rationale, 'Agreed by the team.');
  }
  const restored = E.validateProject(JSON.parse(JSON.stringify(brief.project)));
  assert.deepEqual(restored.decisions, project.decisions);
  const md = E.markdown(project);
  assert.match(md, /Given:/);
  assert.match(md, /When:/);
  assert.match(md, /Then:/);
  assert.match(md, /not evidence of production correctness/);
  assert.match(md, /"accepted": 1/);
});
test('unknown packs, scenario IDs and policies are rejected', () => {
  for (const name of ['__proto__', 'constructor', 'unknown']) {
    assert.throws(() => E.createProject(name));
    assert.throws(() => E.simulate(name, 'capacity', null));
    assert.throws(() => E.validateProject({ version: 1, packId: name, name: 'x', idea: 'x' }));
  }
  assert.throws(() => E.simulate('hotel', 'unknown', null));
  assert.throws(() => E.simulate('hotel', 'capacity', 'unknown'));
  const project = E.createProject();
  project.decisions.capacity = { policyId: 'unknown' };
  assert.throws(() => E.validateProject(project));
});
test('fixture boundaries are normalized; imports cannot inject unrelated decisions', () => {
  assert.deepEqual(E.inputs('capacity', { capacity: -8, requests: 100 }), { capacity: 1, requests: 8 });
  assert.deepEqual(E.inputs('capacity', null), { capacity: 1, requests: 2 });
  assert.deepEqual(E.inputs('price', { quoted: 'bad', current: Infinity }), { quoted: 100, current: 120, accepts: 'no' });
  const project = E.createProject();
  project.decisions = JSON.parse('{"__proto__":{"polluted":true},"other":{"policyId":"fake"}}');
  assert.deepEqual(E.validateProject(project).decisions, {});
  assert.equal({}.polluted, undefined);
});
