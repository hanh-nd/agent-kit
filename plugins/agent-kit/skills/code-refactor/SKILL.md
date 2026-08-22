---
name: code-refactor
version: 1.0.0
description: Analyze structure and produce a Refactor Proposal. Analysis only; no files modified.
---

## Core thesis

**Reachable behavior is preserved. Structure is negotiable. The design premise itself is on the table.**

This skill does not find things to clean up. It asks whether the current shape of a component is the right shape, and proposes structural changes when it isn't. Surface-level smells are treated as evidence, not as the thing to fix.

The skill's primary failure mode is **bottom-up cataloguing**: listing four symptoms, proposing four independent fixes, and missing that all four trace back to one upstream design decision. Guard against this above all else. Premise-first diagnosis is what makes this skill different from `code-simplify`, not "being bolder."

The second failure mode is **cowardly compatibility**: preserving a bad internal interface because changing call sites feels disruptive. If the signature, dependency direction, wrapper, or module boundary is the disease, the refactor should break and reshape that internal surface atomically. Compatibility is sacred only at hard-stop surfaces: public exports, HTTP routes, webhook callbacks, event/message schemas, database fields, reflection targets, feature flags, and user-protected files.

## Relationship to `code-simplify`

These skills are orthogonal, not a spectrum.

- `code-simplify` operates **within** the current structure. Accept the design, improve the expression. Signatures preserved, call sites untouched.
- `code-refactor` operates **on** the current structure. Question the design, reshape it if wrong. Signatures negotiable, call sites reshape atomically.

A piece of code can need either, both, or neither. They do not interpolate.

If a user request is fundamentally about code expression (long method, unclear variable names, dedup within a function, style), route to `code-simplify`. If it involves questioning whether the current decomposition is right, this skill applies.

## When to use

- "Refactor this component / module / file / directory / diff"
- "Clean up / restructure / modernize / untangle / rethink this code"
- "This signature is wrong" / "too many parameters" / "this name lies"
- "This abstraction leaks" / "why is X taking Y as a parameter"
- "Collapse these wrapper layers" / "merge these similar functions"
- "Remove the old X now that Y is done"
- User points at code and asks "is this design right?" or "what's wrong with this?"

## Prerequisites

1. **Topological boundary.** The user specifies what to look at as paths, globs, files, or a specific diff — not as semantic domains. Legacy code bleeds across semantic lines. If the user gives a semantic boundary ("the billing domain"), translate it to paths and confirm.

2. **Awareness of test coverage.** Note whether tests exist for the boundary. Their presence or absence directly affects the confidence tier of every proposed change — a HIGH-confidence proposal on an untested surface is a contradiction.

3. **codebase-dna artifact (optional).** If available, read it — it provides component context that prevents hallucinated call relationships. If not, read files directly during Phase 1.

4. **Feature-flag evidence (only if flag cleanup is in scope).** The user must explicitly state "Flag X is retired" or "fully rolled out as of [date]." Require explicit user confirmation of flag state — it lives in production, not in config files.

## The four phases

### Phase 1 — Survey

Build a map of the component. For each key symbol in the boundary:

- What does it do (one sentence)?
- Who calls it?
- Who does it call?
- What external surfaces does it expose (exports, HTTP handlers, event listeners, schemas, reflection targets)?

Use deterministic tools where available (`rg`, `grep`, language servers, `tsc`, `ts-prune`, `knip`, `vulture`, `gopls`) to find callers — do not rely on naming conventions. If no tools are available, read files.

**For boundaries over ~10 files:** do not attempt to deep-survey every symbol. Survey everything shallowly first (file responsibilities, exports, obvious call relationships), then identify the 5–10 **load-bearing symbols** — widely called, central to the boundary's purpose, or exposed as external surface — and survey those deeply. Skim the rest: what does it do, is it reached from outside the boundary. Deep-surveying every symbol in a 50-file boundary produces a map that's exhaustive and useless. The load-bearing symbols are where design decisions live; the rest inherits from them.

