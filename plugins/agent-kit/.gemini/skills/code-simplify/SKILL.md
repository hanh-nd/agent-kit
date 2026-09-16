---
name: code-simplify
description: Improve readability — better names, guard clauses, dead-code removal — without changing behavior or signatures.
---

# Code Simplify

Make existing code easier to read without changing what it does or its shape from outside. Accept the design; sharpen the expression.

**Every change must earn its rent.** A rename that confuses more than it clarifies is worse than the original. An explaining variable used once is overhead. A constant for a single literal is indirection for nothing. The job is to make the next reader's life easier — not to apply changes that look like cleanup.

Simplicity is measured in reader effort, not line count. Explicit, debuggable code often beats compact code. A change whose only win is fewer lines fails rent.

## Voice

Write for a tired teammate, not a reviewer you're impressing.

- Short sentences, one idea each. Cut every word that isn't load-bearing.
- Plain words. "What else this touches", not "blast radius".
- Answer first, reason second. Never the reverse.
- Bullets and tables over paragraphs. Three bullets max per point.
- A question is one question plus one recommendation, under 5 lines.
- No filler openers, no self-praise, no restating the request back.
- If the explanation is longer than the thing it explains, delete the explanation.

## The two ways this skill fails

**Pattern-matching on hunks.** A rule like "rename `data` to something specific" only fires correctly once you've read the whole file and know what `data` holds here. Reading the diff alone produces confident-looking bad renames.

**Removing protective awkwardness.** Some code looks noisy because it encodes a boundary, an old bug, a platform quirk, or a debugging affordance. Can't say what the awkwardness protects? Don't touch it yet.

## This skill vs `code-refactor`

Different jobs, not degrees of the same job.

- `code-simplify` works **within** the structure. Signatures preserved — types, arity, side effects, error surface. Call sites untouched.
- `code-refactor` works **on** the structure. Signatures negotiable, call sites reshape together, design premise on the table.

If the real improvement needs signature changes, cross-file merges, or reversing a design choice, **stop and route out**. Don't degrade it into a within-signature half-measure.

---

## Inputs

Three things. Ask for whatever's missing:

1. **The target.** A diff, changed files, or paths. Defaults to `git diff HEAD`.
2. **Full file access**, not just the diff. File-scope context is required.
3. **Project conventions.** Infer from 2–3 unmodified files in the same module — naming, constant placement, import style.

Empty target → stop and say so.

---

## The four phases

### Phase 1 — Orient

Read each changed file **in full** before considering any change. The diff hunk is never enough.

For each file, answer internally:

- What is this file responsible for? One sentence.
- What naming conventions does it already follow?
- What constants, enums, or helpers already exist in or near this file that a change might duplicate?
- What anchors the behavior — nearby tests, callers, error paths, side effects, comments explaining the shape?
- What does the surrounding module look like? Glance at siblings. Don't read the whole codebase.

No output. This installs the context every later decision depends on. Skipping it is this skill's top failure.

### Phase 2 — Triage

Classify what's in each modified unit.

**In scope — Phase 3 applies:**

- A name lies about what it holds, misleads in context, or breaks symmetry with siblings.
- Nested conditionals that guard clauses would flatten without changing logic.
- A literal repeated in the file, or a new literal duplicating a named constant already there.
- Dead code: unused variables, commented-out blocks, stray `console.log`, impossible branches.
- Comments restating what the code does.
- Comments that contradict the code.

**Out of scope — route to `code-refactor`:**

- Wrong signature: misnamed, parameters unused at every call site, boolean flag splitting behavior, return type leaking internals.
- Two functions in the same module serving the same purpose.
- A wrapper that adds nothing.
- A parameter threaded through layers to reach one use.
- An abstraction built for flexibility that never arrived.
- Anything that changes the external interface.

**Accept and skip:**

- Redundancy that helps reading — nil-check before length check, explicit `else` after an early return where the team prefers it.
- Convention mismatches that are project-wide, not local. Don't fight the codebase.
- Style preferences with no rule behind them.
- Names that are generic *and correct here* — `data` in a data-handling function, `item` in a small loop.

**Exits:**

- Nothing in scope and nothing out of scope → `✓ Code is already clean. No changes needed.` Stop.
- Only out-of-scope items → don't simplify. Output the route-out message. Stop.
- Mixed → Phase 3 with the in-scope items, record the rest for the report.

### Phase 3 — Apply

Every change passes two checks before it goes in.

