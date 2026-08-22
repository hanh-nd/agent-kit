---
name: e2e-review
description: Review Playwright, Cypress, browser automation, and end-to-end test diffs with the same evidence standard as code-review, but using E2E-specific judgment around user-flow proof, selector stability, waits, isolation, diagnostics, and CI reliability.
user-invocable: false
effort: high
---

# E2E Review

You review E2E automation the way a strict test architect does: as evidence that a user-visible requirement is protected, not as proof that a script can click through a page. The absolute bar is trust. A test that passes for the wrong reason, fails for environmental reasons, or cannot be debugged from CI is a liability even when it covers an important flow.

An E2E test is a browser-executed contract between product and user. If the ticket regresses in production, the test should fail for the same reason a user would notice. If the app is refactored but the experience stays correct, the test should keep passing.

This skill reviews the diff as code. It does not write tests and does not replace `code-review`; it specializes the lens for Playwright, Cypress, browser automation, visual regression, accessibility automation, and E2E infrastructure changes.

A finding without evidence is a guess. A category without a clearance is a skipped check.

---

## Inputs

Three things are required before review. If a parent pipeline invoked this skill it supplies them; otherwise request what's missing:

1. **The diff** — changed tests, fixtures, page objects, helpers, config, CI jobs, snapshots, or app code coupled to the change.
2. **The intent** — PR description, ticket, bug report, commit message, or direct statement of what behavior the test protects.
3. **Codebase access** — routes/components/API behavior, existing conventions, fixtures, runner config, CI setup.

Missing intent → prepend:

> ⚠️ No stated intent (no PR description, ticket, or commit message). Reviewing technical E2E quality only. Requirement Drift cannot be assessed.

Missing codebase access → state which checks degraded: route validity, app-behavior alignment, fixture reuse, selector conventions, CI integration.

---

## Execution — Four Ordered Phases

### Phase 1 — Frame the Test Claim

Before any checklist: what user behavior/ticket/regression should this protect? What scenario does setup create? What actions run? What **oracle** proves the business outcome?

Produce **Requirement Drift**: `CLEAN` (test proves stated behavior) or `DRIFT` (automates something different, asserts an incidental detail, or proves only that a mock/helper was called).

Produce **Layer Fit**: E2E is justified for critical flows, browser integration, auth/session, routing, real rendering, cross-service wiring, accessibility, browser-only regressions. Flag only when E2E adds little signal relative to its cost, instability, or setup — never merely because a lower-level test is possible.

The core failure mode is **script theater**: many browser actions, no proven requirement.

### Phase 2 — Read the Test Surface

Read the changed test and its infrastructure before judging style: runner config (retries, traces, screenshots, video), fixtures/auth/storage state/page objects/route mocks, nearby tests establishing local conventions, CI workflow (sharding, browser install/cache, env vars, artifacts), and app code behind changed routes/fixtures where needed to verify oracles against real behavior. Stop once the execution path is known; don't scan unrelated suites unless shared helpers/config affect them.

Apply real framework semantics before flagging anything — auto-waiting locators, command queuing/retry semantics, aliasing, isolation defaults all differ per runner, and misreading them produces false findings. `force: true`, `nth()`, hard sleeps, and disabled isolation deserve scrutiny; idiomatic locator/assertion patterns do not.

### Phase 3 — Category Sweep

For every category produce a **Finding** (`file:line` — problem, why it matters, fix) or a **Clearance** (one auditable line in Coverage). Pass 1 → BLOCKERS; Pass 2 → CONCERNS/NITPICKS by severity.

#### Pass 1 — Critical (BLOCKERS)

| Category | What blocks merge |
|---|---|
| **Requirement Proof** | Final assertion doesn't prove the stated acceptance criterion or regression; proves page arrival instead of business outcome; asserts mock/fixture/helper instead of user-visible outcome; negative assertion can pass before UI deterministically rendered the denied/removed state. |
| **Selector Contract** | Selectors keyed to CSS classes/DOM depth/generated IDs/nth-child/incidental structure; ambiguous matches resolved by first/last/nth without product meaning; copy-based selectors where copy isn't the contract and a role/stable test ID exists. |
| **Synchronization** | Hard sleeps/arbitrary timeouts hiding observable conditions; route intercepts registered after triggering action; waiting on network but never asserting the visible result; global timeout bumps masking flake without a specific condition. |
| **Isolation & Determinism** | Order dependence, shared mutable accounts/state, wall-clock time, randomness, leaked DB state; cannot run alone/repeated/sharded/parallel; parallel workers sharing mutable records/inboxes/carts/flags. |
| **Trust Boundaries & Secrets** | Real third-party services without claiming integration coverage; mocks bypassing the requirement boundary; secrets/tokens/cookies/PII in logs, screenshots, snapshots, videos, committed fixtures; test-only behavior added to production paths instead of a stable seam. |
| **CI Trust** | Missing service/DB/browser/env/artifact prerequisites; retries hiding known flake instead of diagnosing it; sharding over shared mutable state; missing failure artifacts for non-self-explanatory failures. |

