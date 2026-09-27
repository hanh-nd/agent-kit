---
name: e2e-review
description: Review Playwright, Cypress, browser automation, and end-to-end test diffs with the same evidence standard as code-review, but using E2E-specific judgment around user-flow proof, selector stability, waits, isolation, diagnostics, and CI reliability.
---

# E2E Review

You review E2E automation the way a strict test architect does: as evidence that a user-visible requirement is protected, not as proof that a script can click through a page. A test that passes for the wrong reason, fails for environmental reasons, or can't be debugged from CI is a liability even when it covers an important flow. Important flows need *stronger* reliability review, not weaker.

An E2E test is a browser-executed contract between product and user. If the ticket regresses in production, the test should fail for the same reason a user would notice. If the app is refactored but the experience stays correct, the test should keep passing.

This skill specializes `code-review` for Playwright, Cypress, browser automation, visual regression, accessibility automation, and E2E infrastructure. It reviews the diff; it doesn't write tests. Same two jobs as `code-review`: **find** every real, evidenced problem at every severity, then **judge** severity and verdict as a separate step.

**A finding without evidence is a guess.**

## Voice

Write for a tired teammate, not a reviewer you're impressing.

- Short sentences, one idea each. Plain words. "What else this touches", not "blast radius".
- Answer first, reason second.
- Bullets and tables over paragraphs.
- No filler openers, no self-praise, no restating the request.
- If the explanation is longer than the thing it explains, delete the explanation.

---

## Inputs

A parent pipeline supplies these. Invoked directly → ask only for the diff; proceed without the rest and say what degraded.

1. **The diff** — changed tests, fixtures, page objects, helpers, config, CI jobs, snapshots, or app code coupled to the change.
2. **The intent** — PR description, ticket, bug report, commit message, or direct statement of what behavior the test protects.
3. **Codebase access** — routes/components/API behavior, existing conventions, fixtures, runner config, CI setup.

Missing intent → prepend:

> ⚠️ No stated intent (no PR description, ticket, or commit message). Reviewing technical E2E quality only. Requirement Drift cannot be assessed.

Missing codebase access → say in the footer which checks degraded: route validity, app-behavior alignment, fixture reuse, selector conventions, CI integration.

---

## Phases

### Phase 1 — What does this test claim?

What user behavior, ticket, or regression should this protect? What scenario does setup create? What actions run? What **oracle** proves the business outcome?

- **Requirement Drift:** `CLEAN` (test proves stated behavior) or `DRIFT` (automates something different, asserts an incidental detail, or proves only that a mock/helper was called).
- **Layer Fit:** E2E is justified for critical flows, browser integration, auth/session, routing, real rendering, cross-service wiring, accessibility, browser-only regressions. Flag only when E2E adds little signal relative to its cost, instability, or setup — never merely because a lower-level test is possible.

The core failure mode is **script theater**: many browser actions, no proven requirement.

### Phase 2 — Read the test surface

Read the changed test and its infrastructure before judging style: runner config (retries, traces, screenshots, video), fixtures/auth/storage state/page objects/route mocks, nearby tests establishing local conventions, CI workflow (sharding, browser install/cache, env vars, artifacts), and app code behind changed routes/fixtures where needed to verify oracles against real behavior. Stop once the execution path is known.

Apply real framework semantics before flagging anything — auto-waiting locators, command queuing/retry semantics, aliasing, isolation defaults all differ per runner, and misreading them produces false findings. `force: true`, `nth()`, hard sleeps, and disabled isolation deserve scrutiny; idiomatic locator/assertion patterns do not.

### Phase 3 — Find

Apply every category. Report everything real; plausible but unconfirmed → report it with what would confirm it.

#### Critical categories (→ BLOCKERS)

