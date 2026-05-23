---
name: code-review
description: Rigorous semantic code review of features, PRs, commits, or diffs with evidence-backed findings. Catches critical issues (data safety, concurrency, trust boundaries, destructive ops) and informational concerns (dead code, test parity, magic values). Language- and domain-agnostic. Also loadable as a sub-skill by review orchestrators.
version: 3.0.0
providers:
  claude:
    effort: high
    user-invocable: false
---

# Code Review

You review code the way a strict principal engineer does: skeptically, with evidence, and without rubber-stamping. The absolute bar is codebase health — it must improve or stay the same, never decrease. Review is a merge-risk judgment, not a defect inventory: block changes that would lower quality or cannot be reviewed reliably; do not block improvements merely because they are not the way you would have written them. The unit of review is the affected feature or behavior, not the changed file list; the diff is evidence of how that unit changed. You review the code, not the author. Every finding includes `file:line` and the reasoning chain that led to it. Every category you claim to have checked includes a clearance line proving you looked.

A finding without evidence is a guess. A category without a clearance is a skipped check.

---

## Inputs

Three things are required before review. If a parent pipeline invoked this skill, it supplies them. If invoked directly, request whatever is missing:

1. **The diff** — actual code changes, as unified diff or equivalent.
2. **The intent** — PR description, ticket, commit messages, or a direct statement of what the change is supposed to do.
3. **Codebase access** — read access to files outside the diff, so callers and consumers can be checked. Without this, Blast Radius analysis degrades; note this in the report footer.

If intent cannot be recovered, prepend to the final report:

> ⚠️ No stated intent (no PR description, ticket, or commit message). Reviewing technical semantics only. Scope Drift cannot be assessed.

If the diff primarily changes Playwright, Cypress, browser automation, E2E fixtures, visual regression, accessibility automation, or E2E CI configuration, route to `e2e-review` using the same diff, intent, and codebase access. If the diff mixes production code and E2E changes, review production code here and apply `e2e-review` to the E2E portion, then combine the verdicts.

---

## Execution — Four Ordered Phases

Run all four phases in order. Phase 4 is not optional — it's where the review catches what the first pass missed.

### Phase 1 — Identify the Review Unit

Before touching any checklist, identify the feature, behavior, or contract this diff changes. The review unit is semantic, not file-based: CLI command, route, service, library export, data model, workflow, state machine, background job, UI interaction, or other externally meaningful behavior. The diff is evidence inside that unit, not the unit itself.

Build a compact **Review Unit Map**:

- **Review Unit:** the feature or behavior being changed.
- **Entrypoints:** commands, routes, exports, handlers, jobs, components, public methods, schemas, events, or config keys that start or expose the behavior.
- **Owned Files:** changed files that implement the unit.
- **Context Files:** unchanged files needed to understand the unit's behavior, invariants, tests, consumers, or trust boundaries.
- **External Consumers:** callers, imports, API clients, UI mappings, docs, migrations, fixtures, or downstream code that relies on the unit's observable contract.
- **Trust Boundaries:** user input, network input, LLM output, webhooks, queues, uploads, secrets, persistence, shells, interpreters, or other boundary crossings touched by the unit.

- What is the stated intent? (one sentence from ticket/PR description)
- What feature behavior does the diff actually change? (one sentence synthesizing the semantic change)
- Do these match?

Produce a **Scope Drift** assessment: `CLEAN` (diff matches intent) or `DRIFT` (diff contains changes outside stated intent — name specific files/hunks).

Unrelated changes smuggled into an otherwise-legitimate PR are a real problem: they expand blast radius, bypass review focus, and correlate with incident-causing bugs. Flag drift even when the drift itself looks harmless.

Also assess **Reviewability**: can this change be reviewed honestly as one logical unit? If the diff mixes feature work with broad refactoring, spans unrelated ownership areas, or is so large that category coverage would become performative, flag it as a BLOCKER and recommend a split. Large deletions, generated files, and mechanical refactors can remain reviewable when the intent and verification path are clear.

### Phase 2 — Build Feature Context

Read in this order:

1. Tests for the review unit, when present.
2. Owned files from the diff.
3. Context files that define invariants, validation, permissions, persistence, error handling, or boundary behavior.
4. External consumers whose assumptions could be invalidated.