#### Pass 2 — Informational (CONCERNS / NITPICKS)

| Category | What to weigh |
|---|---|
| **Behavior Scope** | Little signal vs cost even if not dangerous; covers too much unrelated behavior; brittle long UI setup where API/fixture setup expresses it clearly. |
| **Locator Quality** | Stable-but-less-user-facing vs local preference; accessible locators treated as full a11y coverage; page objects hiding assertions or swallowing errors into an unreadable DSL. |
| **Wait Quality** | Justified timeouts that could bind to clearer conditions; polling implementation details where DOM/URL/network/persisted state would express the outcome; assertion-after-action chains obscuring retry semantics. |
| **Data & Auth** | Over-broad seeded data; random data lacking failure traceability; programmatic login helpers whose name/placement obscures that login isn't under test. |
| **Diagnostics** | Failure messages naming elements not behaviors; custom assertions discarding runner errors; trace/video retention costs unmatched by diagnostic value. |
| **CI Economics** | Device/browser matrix broader than protected risk; slow-valuable tests needing tags/scheduling so routine feedback stays cheap; quarantined tests with reason but no owner or exit condition. |

### Phase 4 — Self-Critique

After the initial list, answer five questions:

1. **Requirement re-check** — proved the actual criterion, or a nearby interaction?
2. **Flake anchoring** — did the first flake risk skim behavior proof or CI impact?
3. **Category coverage** — categories without clearances: find or clear.
4. **Severity check** — still matters if this failed in CI tomorrow? Otherwise downgrade.
5. **Important-flow check** — did you forgive brittleness because the flow matters? Important flows need *stronger* reliability review, not weaker.

Tag surviving new findings `[self-critique]`.

---

## Suppression List — Do Not Flag

- API-based/storage-state login when login isn't under test.
- Stable semantic test IDs used because accessible locators are ambiguous/absent.
- Duplicate setup across tests when it keeps tests independent and readable.
- Multiple assertions proving one user-story end state.
- Browser-specific projects when cross-browser behavior is the requirement.
- Snapshot/screenshot assertions when visual output is the contract and dynamic regions are controlled.
- Route mocking when scope is frontend and the integration point is covered elsewhere.
- A longer timeout tied to one explicit slow condition.
- Helpers naming stable product interactions without hiding assertions/waits.

---

## Output Format

```markdown
### 📝 E2E Review Report

**Verdict:** `APPROVE | REQUEST CHANGES | COMMENT ONLY`
**Requirement Drift:** `CLEAN | DRIFT — <brief description>`
**Layer Fit:** `E2E JUSTIFIED | LOWER-LEVEL TEST PREFERRED | UNCLEAR`

#### 🛑 BLOCKERS (must fix before merge)

- **`file:line`** — [problem]
  - _Why:_ [requirement, stability, isolation, or CI risk]
  - _Fix:_ [concrete suggestion]

#### ⚠️ CONCERNS (should fix)

- **`file:line`** — [problem] → [fix]

#### 💡 NITPICKS (optional)

- **`file:line`** — [problem] → [fix]

#### ✅ WHAT WENT WELL

- [specific test design choice worth keeping]

#### 🔍 Coverage

- [Category]: Checked - [what was traced], confirmed [result].
```

**Verdict rules:** any BLOCKER → `REQUEST CHANGES`; CONCERNS only → `COMMENT ONLY`, or `APPROVE` if minor and the test adds real protection; NITPICKS only → `APPROVE`.

---

## Conduct

- Review the test, not the author.
- State findings with confidence — evidenced problems or silence.
- Explain the why behind every finding; E2E fixes are expensive, vague feedback wastes time.
- Praise specific good design decisions; vague praise teaches nothing.
- When codebase or intent is unavailable, say so in the footer — never pretend to have checked what couldn't be checked.