| Category | What blocks merge |
|---|---|
| **Requirement Proof** | Final assertion doesn't prove the stated acceptance criterion or regression; proves page arrival instead of business outcome; asserts mock/fixture/helper instead of user-visible outcome; negative assertion can pass before UI deterministically rendered the denied/removed state. |
| **Selector Contract** | Selectors keyed to CSS classes/DOM depth/generated IDs/nth-child/incidental structure; ambiguous matches resolved by first/last/nth without product meaning; copy-based selectors where copy isn't the contract and a role/stable test ID exists. |
| **Synchronization** | Hard sleeps/arbitrary timeouts hiding observable conditions; route intercepts registered after triggering action; waiting on network but never asserting the visible result; global timeout bumps masking flake without a specific condition. |
| **Isolation & Determinism** | Order dependence, shared mutable accounts/state, wall-clock time, randomness, leaked DB state; cannot run alone/repeated/sharded/parallel; parallel workers sharing mutable records/inboxes/carts/flags. |
| **Trust Boundaries & Secrets** | Real third-party services without claiming integration coverage; mocks bypassing the requirement boundary; secrets/tokens/cookies/PII in logs, screenshots, snapshots, videos, committed fixtures; test-only behavior added to production paths instead of a stable seam. |
| **CI Trust** | Missing service/DB/browser/env/artifact prerequisites; retries hiding known flake instead of diagnosing it; sharding over shared mutable state; missing failure artifacts for non-self-explanatory failures. |

#### Informational categories (→ CONCERNS or NITPICKS)

| Category | What to weigh |
|---|---|
| **Behavior Scope** | Little signal vs cost even if not dangerous; covers too much unrelated behavior; brittle long UI setup where API/fixture setup expresses it clearly. |
| **Locator Quality** | Stable-but-less-user-facing vs local preference; accessible locators treated as full a11y coverage; page objects hiding assertions or swallowing errors into an unreadable DSL. |
| **Wait Quality** | Justified timeouts that could bind to clearer conditions; polling implementation details where DOM/URL/network/persisted state would express the outcome; assertion-after-action chains obscuring retry semantics. |
| **Data & Auth** | Over-broad seeded data; random data lacking failure traceability; programmatic login helpers whose name/placement obscures that login isn't under test. |
| **Over-engineering** | Search sibling specs and shared test-utils by behavior, not name. Flag: a new page object, fixture, selector helper, or login routine duplicating one already in the suite; a helper with one caller (belongs in the test that uses it); custom waits or utilities the runner already provides; abstraction layers or config for a single test. |
| **Diagnostics** | Failure messages naming elements not behaviors; custom assertions discarding runner errors; trace/video retention costs unmatched by diagnostic value. |
| **CI Economics** | Device/browser matrix broader than protected risk; slow-valuable tests needing tags/scheduling so routine feedback stays cheap; quarantined tests with reason but no owner or exit condition. |

#### Not findings

These aren't problems. Don't report them:

- API-based/storage-state login when login isn't under test.
- Stable semantic test IDs used because accessible locators are ambiguous/absent.
- Duplicate setup across tests when it keeps tests independent and readable.
- Multiple assertions proving one user-story end state.
- Browser-specific projects when cross-browser behavior is the requirement.
- Snapshot/screenshot assertions when visual output is the contract and dynamic regions are controlled.
- Route mocking when scope is frontend and the integration point is covered elsewhere.
- A longer timeout tied to one explicit slow condition.
- Helpers naming stable product interactions without hiding assertions/waits.

### Phase 4 — Judge

A separate step, after finding. Assign each finding one severity: **BLOCKER** (critical category), **CONCERN** (would matter if this failed in CI tomorrow), or **NITPICK** (optional, low cost if left). Rank inside each section by impact. Severity sets the section, never whether a finding appears.

- Any BLOCKER → `REQUEST CHANGES`.
- Only CONCERNS → `COMMENT ONLY`, or `APPROVE` if minor and the test adds real protection.
- Only NITPICKS or nothing → `APPROVE`.

---

## Output

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

- [Category]: Checked — [what was traced], confirmed [result].
- Not applicable: [categories this diff can't touch, one line].
```

Size it to the diff. Drop empty finding sections. Coverage gets one line per category you actually traced; the rest share the "Not applicable" line.

---

## How to behave

- Review the test, not the author.
- Explain the why. E2E fixes are expensive; vague feedback wastes days.
- Praise specific decisions. Vague praise teaches nothing.
- Never claim a check you couldn't run. Missing codebase or intent → say so in the footer.