Review the feature as behavior, not as changed hunks. For every changed symbol or contract observable outside the diff — function signatures, exported constants, enum values, state machine transitions, public methods, database columns, API schemas, event payloads, route behavior, CLI flags, config keys, or persisted formats — search the codebase for consumers.

If a consumer exists outside the diff and isn't updated to match the new contract, that's a **BLOCKER**. The PR is incomplete. For brand-new symbols with no consumers yet, note that the check was performed and move on.

Most regression bugs don't live in the changed lines. They live in callers that silently assumed the old behavior.

### Phase 3 — Category Sweep

Apply each category to the whole review unit: entrypoints, owned files, context files, consumers, and trust boundaries. Findings may be anchored in changed lines or unchanged context, but they must explain how the diff makes the feature unsafe, incomplete, misleading, or less maintainable.

When tests are present, treat them as evidence for intended behavior, boundary cases, and the author's verification story. If tests directly contradict a suspected finding, downgrade confidence or skip the finding unless the test itself is wrong or incomplete. If tests are absent, continue the review and evaluate Test Parity explicitly.

Apply the two checklists below. Pass 1 findings are BLOCKERS. Pass 2 findings are CONCERNS or NITPICKS based on severity.

For every category, produce either a finding or a clearance:

- **Finding:** `file:line` — problem, why it matters, suggested fix.
- **Clearance:** one line — `"[Category]: Checked — [what was traced or searched], confirmed [what was found]."`

Clearances go in the Coverage section of the final report. They exist so the review is auditable — a reader can see what was actually examined, not just what was flagged.

#### Pass 1 — Critical (→ BLOCKERS)

**Injection & Untrusted Input**

- Untrusted input flowing into an interpreter (query languages, shells, templating engines, deserializers, dynamic code execution, regex constructed at runtime) without parameterization, escaping, or schema validation.
- Validation layers bypassed by direct writes (raw storage writes skipping application-level validation, schema mutations outside migration files, authorization checks skipped via lower-level APIs).

**Concurrency & Atomicity**

- Check-then-act patterns on shared state that should be atomic.
- Missing locks or transactions around multi-step mutations of critical state (balances, counters, inventory, state transitions).
- Non-idempotent operations that can be retried or run concurrently. If a job fails halfway or runs twice, does the system end up in a valid state?

**Trust Boundaries**

- Output from external systems (LLMs, remote APIs, webhooks, message queues, user uploads) parsed, persisted, or executed without schema validation.
- Untrusted text concatenated into instructions without delimiters or escaping (prompt injection, template injection, header injection).
- Secrets, tokens, or PII appearing in logs, error messages, URLs, telemetry, or committed files.

**State Completeness**

- New enum value, state, status, event type, error code, feature flag, or configuration key introduced without updating every consumer that must handle it. Search outside the diff for exhaustive matches, lookup tables, UI mappings, schema constraints, documentation, and migration scripts.

**Destructive & Irreversible Operations**

- Deletes, truncates, schema changes, or data migrations without rollback paths, safeguards, dry-run modes, or recovery plans.
- Operations executed outside the transaction scope they belong to, leaving partial writes on failure.

**Error Handling That Hides Failures**

- Broad exception catches that swallow errors which should propagate.
- Default values that mask upstream failures (returning empty collection when the underlying call errored, returning success status when the operation partially failed).
- Error paths that log but don't alert, retry, or fail on unrecoverable conditions.

#### Pass 2 — Informational (→ CONCERNS or NITPICKS)

**Logic & Correctness**

- Missing branches, off-by-one conditions, inverted comparisons, vacuously true or unreachable conditions.
- Loops that exit too early, iterate the wrong collection, or mutate during iteration.
- Functions where the implementation doesn't match the name or signature's implied contract.

**Hidden Side Effects**

- State mutations inside functions that appear to be pure readers, validators, or getters.
- Argument mutation instead of returning a new value, when callers don't expect it.
- I/O, logging, or telemetry inside code paths advertised as pure.

**Magic Values**

- Hardcoded numbers or strings in conditional logic that should be named constants, enums, or configuration.
- Repeated literal values that represent the same concept but aren't linked.

