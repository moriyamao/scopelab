/* Deterministic scenario models. These rehearse business policies, not real infrastructure. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScopeEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 1;
  const PACKS = {
    hotel: { name: 'Hotel booking', noun: 'room', plural: 'rooms', action: 'booking', people: ['Maya', 'Leo'], project: 'The last room problem', idea: 'A hotel booking website where guests can reserve rooms, pay online, and manage cancellations.' },
    commerce: { name: 'Online store', noun: 'item', plural: 'items', action: 'order', people: ['Alex', 'Sam'], project: 'A store that holds up', idea: 'An online store with limited stock, online payments, and customer returns.' },
    appointments: { name: 'Appointment booking', noun: 'slot', plural: 'slots', action: 'appointment', people: ['Jamie', 'Noor'], project: 'A better booking flow', idea: 'An appointment service with time slots, deposits, and cancellation policies.' }
  };
  const SCENARIOS = [
    { id: 'capacity', number: '01', title: 'Two people. One resource.', category: 'CONCURRENCY', severity: 'High', question: 'Who gets the last available resource?', trigger: 'Concurrent requests read the same availability before either commits.', assumption: 'Each request needs one resource. Requests are processed in a deterministic order for this rehearsal; no live database is involved.', given: 'Limited capacity and multiple simultaneous requests', when: 'Customers request the remaining capacity', choices: [
      { id: 'hold', title: 'Reserve on checkout', description: 'Create an atomic hold before taking payment.', rule: 'Allocate capacity atomically at checkout; reject requests when no capacity remains.' },
      { id: 'commit', title: 'First payment wins', description: 'Recheck capacity atomically when payment settles.', rule: 'Treat checkout as provisional; commit only within capacity and reverse late payments.' },
      { id: 'queue', title: 'Offer a waitlist', description: 'Reserve within capacity and queue the rest.', rule: 'Allocate capacity atomically and put excess requests on a visible waitlist.' }
    ] },
    { id: 'timeout', number: '02', title: 'The payment went quiet.', category: 'PAYMENT STATE', severity: 'High', question: 'What does a timeout mean for a paid customer?', trigger: 'The payment provider finishes, but the application never receives the response.', assumption: 'Provider outcome is supplied as a fixture. Payment calls, charges, and refunds are simulated.', given: 'A payment request times out with an unknown result', when: 'The customer attempts to continue', choices: [
      { id: 'reconcile', title: 'Reconcile before retrying', description: 'Check the provider before any new payment attempt.', rule: 'Keep an unknown payment pending and reconcile its provider status before retrying.' },
      { id: 'refund', title: 'Expire and reverse late success', description: 'Release the resource; refund a payment found later.', rule: 'Expire the reservation after timeout and reverse any subsequently confirmed payment.' },
      { id: 'review', title: 'Hold for staff review', description: 'Keep the request pending and block automatic retries.', rule: 'Block payment retries and open a staff review task for unresolved provider outcomes.' }
    ] },
    { id: 'duplicate', number: '03', title: 'The same event. Again.', category: 'IDEMPOTENCY', severity: 'High', question: 'How many confirmations should one payment create?', trigger: 'The provider delivers the same successful-payment event more than once.', assumption: 'All fixture deliveries carry the same event ID and payment ID.', given: 'Repeated deliveries of one payment event', when: 'The application processes those deliveries', choices: [
      { id: 'dedupe', title: 'Deduplicate event IDs', description: 'Persist the event ID and apply its effect once.', rule: 'Record processed provider event IDs and apply each payment event at most once.' },
      { id: 'transition', title: 'Guard the state transition', description: 'Allow one atomic pending-to-confirmed transition.', rule: 'Confirm only by an atomic pending-to-confirmed transition keyed by payment ID.' },
      { id: 'review', title: 'Queue duplicates for review', description: 'Apply the first event; send repeats to a review queue.', rule: 'Apply the first delivery once and log duplicate deliveries for staff review.' }
    ] },
    { id: 'cancellation', number: '04', title: 'Plans changed. Now what?', category: 'CANCELLATIONS', severity: 'Medium', question: 'What should a cancellation return?', trigger: 'A customer cancels, possibly after the stated cutoff.', assumption: 'The fixture amount is 100 units. The cutoff policy uses a 25-unit late fee. Resource release is modeled immediately; refund settlement time is outside this model.', given: 'A paid reservation and a cancellation request', when: 'The request arrives before or after the cancellation cutoff', choices: [
      { id: 'cutoff', title: 'Apply a clear cutoff', description: 'Full refund before cutoff; keep 25% afterward.', rule: 'Release capacity on cancellation; refund 100% before the cutoff and 75% afterward.' },
      { id: 'flexible', title: 'Allow flexible cancellation', description: 'Release capacity and refund the whole amount.', rule: 'Release capacity and issue a full refund for every accepted cancellation.' },
      { id: 'credit', title: 'Offer account credit', description: 'Release capacity and return value as credit.', rule: 'Release capacity and convert the full paid amount to customer credit on cancellation.' }
    ] },
    { id: 'price', number: '05', title: 'The price moved.', category: 'PRICING', severity: 'Medium', question: 'Which price did the customer agree to?', trigger: 'The displayed price changes while the customer is checking out.', assumption: 'Amounts use illustrative units, without tax, currency conversion, or discounts.', given: 'A quoted price and a different current price', when: 'The customer commits the purchase', choices: [
      { id: 'lock', title: 'Honor the quote', description: 'Keep the price shown when checkout began.', rule: 'Charge the checkout quote, including after a price change, for the life of the quote.' },
      { id: 'consent', title: 'Ask for fresh consent', description: 'Show the new total and require acceptance.', rule: 'Require explicit acceptance of a changed total before committing a payment.' },
      { id: 'lower', title: 'Give the lower price', description: 'Honor the lower of the quote and current price.', rule: 'Charge the lower of the original quote and the current price at checkout.' }
    ] },
    { id: 'ownership', number: '06', title: 'A different person’s ID.', category: 'ACCESS CONTROL', severity: 'High', question: 'Who may open a reservation?', trigger: 'Someone changes the record ID in a request.', assumption: 'Records, roles, and tokens are synthetic. This checks a policy model, not the security of a deployed application.', given: 'A private record and a requester with an identity and role', when: 'The requester asks for that record by ID', choices: [
      { id: 'owner', title: 'Owner access only', description: 'Scope the record query to its authenticated owner.', rule: 'Read private records only through a query matching both record ID and current owner ID.' },
      { id: 'staff', title: 'Owner or authorized staff', description: 'Verify ownership or an explicit staff permission.', rule: 'Permit the record owner or an authorized staff role; deny other authenticated users.' },
      { id: 'token', title: 'Owner or scoped guest link', description: 'Accept a valid, record-bound guest token.', rule: 'Permit the owner or a valid record-bound guest token; deny requests without either.' }
    ] }
  ];
  const DEFAULTS = {
    capacity: { capacity: 1, requests: 2 }, timeout: { paid: 'yes' },
    duplicate: { deliveries: 3 }, cancellation: { late: 'yes' },
    price: { quoted: 100, current: 120, accepts: 'no' },
    ownership: { viewer: 'other', token: 'no' }
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const hasPack = id => Object.prototype.hasOwnProperty.call(PACKS, id);
  function scenario(id) {
    const value = SCENARIOS.find(item => item.id === id);
    if (!value) throw new Error('Unknown scenario');
    return value;
  }
  const integer = (value, min, max, fallback) => {
    if (value === '' || value === null || value === undefined) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
  };
  function inputs(id, data = {}) {
    scenario(id);
    data = data && typeof data === 'object' ? data : {};
    if (id === 'capacity') return { capacity: integer(data.capacity, 1, 5, 1), requests: integer(data.requests, 2, 8, 2) };
    if (id === 'duplicate') return { deliveries: integer(data.deliveries, 2, 6, 3) };
    if (id === 'price') return { quoted: integer(data.quoted, 1, 10000, 100), current: integer(data.current, 1, 10000, 120), accepts: data.accepts === 'yes' ? 'yes' : 'no' };
    if (id === 'ownership') return { viewer: ['owner', 'other', 'staff'].includes(data.viewer) ? data.viewer : 'other', token: data.token === 'yes' ? 'yes' : 'no' };
    if (id === 'cancellation') return { late: data.late === 'no' ? 'no' : 'yes' };
    return { paid: data.paid === 'no' ? 'no' : 'yes' };
  }
  function simulate(packId, id, policyId, raw = {}) {
    if (!hasPack(packId)) throw new Error('Unknown simulation pack');
    const pack = PACKS[packId];
    const spec = scenario(id);
    const policy = policyId ? spec.choices.find(item => item.id === policyId) : null;
    if (policyId && !policy) throw new Error('Unknown policy');
    const data = inputs(id, raw);
    const trace = [];
    const event = (title, detail, tone = 'neutral') => trace.push({ title, detail, tone });
    let expected = {}, metrics = [], summary = '', level = 'resolved';
    const metric = (label, value) => ({ label, value });
    if (id === 'capacity') {
      event('Requests arrive together', data.requests + ' requests compete for ' + data.capacity + ' available ' + (data.capacity === 1 ? pack.noun : pack.plural) + '.');
      if (!policy) {
        event('Each request reads availability', 'Every request sees the original capacity before any write completes.');
        expected = { accepted: data.requests, remaining: data.capacity - data.requests, waitlisted: 0, rejected: 0 };
        const excess = Math.max(0, -expected.remaining);
        event('Independent writes commit', expected.accepted + ' ' + pack.action + 's are accepted.', excess ? 'risk' : 'neutral');
        level = excess ? 'risk' : 'resolved';
        summary = excess ? 'Capacity was exceeded by ' + excess + '. The availability check and commit were separate.' : 'This fixture fits, but the separate check-and-write policy remains unsafe under greater contention.';
      } else {
        const accepted = Math.min(data.requests, data.capacity), excess = data.requests - accepted;
        const waitlisted = policyId === 'queue' ? excess : 0;
        expected = { accepted, remaining: data.capacity - accepted, waitlisted, rejected: excess - waitlisted };
        event(policyId === 'commit' ? 'Payments compete for capacity' : 'Capacity is allocated atomically', accepted + (accepted === 1 ? ' request claims' : ' requests claim') + ' capacity without exceeding it.', 'resolved');
        event('Remaining requests get an explicit outcome', waitlisted ? waitlisted + (waitlisted === 1 ? ' request enters' : ' requests enter') + ' the waitlist.' : excess + (excess === 1 ? ' request is' : ' requests are') + (policyId === 'commit' ? ' declined; late successful payments must be reversed.' : ' declined before taking payment.'), 'resolved');
        summary = policyId === 'queue' ? 'Capacity holds. Excess customers have a visible waiting state.' : 'Capacity holds. ' + expected.rejected + (expected.rejected === 1 ? ' request cannot commit.' : ' requests cannot commit.');
      }
      metrics = [metric('Accepted', expected.accepted), metric('Remaining', expected.remaining), metric(policyId === 'queue' ? 'Waitlisted' : 'Declined', policyId === 'queue' ? expected.waitlisted : expected.rejected)];
    } else if (id === 'timeout') {
      const paid = data.paid === 'yes';
      event('Customer submits payment', 'The provider receives one simulated payment attempt.');
      event('The response is lost', paid ? 'The provider succeeded, but the application does not know that yet.' : 'The provider failed, but the application has no response.');
      if (!policy) {
        expected = { charges: paid ? 2 : 0, confirmed: paid ? 1 : 0, refunds: 0, pending: false, review: false };
        event('The application retries blindly', paid ? 'A second successful attempt creates a second charge.' : 'This fixture has no successful charge.', paid ? 'risk' : 'neutral');
        level = paid ? 'risk' : 'review';
        summary = paid ? 'One intended purchase produced two simulated charges.' : 'No charge occurred in this fixture. An unknown timeout still needs reconciliation.';
      } else {
        expected = { charges: paid ? 1 : 0, confirmed: policyId === 'reconcile' && paid ? 1 : 0, refunds: policyId === 'refund' && paid ? 1 : 0, pending: policyId === 'review', review: policyId === 'review' };
        event(policyId === 'review' ? 'Create a staff review task' : 'Reconcile provider status', policyId === 'review' ? 'Block retries; a person must resolve this request.' : paid ? 'Find the original successful payment.' : 'Confirm that the provider failed.', policyId === 'review' ? 'review' : 'resolved');
        event('Apply the chosen policy', policyId === 'refund' ? (paid ? 'Cancel the reservation and reverse the late payment.' : 'Release the reservation; no refund is needed.') : policyId === 'review' ? 'Keep the request visibly pending.' : paid ? 'Confirm once using the original payment.' : 'Return a failed-payment state; a fresh attempt may now be offered.', 'resolved');
        level = policyId === 'review' ? 'review' : 'resolved';
        summary = policyId === 'review' ? 'No blind retry. This policy deliberately needs a staffed review process.' : 'The provider outcome is handled before another attempt can charge.';
      }
      metrics = [metric('Charges', expected.charges), metric('Confirmed', expected.confirmed), metric('Refunds', expected.refunds)];
    } else if (id === 'duplicate') {
      const seen = new Set();
      let records = 0, reviews = 0, confirmed = false;
      event('A successful payment event arrives', 'Event evt-001 refers to payment pay-001.');
      for (let n = 0; n < data.deliveries; n++) {
        if (!policy) records++;
        else if (policyId === 'dedupe') { if (!seen.has('evt-001')) records++; seen.add('evt-001'); }
        else if (policyId === 'transition') { if (!confirmed) records++; confirmed = true; }
        else if (n === 0) records++; else reviews++;
      }
      event('The provider redelivers the event', data.deliveries + ' deliveries share the same event and payment IDs.');
      event(policy ? 'Apply the event guard' : 'Apply every delivery independently', records + ' confirmation records created.' + (reviews ? ' ' + reviews + ' duplicates need review.' : ''), records > 1 ? 'risk' : 'resolved');
      expected = { records, duplicatesIgnored: policyId && policyId !== 'review' ? data.deliveries - 1 : 0, reviews };
      level = records > 1 ? 'risk' : reviews ? 'review' : 'resolved';
      summary = records > 1 ? 'One payment created duplicate confirmation records.' : reviews ? 'One confirmation remains, with an explicit review workload.' : 'All deliveries produce one confirmation.';
      metrics = [metric('Deliveries', data.deliveries), metric('Confirmations', records), metric('Review tasks', reviews)];
    } else if (id === 'cancellation') {
      event('A paid customer cancels', 'The original payment was 100 illustrative units.');
      event('Check the cancellation window', data.late === 'yes' ? 'The request is after the published cutoff.' : 'The request is before the published cutoff.');
      let refund = 100, fee = 0, credit = 0, released = policy ? 1 : 0;
      if (policyId === 'cutoff' && data.late === 'yes') { refund = 75; fee = 25; }
      if (policyId === 'credit') { refund = 0; credit = 100; }
      expected = { refund, fee, credit, released };
      event('Apply the value policy', refund + ' refunded / ' + fee + ' fee / ' + credit + ' account credit.', 'neutral');
      event('Update capacity', released ? 'Return the resource to availability.' : 'The baseline forgets to release the resource.', released ? 'resolved' : 'risk');
      level = released ? 'resolved' : 'risk';
      summary = released ? 'Capacity is released and all 100 units have a documented destination.' : 'The refund is recorded, but the cancelled resource stays unavailable.';
      metrics = [metric('Refund', refund), metric('Fee / credit', fee + credit), metric('Released', released)];
    } else if (id === 'price') {
      event('Customer sees a quote', data.quoted + ' illustrative units are displayed.');
      event('The current price changes', 'Current price is now ' + data.current + '.');
      let charge = data.current, consentRequired = false, committed = true;
      if (policyId === 'lock') charge = data.quoted;
      if (policyId === 'lower') charge = Math.min(data.quoted, data.current);
      if (policyId === 'consent' && data.current !== data.quoted) {
        consentRequired = true; committed = data.accepts === 'yes';
        if (!committed) charge = 0;
      }
      expected = { charge, consentRequired, committed };
      const silent = !policy && data.current !== data.quoted;
      event(silent ? 'Commit without confirming the change' : consentRequired ? 'Request fresh acceptance' : 'Apply the agreed pricing rule', committed ? 'Commit ' + charge + ' units.' : 'No payment commits while acceptance is missing.', silent ? 'risk' : 'resolved');
      level = silent ? 'risk' : !committed ? 'review' : 'resolved';
      summary = silent ? 'The final amount differs from the displayed quote without fresh acceptance.' : !committed ? 'Checkout waits for acceptance of the changed total.' : 'The charged amount follows the chosen pricing policy.';
      metrics = [metric('Quote', data.quoted), metric('Current', data.current), metric('Committed total', charge)];
    } else {
      event('A private record is requested', 'A synthetic requester supplies another record ID.');
      event('Identify the requester', data.viewer === 'owner' ? 'The requester owns the record.' : data.viewer === 'staff' ? 'The requester has an authorized staff role.' : 'The requester is a different customer.');
      const allowed = !policy || data.viewer === 'owner' || (policyId === 'staff' && data.viewer === 'staff') || (policyId === 'token' && data.token === 'yes');
      expected = { allowed, status: allowed ? 200 : 403, requiresOwnerCheck: !!policy };
      event('Apply access policy', allowed ? 'The synthetic record is returned.' : 'Deny the request without returning record contents.', !policy && data.viewer === 'other' ? 'risk' : 'resolved');
      level = !policy && data.viewer === 'other' ? 'risk' : 'resolved';
      summary = !policy ? 'The baseline checks only the record ID, leaving access uncontrolled.' : allowed ? 'Access is permitted by the explicitly selected policy.' : 'This requester does not satisfy the access policy.';
      metrics = [metric('Requester', data.viewer), metric('HTTP status', expected.status), metric('Access', allowed ? 'Allowed' : 'Denied')];
    }
    return { packId, scenarioId: id, policyId: policyId || null, input: data, trace, expected, metrics, summary, level };
  }
  function createProject(packId = 'hotel', name, idea) {
    if (!hasPack(packId)) throw new Error('Unknown pack');
    return { version: VERSION, packId, name: String(name || PACKS[packId].project).trim().slice(0, 100), idea: String(idea || PACKS[packId].idea).trim().slice(0, 1400), decisions: {}, updatedAt: new Date().toISOString() };
  }
  function validateProject(data) {
    if (!data || typeof data !== 'object' || data.version !== VERSION || !hasPack(data.packId) || typeof data.name !== 'string' || typeof data.idea !== 'string') throw new Error('This is not a supported ScopeLab project.');
    const project = createProject(data.packId, data.name, data.idea);
    if (data.decisions && typeof data.decisions === 'object') {
      for (const spec of SCENARIOS) {
        const saved = Object.prototype.hasOwnProperty.call(data.decisions, spec.id) ? data.decisions[spec.id] : null;
        if (!saved) continue;
        if (!spec.choices.some(choice => choice.id === saved.policyId)) throw new Error('Project includes an unknown policy.');
        project.decisions[spec.id] = { policyId: saved.policyId, input: inputs(spec.id, saved.input), note: String(saved.note || '').slice(0, 600) };
      }
    }
    return project;
  }
  function blueprint(rawProject) {
    const project = validateProject(rawProject);
    const cases = SCENARIOS.filter(spec => project.decisions[spec.id]).map(spec => {
      const decision = project.decisions[spec.id], choice = spec.choices.find(item => item.id === decision.policyId);
      const run = simulate(project.packId, spec.id, decision.policyId, decision.input);
      return { id: spec.id, scenario: spec.title, policy: choice.title, rule: choice.rule, rationale: decision.note, given: spec.given, when: spec.when, then: run.summary, input: run.input, expected: run.expected, trace: run.trace, assumption: spec.assumption };
    });
    return { format: 'scopelab-brief', version: VERSION, project, coverage: { decided: cases.length, total: SCENARIOS.length }, rules: cases, openQuestions: SCENARIOS.filter(spec => !project.decisions[spec.id]).map(spec => spec.question), limits: 'Deterministic fixtures rehearse policy choices. Acceptance cases are specifications, not evidence of production correctness, security, or concurrency guarantees.' };
  }
  function markdown(project) {
    const brief = blueprint(project);
    const lines = ['# ' + brief.project.name, '', brief.project.idea, '', 'Simulation pack: ' + PACKS[project.packId].name, 'Decisions recorded: ' + brief.coverage.decided + '/' + brief.coverage.total, '', '## Business rules'];
    brief.rules.forEach((rule, n) => {
      lines.push('', '### ' + (n + 1) + '. ' + rule.scenario, '', '**Policy:** ' + rule.policy, '', rule.rule);
      if (rule.rationale) lines.push('', '**Rationale:** ' + rule.rationale);
      lines.push('', '**Given:** ' + rule.given, '**When:** ' + rule.when, '**Then:** ' + rule.then, '', '**Fixture:**', '', '```json', JSON.stringify({ input: rule.input, expected: rule.expected }, null, 2), '```', '', '**Model assumption:** ' + rule.assumption);
    });
    lines.push('', '## Open decisions', '', ...(brief.openQuestions.length ? brief.openQuestions.map(question => '- ' + question) : ['All six scenario decisions are recorded.']), '', '## Boundaries', '', brief.limits, '', 'Generated by ScopeLab.');
    return lines.join('\n');
  }
  return { VERSION, PACKS, SCENARIOS, DEFAULTS, inputs, simulate, createProject, validateProject, blueprint, markdown, clone };
});
