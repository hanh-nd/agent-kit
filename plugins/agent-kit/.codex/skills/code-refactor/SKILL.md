---
name: code-refactor
description: Analyze structure and produce a Refactor Proposal. Analysis only; no files modified.
---

# Code Refactor

**Behavior stays. Structure is negotiable. The design premise is on the table.**

This skill doesn't hunt for things to clean up. It asks whether a component is the right shape, and proposes a new one when it isn't. Surface smells are evidence, not the thing to fix.

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

**Cataloguing from the bottom up.** Listing four symptoms, proposing four fixes, and missing that all four come from one upstream decision. Guard against this above everything else. Premise-first diagnosis is what makes this skill different from `code-simplify` — not "being bolder".

**Cowardly compatibility.** Keeping a bad internal interface because changing call sites feels disruptive. If the signature, dependency direction, wrapper, or module boundary is the disease, break and reshape it in one move. Compatibility is sacred only at hard-stop surfaces: public exports, HTTP routes, webhook callbacks, event and message schemas, database fields, reflection targets, feature flags, and files the user marked off-limits.

## This skill vs `code-simplify`

Different jobs, not degrees of the same job.

- `code-simplify` works **within** the structure. Accept the design, improve how it reads. Signatures preserved, call sites untouched.
- `code-refactor` works **on** the structure. Question the design, reshape it if it's wrong. Signatures negotiable, call sites reshape together.

Code can need either, both, or neither.

A request about how code reads — long method, unclear names, dedup inside a function, style — goes to `code-simplify`. A request that questions whether the decomposition is right belongs here.

## When to use

- "Refactor this component / module / file / directory / diff"
- "Clean up / restructure / modernize / untangle this code"
- "This signature is wrong" / "too many parameters" / "this name lies"
- "This abstraction leaks" / "why does X take Y"
- "Collapse these wrappers" / "merge these similar functions"
- "Remove the old X now that Y is done"
- User points at code: "is this design right?"

## Before you start

1. **Paths, not domains.** The user names files, globs, paths, or a diff. Legacy code bleeds across domain lines. Given a domain ("the billing domain"), translate it to paths and confirm.
2. **Know the test coverage.** Tests present or absent decides the confidence tier of every proposal. HIGH confidence on an untested surface is a contradiction.
3. **codebase-dna, if it exists.** Read it — it prevents invented call relationships. Otherwise read files directly in Phase 1.
4. **Feature-flag evidence, only if flag cleanup is in scope.** The user must say "Flag X is retired" or "fully rolled out as of [date]". Flag state lives in production, not in config files.

---

## The four phases

### Phase 1 — Survey

Map the component. For each key symbol in the boundary:

- What does it do, in one sentence?
- Who calls it?
- What does it call?
- What does it expose — exports, HTTP handlers, event listeners, schemas, reflection targets?

Use real tools to find callers (`rg`, language servers, `tsc`, `ts-prune`, `knip`, `vulture`, `gopls`). Never rely on naming conventions. No tools available → read the files.

**Over ~10 files:** don't deep-survey everything. Skim it all first — file responsibilities, exports, obvious calls — then pick the 5–10 **load-bearing symbols** (widely called, central, or externally exposed) and survey those deeply. For the rest: what does it do, is it reached from outside. Deep-surveying every symbol in a 50-file boundary gives you a map that's exhaustive and useless. Design decisions live in the load-bearing symbols.

Phase 1's map stays internal. Show it only if asked.

### Phase 2 — Diagnose, premise first

**Step 2.0 — Check the premise. Before anything else.**

Ask: *what is this component for, and is the current shape the right way to do it?*

Then, before listing issues: *do several symptoms here trace back to one upstream decision?*

What that looks like:

- Four places duplicate the same transform → **one decision**: the helper doesn't exist, or lives in the wrong module.
- A class takes a dependency it never uses, just to pass it down → **one decision**: it's injected at the wrong layer.
- Two paths do similar work differently → **one decision**: an API shape forces the split.
- A parameter threaded through four layers → **one decision**: state lives in the wrong place.

Found one? Propose **reversing that decision** as the primary refactor. The symptom fixes become unnecessary or trivial. List them as *consequences*, not as separate items.

**Reverse it directly.** No adapters, wrappers, option flags, compatibility layers, or "temporary" dual paths — unless the old shape crosses a hard stop. Inside the boundary, migrate callers together and delete the wrong shape.