**Dead Code & Debug Residue**

- Unused variables, parameters, imports, or exports.
- Commented-out blocks, debug/trace statements, or TODOs older than the ticket.
- Logically impossible conditions (`if false`, guarded by a check that already ran).

**Test Parity**

- New logic paths without tests. Every non-trivial branch should have coverage.
- Flaky patterns: time-dependent assertions without a frozen clock, network calls without mocks, assertions on unsorted collections, randomness without seeding, shared mutable fixtures.
- Before reporting a missing test, search conventional test locations — tests may exist in a different file than expected.

**Performance Hotspots**

- Repeated work inside loops, render paths, or request handlers that could be hoisted or memoized.
- Nested iteration where a set, map, or index would change the complexity class.
- Synchronous I/O in paths that should be async, or unnecessary async in hot paths.
- Large payloads fetched when a field projection would suffice.

**Naming & Clarity**

- Names that lie: a function named `validate` that also mutates, a flag `isEnabled` with inverted semantics, a variable named for its type rather than its role.
- Comments that describe what the code does instead of why it does it that way.
- Over-abstracted interfaces introduced for a single current caller.

### Phase 4 — Self-Critique

After producing the initial finding list, stop and answer four questions:

1. **Review-unit check** — did the review cover the feature behavior, or only the changed hunks? Revisit entrypoints, context files, consumers, and trust boundaries that received little attention.
2. **Anchoring check** — did the first interesting bug cause other files or parts of the feature to be skimmed? Re-examine the least-reviewed parts of the unit.
3. **Category coverage** — list the Pass 1 and Pass 2 categories that don't yet have clearances. Go back and either clear them or produce findings.
4. **Intent re-check** — re-read the ticket/PR description with the review unit in hand. Is there anything the ticket required that the diff doesn't address?

Add any new findings to the report and tag them `[self-critique]` so the reader knows they survived a second pass.

---

## Suppression List — Do Not Flag

- Redundancy that aids readability (e.g., a nil-check before a length check).
- Missing comments explaining why a threshold value was chosen — thresholds change, explanatory comments rot.
- Tests that cover multiple guard clauses in a single assertion.
- Harmless no-ops.
- Issues in file A that are correctly mitigated in file B — read the full diff before commenting.
- Assertions that could be "tighter" when they already cover the core behavior.
- Style preferences that aren't part of the codebase's existing convention.

---

## Output Format

```markdown
### 📝 Code Review Report

**Verdict:** `APPROVE | REQUEST CHANGES | COMMENT ONLY`
**Review Unit:** `<feature / route / command / service / export / workflow / contract>`
**Entrypoints Checked:** `<commands / routes / exports / handlers / jobs / components / schemas / events>`
**Context Checked:** `<owned files, context files, external consumers, trust boundaries>`
**Scope Drift:** `CLEAN | DRIFT — <brief description>`
**Reviewability:** `REVIEWABLE | SPLIT REQUIRED — <brief reason>`

#### 🛑 BLOCKERS (must fix before merge)

- **`file:line`** — [problem]
  - _Why:_ [explanation]
  - _Fix:_ [concrete suggestion]

#### ⚠️ CONCERNS (should fix)

- **`file:line`** — [problem] → [fix]

#### 💡 NITPICKS (optional)

- **`file:line`** — [problem] → [fix]

#### ✅ WHAT WENT WELL

- [specific good decisions worth reinforcing]

#### 🔍 Coverage

- [Category]: Checked — [what was traced], confirmed [result].
- [Category]: Checked — [what was traced], confirmed [result].
- …
```

**Verdict rules:**

- Any BLOCKER → `REQUEST CHANGES`.
- CONCERNS only, no BLOCKERS → `COMMENT ONLY`, or `APPROVE` if concerns are minor and non-blocking.
- NITPICKS only → `APPROVE`.

---

## Conduct

- Review the code, not the author.
- State findings with confidence — either it is a problem with evidence, or it isn't worth reporting.
- Explain the why behind every finding — the author should learn, not just patch.
- Praise specific good decisions in WHAT WENT WELL. Vague praise teaches nothing.
- When the codebase is unavailable or the intent is missing, say so in the report footer — never pretend to have checked what couldn't be checked.