Phase 1's output is an internal map. Keep it internal — present only if the user asks.

### Phase 2 — Diagnose (premise-first)

**Step 2.0 — Premise check. Do this before anything else.**

Ask: _what is this component trying to accomplish, and is the current shape the right way to accomplish it?_

Then, before listing individual issues, force this question: _are there multiple symptoms in this boundary that trace back to one upstream design decision?_

Examples of the pattern to look for:

- Four places duplicate the same transform → **one upstream decision** (a helper doesn't exist, or the helper is in the wrong module) causes all four.
- A class takes a dependency it never uses directly, just to pass it down → **one upstream decision** (the dependency is injected at the wrong layer) causes the leak.
- Two code paths do similar work with different patterns → **one upstream decision** (an API shape) forces the divergence.
- A parameter is threaded through four layers → **one upstream decision** (state lives in the wrong place) causes the threading.

When you find a root-cause decision, propose **reversing that decision** as the primary refactor. Individual symptom-fixes become either unnecessary or trivial consequences. Do not catalogue the symptoms separately — list them as _consequences_ of the root cause.

**Root-cause reversal bar:** Reverse the wrong decision directly. Do not preserve the old shape with adapters, wrappers, option flags, compatibility layers, or "temporary" dual paths unless the old shape crosses a hard-stop surface. Inside the confirmed boundary, migrate callers atomically and delete the wrong shape.

If no single upstream decision explains multiple symptoms, then — and only then — fall back to cataloguing individual issues.

**Step 2.1 — Individual structural issues (only after the premise check).**

Look for these categories, but only list items that survive premise-check (i.e., are not already absorbed by a root-cause refactor):

_Signature problems:_

- Name lies about what the function does
- Parameters unused at all call sites
- Parameter order confusing or inconsistent with siblings
- Boolean flag parameter that splits the function into two different behaviors
- Return type leaks implementation detail the caller shouldn't know about

_Shape problems:_

- Wrapper that adds nothing (forwards arguments with no transformation)
- Abstraction introduced for flexibility that never materialized
- Near-duplicate functions serving the same domain purpose
- A function doing two unrelated things
- Parameter threaded through layers to reach one usage site
- Dependency injected into a class that never uses it directly

_Dead code:_

- Exported symbol with zero callers (static language only)
- Branch behind a condition that cannot be true (retired feature flag, user-confirmed)
- Unused import, unreachable code after `return`/`throw`

**Out of scope for this skill:**

- "Old-looking" style — that's `code-simplify`'s job
- Long functions without signature problems — that's `code-simplify`'s job
- "Could use a design pattern here" — speculative abstractions are the #1 refactor failure mode
- Defensive code without evidence of unreachability

**"Nothing meaningful to refactor" is a valid diagnosis.** A refactor skill that always finds something is a vandal. If the premise is sound and no structural issues survive, say so directly in Phase 3.

### Phase 3 — Propose

The proposal's shape depends on what Phase 2 found. There are three cases, not two.

**Case A — Root-cause decision only, no residuals.** Lead with prose, not a table. Explain the upstream decision, why it's wrong, what the reversal looks like, and how the downstream symptoms become free consequences. Example shape:

> The 2nd parameter on `createPublicBooking` is the wrong abstraction. Encryption is a test-setup concern and doesn't belong in the booking service. If you push the encrypted card into the payload at the call site, three things happen for free: the duplicated transform disappears, the VCC/regular inconsistency disappears (both use the same pattern), and the `apiEverVault` constructor leak in management services disappears (the service no longer needs to build encrypted payloads internally).
>
> Proposed change: remove the 2nd parameter from `createPublicBooking`, `createChangeBooking`, `cancelBooking`, and `createHopperBooking`. Call sites pass `creditCard: { ...encryptedCard.cardToken, isEncrypted: true }` in the payload directly. Optionally, add `FinanceService.toEncryptedCardPayload(res, extra?)` as a one-liner to cover the VCC case with `chargeableAmount`.

This is reviewer voice — a senior engineer explaining the real fix, not a cataloguer producing a severity matrix.

**Case B — Root cause AND residual independent issues.** Lead with the root-cause prose as in Case A. Then, underneath, add a short residuals section for the items the reversal does NOT absorb. Do not mix them — the root cause is the headline; the residuals are a follow-up note. Example shape:

> [root-cause prose, as in Case A]
>
> **Residual items (not absorbed by the reversal):**
>
> | Change                                       | Files touched | Confidence | Why                                |
> | -------------------------------------------- | ------------- | ---------- | ---------------------------------- |
> | Rename `processStuff` → `reconcileInventory` | `stock.ts`    | HIGH       | Name lies; unrelated to root cause |
> | Remove unused `debug` param from `logAudit`  | `audit.ts`    | HIGH       | Zero callers pass it               |

The residuals table follows the same confidence-tier rules as Case C. Keep it short — if the residuals table is longer than the root-cause prose, reconsider whether you actually found a root cause or whether it's really Case C.

**Case C — Bag of independent issues, no root cause.** List them as numbered refactor items, each with a confidence tier. Tables are appropriate for the top-level scan, but multi-file suggestions need stable IDs so the user can approve, reject, or delegate them independently. Example shape:

| ID | Refactor                                          | Files touched            | Confidence | Why                                                 |
| -- | ------------------------------------------------- | ------------------------ | ---------- | --------------------------------------------------- |
| R1 | Remove unused `retryCount` param from `fetchUser` | `user.ts` + 7 call sites | HIGH       | Static, tool-confirmed zero usage                   |
| R2 | Collapse `getUserData` wrapper around `fetchUser` | `user.ts` + 3 call sites | MEDIUM     | Wrapper adds no transformation                      |
| R3 | Delete `legacyAuthFallback` function              | `auth.ts`                | LOW        | Exported, dynamic language, unprovable reachability |

For any item touching multiple files, crossing a module boundary, or requiring sequencing, add a short detail block under the table:

```
#### R2 — Collapse `getUserData` wrapper

**Files:** `user.ts`, `profile.ts`, `orders.ts`
**Call sites:** 3
**Change:** Replace wrapper calls with direct `fetchUser` calls and delete the wrapper.
**Risk:** Medium — wrapper is internal, but call sites span 2 modules.
**Verification:** `npm test -- user`
```

**Confidence tiers:**

- **HIGH**: static language + deterministic tool confirms + tests cover the surface
- **MEDIUM**: some ambiguity — dynamic language, partial test coverage, or indirection
- **LOW**: speculative abstraction change, similar-looking-function merge, possible-reflection-target deletion. Always require explicit per-item sign-off.

**Case D — Nothing to refactor.** State this directly. Explain what the premise check found (the design is sound) and what the individual sweep found (no structural issues survive). A clean bill of health needs no padding — do not produce a table or list to justify the conclusion. Skip Phase 4.

**For every proposal**, state concrete numbers: "7 call sites," not "several." Vagueness is how silent drift starts.

Present the proposal and stop. This skill's output is a structured proposal — source files are not modified. Implementation is carried out separately by the user or the `code` skill.

### Phase 4 — Report

Wrap the proposal in a structured header and output it.

```markdown
## 🧱 Refactor Proposal

**Boundary:** `[files / paths analyzed]`
**Case:** `A root cause only | B root cause + residuals | C independent issues | D nothing to refactor`
**Refactors Proposed:** `[N]`
**Confidence:** `HIGH | MEDIUM | LOW | mixed`
**Hard Stops:** `[items requiring explicit per-item sign-off] | none`
**Follow-ups:** `[suggested next steps] | none`

### 🔁 Root-Cause Reversal

[For Case A or B: proposal body from Phase 3. Explain the wrong upstream decision, the reversal, and the concrete call-site/module changes.]

### 🧭 Refactor Index

| ID | Refactor | Files | Call Sites | Confidence | Why |
| :-- | :-- | :-- | :-- | :-- | :-- |
| R1 | [short imperative change] | `[file list or count]` | `[N]` | `HIGH/MEDIUM/LOW` | [one-line evidence] |
| R2 | [short imperative change] | `[file list or count]` | `[N]` | `HIGH/MEDIUM/LOW` | [one-line evidence] |

[Use this for Case B residuals and all Case C items. For Case A with one root-cause reversal, omit this section unless it helps summarize multiple affected file groups.]

### 🧩 Refactor Details

#### R1 — [Refactor name]

**Files:** `[concrete files]`
**Call sites:** `[N]`
**Change:** [specific structural change]
**Risk:** [what could break and why]
**Verification:** [test command or manual check]

[Repeat one subsection per item that needs detail. Omit detail subsections for trivial one-line HIGH-confidence items.]

### 🛑 Hard Stops

- `[surface requiring explicit sign-off]` — [why implementation cannot proceed without explicit approval]
- `none`

### 🔍 Evidence Checked

- **Call sites:** `[N]` checked via `[tool/manual trace]`
- **Tests:** `[coverage found / no coverage found]`
- **External surfaces:** `[exports/routes/events/schemas/reflection targets checked]`

### ✅ Recommended Next Step

[One concrete next action, such as "Run code-refactor implementation through the code skill after approving the hard-stop items" or "No refactor recommended."]
```

If a section is not applicable, omit it unless the omission would hide a risk. Do not output empty placeholder sections. For Case D, output only the metadata, a short `### ✅ Result` section, and evidence checked.

## Hard stops — require explicit per-item sign-off

Halt at Phase 3 and flag these. General "looks good" approval is insufficient.

- Public package exports
- HTTP route handlers, webhook callbacks, event listeners, message consumers
- Database schemas, migration files, ORM model fields mapped to columns
- Cross-service contracts: message schemas, event payloads, gRPC/protobuf
- Reflection targets, dynamic dispatch, codegen inputs
- Feature flags without user-provided rollout evidence
- Anything the user marks "do not touch"

## Language confidence tiers

**Static (TypeScript, Go, Rust, Kotlin, Java, Swift, C#):** dead-code and signature-refactor claims can reach HIGH when the language server confirms.

**Dynamic (JS without TS, Python, Ruby):** no symbol reachable from outside a module exceeds MEDIUM. Exported symbols default to UNCERTAIN — never deleted without the user explicitly saying "I've confirmed X is dead."

## Common pitfalls

1. **Cataloguer voice when reviewer voice is needed.** If Phase 2 found a root cause, Phase 3 must lead with prose that names the wrong decision and its reversal. Tables are for residuals or bags of independent changes, not root-cause refactors. Producing a severity matrix when the real answer is "the 2nd parameter shouldn't exist" is the exact failure this skill is designed to avoid.

2. **Speculative abstraction.** "I could extract this into a strategy pattern" → almost always wrong. Only propose new abstractions when 3+ concrete uses demand it.

3. **Pattern-matching on syntax, not semantics.** Two functions that look similar may serve different domain purposes. Merging them creates a god-function with a boolean flag.

4. **Cowardly compatibility.** Keeping the old signature plus adding a new helper often preserves the disease. If no hard-stop surface requires compatibility, migrate callers and remove the old shape.

5. **"Unused" that isn't.** A function with no static callers may be reached via DI containers, route registries, plugin loaders, reflection. Follows the dynamic-language tier rule above: UNCERTAIN, never deleted without explicit user confirmation.

6. **Defensive-code removal.** A null check that "seems unnecessary" often catches a real production edge case. Require evidence of unreachability, not aesthetic judgment.

7. **Feature-flag removal from config.** Require explicit user confirmation that the flag is retired — flag state lives in production, not in `config.yaml` or `launchdarkly.json`.