No single decision explains multiple symptoms? Only then fall back to cataloguing.

**Step 2.1 — Individual issues, after the premise check.**

List only what the root-cause reversal doesn't already absorb.

*Signature problems:*

- Name lies about what it does
- Parameters unused at every call site
- Parameter order confusing, or inconsistent with siblings
- Boolean flag that splits the function into two behaviors
- Return type leaks something the caller shouldn't know

*Shape problems:*

- Wrapper that adds nothing
- Abstraction built for flexibility that never arrived
- Near-duplicate functions serving the same purpose
- One function doing two unrelated things
- Parameter threaded through layers to reach one use
- Dependency injected into a class that never uses it

*Dead code:*

- Exported symbol with zero callers (static languages only)
- Branch behind a condition that can't be true — retired flag, user-confirmed
- Unused import, code after `return`/`throw`

**Not this skill's job:**

- "Old-looking" style → `code-simplify`
- Long functions with fine signatures → `code-simplify`
- "A design pattern would fit here" → speculative abstraction is the #1 refactor failure
- Defensive code with no evidence it's unreachable

**Before proposing any new helper, module, or abstraction:** search for one that already exists — by behavior, not by name. Check the nearest `utils/`, `lib/`, `shared/`, and sibling modules. "The helper doesn't exist" is a valid root cause; "I didn't look" is not. A new abstraction needs 3+ concrete callers already in the boundary.

**"Nothing meaningful to refactor" is a real diagnosis.** A refactor skill that always finds something is a vandal. Premise sound and no issues survive → say so in Phase 3.

### Phase 3 — Propose

Four cases.

**Case A — Root cause only, nothing left over.** Lead with prose, not a table. Name the wrong decision, why it's wrong, what reversing it looks like, and which symptoms disappear for free:

> The 2nd parameter on `createPublicBooking` is the wrong abstraction. Encryption is a test-setup concern and doesn't belong in the booking service. Push the encrypted card into the payload at the call site and three things fix themselves: the duplicated transform disappears, the VCC/regular inconsistency disappears, and the `apiEverVault` constructor leak disappears.
>
> Change: drop the 2nd parameter from `createPublicBooking`, `createChangeBooking`, `cancelBooking`, `createHopperBooking`. Call sites pass `creditCard: { ...encryptedCard.cardToken, isEncrypted: true }` directly.

That's reviewer voice — a senior engineer naming the real fix, not a cataloguer building a severity matrix.

**Case B — Root cause plus leftovers.** Root-cause prose first, as in Case A. Then a short leftovers section for what the reversal doesn't absorb. Don't mix them — the root cause is the headline.

> **Leftovers (not absorbed by the reversal):**
>
> | Change | Files | Confidence | Why |
> | :-- | :-- | :-- | :-- |
> | Rename `processStuff` → `reconcileInventory` | `stock.ts` | HIGH | Name lies; unrelated to root cause |
> | Drop unused `debug` param from `logAudit` | `audit.ts` | HIGH | Zero callers pass it |

If the leftovers table is longer than the root-cause prose, you probably didn't find a root cause. It's Case C.

**Case C — Independent issues, no root cause.** Numbered items with confidence tiers and stable IDs, so the user can approve or reject each one.

| ID | Refactor | Files | Confidence | Why |
| -- | -- | -- | -- | -- |
| R1 | Drop unused `retryCount` from `fetchUser` | `user.ts` + 7 call sites | HIGH | Tool-confirmed zero usage |
| R2 | Collapse `getUserData` wrapper | `user.ts` + 3 call sites | MEDIUM | Wrapper adds no transformation |
| R3 | Delete `legacyAuthFallback` | `auth.ts` | LOW | Exported, dynamic language, unprovable |

Anything touching multiple files, crossing a module boundary, or needing sequencing gets a detail block:

```
#### R2 — Collapse `getUserData` wrapper

**Files:** `user.ts`, `profile.ts`, `orders.ts`
**Call sites:** 3
**Change:** Replace wrapper calls with direct `fetchUser` calls, delete the wrapper.
**Risk:** Medium — wrapper is internal, but call sites span 2 modules.
**Verify:** `npm test -- user`
```

**Confidence tiers:**

