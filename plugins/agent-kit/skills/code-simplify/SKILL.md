---
name: ak:code-simplify
version: 1.0.0
description: Improve the readability and clarity of code within its existing structure — better names, guard clauses, dead-code removal, magic-value consolidation, comment hygiene — without changing external behavior or signatures. Use whenever the user wants to clean up current code changes, polish a function, tighten a diff, or says "simplify this", "clean this up", "make this readable", "reduce noise". Distinct from `ak:code-refactor`: this skill preserves the structure; `ak:code-refactor` questions the structure. If a change requires altering a function signature, merging functions across files, or reversing a design decision, this skill routes out to `ak:code-refactor` rather than forcing a fit.
---

# Code Simplify

Improve the readability of existing code without changing what it does or how it's shaped externally. Accept the design; sharpen the expression.

**Core thesis:** every change must earn its rent. A rename that confuses more than it clarifies is worse than the original. An explaining variable used once is overhead without benefit. A constant introduced for a single-use literal adds indirection for no gain. The skill's job is to apply changes that make the next reader's life easier — not to apply changes that look like cleanup.

**The primary failure mode this skill guards against is pattern-matching on hunks.** A rule like "rename `data` to something specific" fires correctly only when you've read the whole file and understand what `data` holds in context. Reading the diff hunk alone produces confident-looking bad renames.

## Relationship to `ak:code-refactor`

These skills are orthogonal, not a spectrum.

- `ak:code-simplify` works **within** the current structure. Signatures preserved (external ABI: types, arity, observable side effects, error surface). Call sites untouched.
- `ak:code-refactor` works **on** the current structure. Signatures negotiable, call sites reshape atomically, design premise on the table.

If triage reveals that the real improvement requires signature changes, cross-file merges, or reversing a design choice, this skill **stops and routes out** rather than degrading the change into a within-signature half-measure.

---

## Inputs

Three things are needed. If invoked directly, request what's missing:

1. **The target.** A diff, a set of changed files, or explicit paths. Defaults to staged + unstaged changes (`git diff HEAD`).
2. **Read access to the full files**, not just the diff. File-scope context is required.
3. **Project conventions.** Read `.agent-kit/project.md` if it exists. Otherwise infer from 2–3 non-modified files in the same module. Conventions matter for naming, constant placement, and import style.

If the target is empty, stop and tell the user.

---

## Execution — Four Ordered Phases

### Phase 1 — Orient

Read each changed file **in full** before considering any change. The diff hunk is never enough.

For each file, internally answer:

- What is this file's responsibility? (one sentence)
- What naming conventions does the file already follow? (camelCase, what kinds of names for what kinds of values)
- What constants, enums, or helpers already exist in or near this file that a new change might duplicate?
- What does the surrounding module look like? (glance at sibling files if helpful — do not read the whole codebase)

This phase produces no output. Its purpose is to install the context that every later decision depends on. Skipping it is the skill's top failure mode.

### Phase 2 — Triage

For each modified unit, classify what's present. Use these categories — and only flag items that belong to each:

**Simplify-in-scope (Phase 3 applies):**

- Name lies about what a value holds, misleads in its context, or breaks symmetry with siblings.
- Nested conditionals where guard clauses would flatten without changing logic.
- Literal value repeated within the file, or a new literal that duplicates an existing named constant elsewhere in the file.
- Dead code: unused variables, commented-out blocks, `console.log` not part of intentional logging, logically impossible branches.
- Comments that restate what the code does in English ("What" comments).
- Comments that contradict the current code.

**Simplify-out-of-scope — route to `ak:code-refactor`:**

- Function signature is wrong (misnamed, parameters unused at all call sites, boolean flag splitting the function into two behaviors, return type leaks implementation detail).
- Two functions in the same file or module that serve the same domain purpose.
- A wrapper that adds nothing (forwards arguments unchanged).
- Parameter threaded through layers to reach one usage site.
- Abstraction introduced for flexibility that never materialized.
- Any change that would alter external ABI.

**Do nothing:**

- Redundancy that aids readability (nil-check before length check; explicit `else` after an early `return` that some teams prefer).
- Established convention mismatches that are project-wide, not local. Don't fight the codebase.
- Style preferences not grounded in a specific rule the project enforces.
- Names that are generic _and correct in context_ (`data` in a data-handling function; `item` in a small loop body).

**Triage exits:**

- If the unit has zero simplify-in-scope items and zero out-of-scope items → `✓ Code is already clean. No changes needed.` Stop.
- If the unit has only out-of-scope items → do not simplify. Surface them as a route-out message (see Phase 4 output). Stop.
- If mixed → proceed to Phase 3 with the in-scope items; record the out-of-scope items for the report.

### Phase 3 — Apply (with rent check and invariance)

Apply changes in place. Every change must pass two checks before it goes in:

**Rent check** — ask for each change: _is the file actually easier to read after this?_ If the answer is "same, maybe slightly different," revert the change. Specifically:

- An explaining variable is only warranted when (a) the expression is reused in scope, or (b) the expression requires domain knowledge the reader can't derive inline. One-use explaining variables fail rent.
- A named constant is only warranted when (a) the literal appears 2+ times in the file, (b) a named version already exists elsewhere in the file that should be reused, or (c) the literal's meaning isn't self-evident from context. A single-use `'PENDING'` in a status assignment does not need a constant.
- A function extraction is only warranted when the logic block is duplicated in the file. "3+ steps with coherent purpose" and "describable in 4 words" are not sufficient reasons — they license speculative extraction.
- A rename is only warranted when the original name is misleading _in its context_. Generic names in generic contexts can stay.

**Invariance check** — the following must not change:

- Function parameter types, parameter count, return type.
- Observable side effects (mutations, I/O, logging) and the conditions that trigger them.
- Thrown errors or rejected promises and the conditions that trigger them.
- Public exports.

Parameter _names_ are internal unless a call site uses named arguments. If any call site uses named arguments (Python kwargs, TypeScript destructuring at the call site), the rename is a call-site reshape — route out, do not apply here.

**Apply rules:**

- Changes are file-local. Do not modify call sites or files outside the changed set.
- Order within a file is not meaningful — apply each change as its own atomic edit.
- Match the project's existing convention for constant placement (top of file, `constants.ts`, etc.). Do not invent a new convention.

### Phase 4 — Self-Review and Log

After all changes are applied, re-read each modified file as if seeing it for the first time. For each change you made, ask:

1. **Rent re-check** — does this change actually make the file easier to read, or does it just look like a cleanup rule fired?
2. **Context fit** — does the renamed identifier fit the file's broader naming style, or does it stand out?
3. **Introduced indirection** — did I add an explaining variable, constant, or helper that the reader now has to scroll to understand? If yes, was the inlined version genuinely worse?
4. **Invariance re-check** — did any edit accidentally change a type, a return path, or a side-effect condition?

Revert any change that fails self-review. Reverts tagged `[self-review]` in the log.

**Produce the log:**

```markdown
## Refactor Log

### Files Modified

- `path/to/file.ts` — N changes applied, M reverted on self-review
- ...

### Changes Applied

- **Rename:** `data` → `bookingPayload` in `createBooking()` — original misled in context (file handles multiple payload types).
- **Guard clause:** early-return for null `userId` in `validateBooking()` — removed one nesting level.
- **Constant reuse:** inline `'PENDING'` → `BOOKING_STATUS.PENDING` — constant already exists in same file (3 other call sites).
- **Dead code:** removed unused `tempResult`, 2 debug `console.log`.
- **Comment hygiene:** deleted 4 "What" comments; kept 1 "Why" comment explaining Twilio retry.

### Changes Reverted on Self-Review

- **[self-review]** Explaining variable `isActiveAdmin` — used once, inlined version reads clearly in context.

### Route-Out to `ak:code-refactor`

- `processOrder()` in `order.service.ts` takes a boolean `isExpress` that splits the function into two different behaviors. This is a signature-level issue — outside simplify's scope.
- `getUserData()` wraps `fetchUser()` with no transformation. Wrapper collapse requires call-site updates.

Run `/code-refactor order.service.ts user.service.ts` to address these.

### Test Status

- Adjacent test files found: `order.service.test.ts`, `booking.service.test.ts`.
- Run them to confirm behavior preservation. No tests found for `date.utils.ts` — behavior-preservation verified by code review only.
```

If the triage exited early with `No changes needed` or route-out-only, the log is just the relevant message — no empty sections.

---

## What this skill does NOT do

- **Does not change signatures.** Parameter types, count, return type, names-when-call-sites-use-them: all untouched. Route to `ak:code-refactor`.
- **Does not merge or split functions.** Cross-function shape is structural, not expressive.
- **Does not introduce new abstractions.** No new helpers, no new base classes, no new patterns. If you want one, `ak:code-refactor` is the tool.
- **Does not modify tests.** If a test is wrong, that's a separate concern.
- **Does not optimize performance.** Readability over micro-performance.
- **Does not fix bugs.** If a bug is noticed during simplify, log it in the report and leave the code unchanged.
- **Does not touch untouched files.** Scope is the changed set plus its immediate context for reads only.

## Operating principles

- **Conservative by default.** When two cleanup paths are valid, take the less invasive one.
- **Silence over noise.** "Nothing to simplify" is a perfectly valid and common result. A skill that always finds something to change is vandalism.
- **Reviewer voice in the log.** Each change entry says _why_ this change earns its rent, not just _what_ changed. The user should be able to audit each decision without re-reading the diff.
