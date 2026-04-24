---
name: code-review
version: 3.0.0
effort: max
description: |
  Domain expertise for code reviews. Provides critical/informational checklists, blast radius analysis, and logic verification for any pipeline that loads it. Used as a sub-skill by ak:review and ak:review-pr; also invocable standalone for ad-hoc diff review.
---

Whether you were loaded by a review pipeline or invoked directly: this skill injects domain expertise and three cognitive lenses. It does not define a new pipeline — it enriches how you execute whatever review workflow is already in context.

---

## Your Standard

The absolute bar is codebase health: it must improve or stay the same — never decrease. You do not accept "we'll clean it up later." You review the _code_, not the developer. Explain the _why_ behind every finding so the author learns, not just fixes.

**A passing review is demonstrated evidence that you understood what the code does, traced its execution, and verified correctness. A finding you cannot back up with a file path and a reasoning chain is a guess. A clearance with no trace is a skipped check.**

---

## Three Lenses to Apply During Every Review

### 1. Blast Radius Before Category Checking

Before pattern-matching for security or concurrency issues, search the codebase for every file that imports or calls a changed symbol. Most regression bugs aren't in the changed lines — they live in callers that silently assumed the old behavior.

If callers exist that aren't updated in the diff but are affected by the change (signature changed, export removed, behavior altered), that's a **BLOCKER** — the PR is incomplete. For brand-new code with no callers yet, note that you checked and move on.

### 2. Logic Before Patterns

Confirming no SQL injection exists doesn't tell you whether the function is correct. For each non-trivial changed function: form a mental model of what it's supposed to do (from name, signature, PR description, or calling context), then trace every branch in the full body to verify the implementation actually matches.

Look for: missing code paths, logic inversions, off-by-one errors, mutation before validation, conditions that are vacuously true, loops that exit too early.

> This is where most logic bugs live. Pattern-matching against a security checklist is not a substitute for tracing what the code actually does.

### 3. Evidence Over Assertion

For every Pass 1 and Pass 2 category, either produce a finding or an explicit clearance:

- **Finding:** `file:line` — what you saw, why it matters, suggested fix.
- **Clearance:** `"[Category]: Checked — traced X() at path:line through Y(), confirmed Z."`

---

## Pass 1: Critical Checklist (→ BLOCKERS)

Any finding here MUST be a BLOCKER and results in REQUEST CHANGES.

### SQL & Data Safety

- **String interpolation in SQL:** Flag raw string-building in queries (even with `.to_i`/`.to_f`). Demand parameterized queries.
- **Bypassing model validations:** Flag direct DB writes that skip app-level validation (Rails: `update_column`, Django: `QuerySet.update()`, Prisma raw queries).
- **N+1 queries:** Flag lazy loading inside loops. Demand eager loading or batching.
- **Schema mutations in app code:** Flag schema changes that should be in migration files.

### Race Conditions & Concurrency

- **TOCTOU:** Flag check-then-set patterns that should be atomic (`WHERE` + `update_all` instead of a single atomic operation).
- **Missing locks:** Flag unprotected mutations of shared financial or critical state.
- **Non-idempotent background jobs:** Flag jobs that mutate state without transactions or idempotency keys — if a job fails halfway, can it safely retry?

### LLM Output & Trust Boundaries

- **Unvalidated output:** Flag LLM or external API output that is parsed, executed, or persisted without schema validation (Zod, Pydantic, etc.).
- **Prompt injection:** Flag prompts that concatenate raw user input without XML tags or strict delimiters.
- **Raw eval/execution:** Flag any system that directly executes LLM-generated code without a sandboxed environment.

### Enum & Value Completeness

When a new state, enum value, or status is introduced: search files **outside** the diff for `switch` statements, frontend mappings, and DB constraints that reference it. An unhandled new value in existing code is a critical blocker.

---

## Pass 2: Informational Checklist (→ CONCERNS or NITPICKS)

### Conditional Side Effects

- Flag hidden state mutations inside functions that appear to be pure getters or validators.
- Flag direct argument mutation instead of returning a new copy (unless explicitly designed for performance).

### Magic Numbers & String Coupling

- Flag hardcoded numbers or strings in conditional logic. They should be named constants or enums.

### Dead Code

- Flag unused variables, lingering `console.log`/`debugger` statements, commented-out code blocks.
- Flag logically impossible `if` checks.

### Test Parity

- Flag new logic paths without tests. Every branch must be covered.
- Flag flaky test risks (e.g., `Time.now` without freezing, unsorted array assertions).
- Flag missing mocks for external HTTP calls.
- **Before reporting a missing test:** search for the test file — it may exist in a different location.

### LLM-Specific

- Flag vague prompt instructions ("be helpful") that should be explicit directives.
- Flag context bloat: feeding an entire file to an LLM when only a snippet is needed.

### Frontend

- Flag `O(n*m)` lookups inside render loops.
- Flag inline styles that should be CSS classes.

---

## Suppression List — Do Not Flag These

- Redundancy that aids readability (e.g., a `present?` check before a length check).
- Missing comments explaining why a threshold was chosen — thresholds change, comments rot.
- Tests that cover multiple guard clauses in one assertion.
- Harmless no-ops.
- Issues in file A that are correctly mitigated in file B (read the full diff before commenting).
- Assertions that could be "tighter" if they already cover core behavior.

---

## Output Format

```markdown
**Verdict:** `[APPROVE | REQUEST CHANGES | COMMENT ONLY]`

#### 🛑 BLOCKERS (Must Fix)

- **`file:line`** — [Problem].
  - _Why:_ [Explanation]
  - _Fix:_ [Suggested change]

#### ⚠️ CONCERNS (Should Fix)

- **`file:line`** — [Problem] → [Fix]

#### 💡 NITPICKS (Informational / Optional)

- **`file:line`** — [Problem] → [Fix]

#### ✅ WHAT WENT WELL

- [Specifically good design choices]

#### 🧩 Skill Insights

[Any additional findings from checklists, or "No additional insights."]
```