- **HIGH** — static language, tool-confirmed, tests cover the surface
- **MEDIUM** — some ambiguity: dynamic language, partial coverage, or indirection
- **LOW** — speculative abstraction change, similar-function merge, possible reflection target. Always needs per-item sign-off.

**Case D — Nothing to refactor.** Say it directly. What the premise check found (design is sound), what the sweep found (nothing survives). A clean bill of health needs no padding — no table, no list. Skip Phase 4.

**Always give real numbers.** "7 call sites", not "several". Vague is how silent drift starts.

Present and stop. This skill proposes; it doesn't modify source. Implementation goes to the user or the `code` skill.

### Phase 4 — Report

```markdown
## 🧱 Refactor Proposal

**Boundary:** `[files / paths]`
**Case:** `A root cause | B root cause + leftovers | C independent issues | D nothing to refactor`
**Proposed:** `[N]`
**Confidence:** `HIGH | MEDIUM | LOW | mixed`
**Hard stops:** `[items needing sign-off] | none`
**Follow-ups:** `[next steps] | none`

### 🔁 Root-Cause Reversal

[Case A or B: the wrong decision, the reversal, the concrete call-site changes.]

### 🧭 Refactor Index

| ID | Refactor | Files | Call sites | Confidence | Why |
| :-- | :-- | :-- | :-- | :-- | :-- |
| R1 | [imperative change] | `[files or count]` | `[N]` | `HIGH/MEDIUM/LOW` | [one-line evidence] |

[Case B leftovers and all Case C items. Omit for a single Case A reversal.]

### 🧩 Details

#### R1 — [name]

**Files:** `[files]`
**Call sites:** `[N]`
**Change:** [the structural change]
**Risk:** [what breaks and why]
**Verify:** [command or manual check]

[One per item needing detail. Skip for trivial HIGH-confidence one-liners.]

### 🛑 Hard Stops

- `[surface]` — [why this needs explicit approval]
- `none`

### 🔍 Evidence

- **Call sites:** `[N]` via `[tool or manual trace]`
- **Tests:** `[coverage found / none]`
- **External surfaces:** `[exports/routes/events/schemas/reflection checked]`

### ✅ Next Step

[One concrete action.]
```

Omit sections that don't apply, unless omitting hides a risk. Never output empty placeholders. Case D gets metadata, a short `### ✅ Result`, and evidence — nothing else.

---

## Hard stops — need per-item sign-off

Halt at Phase 3 and flag these. "Looks good" is not enough.

- Public package exports
- HTTP routes, webhook callbacks, event listeners, message consumers
- Database schemas, migrations, ORM fields mapped to columns
- Cross-service contracts: message schemas, event payloads, gRPC/protobuf
- Reflection targets, dynamic dispatch, codegen inputs
- Feature flags with no rollout evidence from the user
- Anything the user marked "do not touch"

## Confidence by language

**Static** (TypeScript, Go, Rust, Kotlin, Java, Swift, C#): dead-code and signature claims can reach HIGH when the language server confirms.

**Dynamic** (JS without TS, Python, Ruby): nothing reachable from outside a module goes above MEDIUM. Exported symbols are UNCERTAIN — never deleted unless the user says "I've confirmed X is dead".

## Common mistakes

1. **Cataloguer voice where reviewer voice belongs.** Found a root cause? Lead with prose naming the wrong decision. Tables are for leftovers and bags of independent changes. A severity matrix when the real answer is "the 2nd parameter shouldn't exist" is the exact failure this skill exists to prevent.
2. **Speculative abstraction.** "I could extract a strategy pattern here" → almost always wrong. 3+ concrete uses, or don't.
3. **Rebuilding what exists.** Proposing a new helper without searching for the one three files over.
4. **Matching on syntax, not meaning.** Two similar-looking functions may serve different purposes. Merging them makes a god-function with a boolean flag.
5. **Cowardly compatibility.** Old signature plus a new helper usually preserves the disease. No hard stop in the way → migrate callers, delete the old shape.
6. **"Unused" that isn't.** No static callers doesn't mean unreachable — DI containers, route registries, plugin loaders, reflection. Dynamic language → UNCERTAIN, never deleted without confirmation.
7. **Removing defensive code.** A null check that "seems unnecessary" often catches a real production case. Evidence, not aesthetics.
8. **Flag removal from config.** The user confirms the flag is retired. Its state lives in production, not `config.yaml`.