**Rent check** — *is the file actually easier to read now?* "Same, maybe different" → revert.

Before adding anything — a constant, a helper, an explaining variable — check whether one already exists in or near the file. Reuse beats introduce, every time. Then:

- An explaining variable earns rent only when the expression is reused in scope, or needs domain knowledge the reader can't get inline. One-use variables fail.
- Don't inline a named value if the name carries domain meaning, documents a business concept, or helps debugging.
- A named constant earns rent only when the literal appears 2+ times, a named version already exists in the file, or its meaning isn't obvious. A single `'PENDING'` needs no constant.
- A function extraction earns rent only when the block is duplicated in the file. "3+ coherent steps" and "describable in 4 words" are not reasons — they license speculative extraction. One caller is not a helper.
- A rename earns rent only when the original misleads *in context*. Generic names in generic contexts stay.
- Don't collapse branches that encode distinct business cases, even when the expressions combine mechanically.
- Don't prefer clever expressions over stepwise code that's easier to step through in a debugger.
- Don't delete, flatten, inline, or rename code that looks awkward until you can say what it's doing there. Unknown purpose → skip it, or log it.

**Nothing may change:**

- Parameter types, parameter count, return type.
- Side effects — mutations, I/O, logging — and what triggers them.
- Thrown errors and rejected promises, and what triggers them.
- Public exports.

Parameter *names* are internal, unless a call site uses named arguments (Python kwargs, destructuring at the call site). If one does, renaming is a call-site reshape — route out.

**Apply rules:**

- File-local only. Don't touch call sites or files outside the changed set.
- One atomic edit per change. Order within a file doesn't matter.
- Match the project's convention for constant placement. Don't invent a new one.

**Off-limits:**

- **Tests.** A test that looks wrong gets logged, not fixed. Mixing test maintenance into a readability diff makes both harder to review.
- **Performance.** A readability change that happens to be faster is fine. A change motivated by speed belongs elsewhere.
- **Bugs.** Log them, leave them. This skill's contract is that behavior is preserved — a behavior change hidden in a readability diff is invisible to a reviewer who assumes simplify diffs are safe to approve fast.

### Phase 4 — Self-review and log

Re-read each modified file as if seeing it fresh. For every change:

1. **Rent** — easier to read, or did a cleanup rule just fire?
2. **Fit** — does the new name match the file's style, or stand out?
3. **Indirection** — did I add something the reader now has to scroll to understand? Was the inline version genuinely worse?
4. **Protective awkwardness** — did I remove something whose reason I still can't explain?
5. **Nothing changed** — did any edit alter a type, a return path, or a side-effect condition?

Revert what fails. Tag reverts `[self-review]`.

Tests failing after your changes means a behavior check was violated. Revert the offending change, log it `[invariance-violation]`. The tests aren't wrong; the change was.

**The log:**

```markdown
## Simplify Log

### Files Modified

- `path/to/file.ts` — N applied, M reverted on self-review

### Applied

- **Rename:** `data` → `bookingPayload` in `createBooking()` — original misled; file handles several payload types.
- **Guard clause:** early return for null `userId` in `validateBooking()` — one less nesting level.
- **Constant reuse:** `'PENDING'` → `BOOKING_STATUS.PENDING` — already in this file, 3 other call sites.
- **Dead code:** removed unused `tempResult`, 2 debug `console.log`.
- **Comments:** deleted 4 that restated the code; kept the one explaining the Twilio retry.

### Reverted

- **[self-review]** Explaining variable `isActiveAdmin` — used once, inline reads fine.

### Route-Out to `code-refactor`

- `processOrder()` in `order.service.ts` takes a boolean `isExpress` that splits it into two behaviors. Signature-level, out of scope here.
- `getUserData()` wraps `fetchUser()` with no transformation. Collapsing it needs call-site updates.

Run `/code-refactor order.service.ts user.service.ts`.

### Tests

- Adjacent tests: `order.service.test.ts`, `booking.service.test.ts`. Run them to confirm behavior held.
- No tests for `date.utils.ts` — behavior preservation checked by review only.
```

Early exit with `No changes needed` or route-out only → the log is just that message. No empty sections.

---

## How to operate

- **Conservative by default.** Two valid paths → take the less invasive one.
- **Silence over noise.** "Nothing to simplify" is a normal, valid result. A skill that always finds something is vandalism.
- **Reviewer voice in the log.** Each entry says *why* the change earns its rent, not just what changed. The user should be able to audit it without re-reading the diff.
