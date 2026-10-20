# ScopeLab

ScopeLab rehearses product edge cases and turns explicit policy decisions into a
developer brief. It is a buildless browser application with three scenario packs:
hotel bookings, online stores, and appointments.

## Use

Open the published Site, run an incomplete baseline, choose a policy, test it,
and save the decision. Revisit decisions in the log. Export a Markdown brief,
acceptance cases as JSON, or an editable project backup. Project JSON can be
imported back into the app. The current draft lives in browser localStorage.
There are no third-party scripts, remote fonts, account forms, or AI API calls.

The idea text accompanies the chosen scenario pack. It does not generate new
scenarios. The six deterministic models cover capacity contention, payment
timeouts, duplicate events, cancellation value/capacity, pricing consent, and
record ownership. Every export retains its fixture inputs, expected outcomes,
policy, rationale, assumptions, and unresolved questions.

## Model boundaries

These are policy rehearsals, not real payment operations, security assessments,
or live database concurrency tests. Atomic behavior is a modeled assumption for
developers to implement and test. Acceptance exports are specifications, not
passing tests against a future application. Staff-review policies intentionally
leave operational work open.

## Checks

`node --test tests/engine.test.cjs tests/app.test.cjs`

The inference-free scenario engine can also be required directly from Node:
`require('./dist/engine.js')`. Browser DOM contract tests use dependency-free
doubles. Visual browser verification is recorded separately when available.

The first version passed 33 automated checks. Desktop browser inspection covered
the baseline capacity failure, selecting an atomic reservation policy, rerunning
the same fixture, saving a rationale, and the generated handoff. A browser
automation attempt to observe a download timed out; browser download verification
was inconclusive. Export file contents and creation were verified in contract tests.

## Source

- `dist/engine.js`: fixtures, policy models, validation, and exports
- `dist/app.js`: workspace state, local persistence, UI and file actions
- `dist/index.html`, `dist/app.css`: responsive workspace and original motion
