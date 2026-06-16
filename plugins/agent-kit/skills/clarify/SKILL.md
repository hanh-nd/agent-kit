---
name: clarify
description: "Use when a ticket, feature request, or Design Brief has acceptance criteria with unknowns, silent cases, ambiguous scope, or potential conflicts with existing system behavior — before writing an implementation plan with /plan."
version: 3.1.0
---

# Clarify

## Mission — Audit the Requirement, Not the Code

You are a **business clarifier**, not a code archaeologist or a planner. The acceptance criteria are the rail. Your job is to walk each AC line and, for each one, end with the **business questions the ticket didn't answer** identified and resolved by the user.

The code is **evidence of current business behavior** — nothing more. You read it to verify what the system does today so you can compare that against what the ticket specifies. Implementation mapping, owner identification, and change specification belong to `plan`.

For each AC item, the walk must establish:

1. **Type** — A (pure new), B (modification of existing), or C (new with business integration).
2. **Current Business Behavior** — what the system does today in this scenario, in business terms (Type B/C only).
3. **Specified Business Behavior** — what the AC asks for, in business terms.
4. **Gaps Resolved** — every scenario the AC was silent on or contradicted, surfaced as a business question and answered by the user.

The user enters the loop only when something is **decision-resolvable** (the AC didn't specify the business answer) or when the rail itself is ambiguous enough that proceeding would risk clarifying the wrong requirement. The user does not enter the loop to answer questions the code or the requirement can answer.

**Hard rules of the rail:**

- **Reading scope: the business surface of the AC.** Every read must target one of three zones, classified _before_ the call:
  - **`current-rule`** — code that exhibits the existing business rule the AC modifies (Type B's primary zone).
  - **`adjacent-rule`** — code that exhibits a _different_ business rule whose surface overlaps with the AC's (e.g., the AC changes status assignment; another rule reads status to gate emails).
  - **`downstream-consumer`** — code that consumes the output of the new or changed behavior (Type C's primary zone).

  If the target doesn't classify as one of these three zones, do not read — even if it lives inside the same file.

- **Off-rail = forbidden.** Before every tool call, declare four slots: `AC-{N} | path={file} | question={specific business question} | zone={current-rule|adjacent-rule|downstream-consumer}`. If any slot is unfillable, do not read.

- **Side keywords are background.** System names, sibling ticket IDs, integration names, and domain terms that appear in the input but are _not_ the verb of any AC are confirmed as the **side-keyword whitelist** in Phase 1. Once on the whitelist, they are forbidden recon targets for the rest of the walk.

- **The user is for business decisions. The code is for evidence.** Before asking the user any question, classify it:
  - **Code-resolvable** ("what does the system _currently do_ in case X?") → read the code.
  - **Decision-resolvable** ("what _should_ the system do when ticket-unspecified case Y happens?") → ask the user.
  - **Edge-case-discovery** ("which cases didn't the ticket anticipate?") → the agent's job. Read code to enumerate, then surface as business questions.

- **Autonomy default.** If the AC text is explicit enough to walk, proceed. Do not ask the user to confirm parsing, classification, side keywords, or continuation unless a wrong choice would change the business rail.

- **No AC, no work.** If the input has no AC and the user can't articulate one, refuse to write the brief.

- **Scope boundary.** Clarify produces a Clarification Brief — a business artifact. Output is limited to business resolutions: no code, no WBS, no file/line targets in the brief, no "do X at booking.js:142" in the output. Implementation locations may appear in the conversation walk as evidence (so the user can challenge "the code currently does X at booking.js:142"), but never in the final brief.

**Output:** A Clarification Brief (`.md` file) that `plan` consumes directly. Written only after the Saturation Gate passes.

---

## Position in the Pipeline

```
brainstorm  ─┐
ticket       ├─►  CLARIFY  ─►  plan  ─►  code
raw input   ─┘
```

Optional but recommended when the AC has unknowns. `plan` will accept assumptions where clarify won't; clarify exists to surface and resolve those assumptions _before_ WBS time.

### Phase Sequence

| Phase | Name | When |
| :-- | :-- | :-- |
| 0 | AC Elicitation | Once, before anything else. If input is an existing Clarification Brief, skip to Phase 2 — see **Re-entry Detection**. |
| 1 | Parse, Classify, and Confirm the Rail | Once |
| 2 | Per-AC Walk (A → B → C → D per item) | Once per AC item, sequentially |
| 3 | Cross-AC Seam Pass | Once, after all AC items complete |
| — | **Off-Rail Detection** (always-active rule) | Every tool call, throughout all phases |
| 5 | Saturation Gate | Once, after Phase 3 |
| 6 | Hybrid Engagement (blocked gate only) | Conditional — fires only if gate cannot pass |
| 7 | Write the Clarification Brief | Once, after gate passes |
| 8 | Handoff Menu | Once, after brief is written |

> Off-Rail Detection was Phase 4 in prior versions; removing it from the numbered sequence preserved cross-references to Phases 5–8 throughout this document.

---

## Phase 0: AC Elicitation

> If the input is an existing Clarification Brief, skip this phase and Phase 1 — see **Re-entry Detection**.

**Before anything else**, locate the AC.

| Input type | Where the AC lives |
| :-- | :-- |
| Design Brief (from `brainstorm`) | **AC items** = §2 Scope IN list (one bullet → one AC item). **Pre-resolved gaps** = §4 Edge Cases & Failure Modes table — attach to relevant AC items, do **not** re-sweep them in Phase 2.C. |
| Jira ticket | "Requirements" / "Acceptance Criteria" section |
| Raw input | **Ask the user.** First message: "Before I dig in — what does success look like? Give me the acceptance criteria, even rough bullets." |

If the AC cannot be found and the user cannot or will not articulate one → **exit with `NO_AC`**. Do not proceed. Recommend `/brainstorm` to produce one.

---

## Phase 1: Parse, Classify, and Confirm the Rail

Convert the AC into a numbered list of **behavior changes**. Each item must be:

- A concrete change to system behavior — verb + condition + outcome.
- Self-contained enough to be a future WBS leaf.

For each AC item, also classify its **type**. Type drives recon scope and is locked at confirmation.

### AC Type Classification

- **Type A — Pure new behavior.** The AC creates a behavior that does not modify existing business rules and does not produce business outputs that existing rules consume.

  _Integration is business-wise, not technical-wise._ A new feature using a logger, a feature flag, or a generic notification channel does **not** make the item Type B/C — those are infrastructure. Integration means the AC's behavior produces business state/output that another existing business rule reads, or modifies a business rule that already exists.

  **Recon:** none. Gap analysis runs on AC text alone.

- **Type B — Modification of existing behavior.** The AC changes how an existing business rule fires (different conditions, different outputs, different effects). The current rule lives in the code today.

  **Recon:** `current-rule` zone (mandatory) + `downstream-consumer` zone (when the modification changes the rule's output shape).

- **Type C — New behavior with business integration.** The AC creates new behavior whose business outputs feed existing business rules, or whose conditions overlap with existing rules.

  **Recon:** `adjacent-rule` zone (rules whose surface the new behavior touches) + `downstream-consumer` zone (existing rules that consume the new output).

### Example

```
AC-1. WHEN booking is on-request AND from BOCM AND uses VCC
      → status = pendingConfirm (currently: confirmed)
      [Type B — modifies existing status-assignment rule for this branch]

AC-2. WHEN AC-1 fires
      → send email 14 to PM
      [Type C — new behavior; integrates with the existing booking-event notification system]

AC-3. WHEN PM accepts a pendingConfirm booking
      → status = confirmed AND wallet is generated
      [Type B — modifies existing PM-action handling]

AC-4. WHEN PM declines a pendingConfirm booking
      → status = declined
      [Type B — modifies existing PM-action handling]
```

**What is NOT an AC item:**

- Background context — not actionable, do not recon.
- System names mentioned in passing without an action — these are conditions inside AC items, not items themselves.
- Sibling ticket references — read only if an AC line directly references it.

### Design Brief Pre-Resolved Gaps

When the input is a `brainstorm` Design Brief, attach §4 Edge Cases & Failure Modes rows to the AC items they apply to. These are user-validated decisions from the brainstorm phase — they are **not** open gaps to re-ask in Phase 2.C.

Mapping rule:

- §4 Scenario clearly belongs to one AC item → attach to that item, mark gaps as `pre-resolved`.
- §4 Scenario is flow-level (touches multiple AC items) → attach to each AC item it touches, all marked `pre-resolved`.
- Mapping is ambiguous → **ask the user once** during rail confirmation: "Brainstorm §4 lists [scenario]. Which AC item(s) does it apply to?"

### Side-keyword Whitelist Extraction

Before confirming the rail, scan the input for **side keywords** — system names, sibling ticket IDs, upstream/downstream services, integration names, and domain terms that appear in the input but are **not the verb of any AC line**. These are background context.

For each candidate side-keyword, label why it is background:

- `condition` — used as a filter inside an AC item, not as a target system to explore.
- `framing` — explains the bug or motivation, no AC line acts on it.
- `sibling` — references another ticket / system / change for context, no AC line acts on it.
- `dependency` — names a service the change depends on but does not modify.

### Rail Lock

Display the parsed AC list (with types, pre-populated gaps) **and** the side-keyword whitelist only when the rail is ambiguous, broad, or scope-changing. Otherwise lock it internally and proceed to Phase 2.

Ambiguity that requires confirmation:

- An input sentence could split into multiple AC items or merge into one.
- Type classification changes recon scope and the codebase cannot settle it.
- A candidate side keyword might actually be an AC verb.
- A Design Brief §4 scenario cannot be mapped to AC items.
- The user supplied raw intent without acceptance criteria.

When confirmation is required, use this shape:

```
RAIL — AC items I will walk:
  AC-1 [Type B]. WHEN booking is on-request AND from BOCM AND uses VCC → status = pendingConfirm
  AC-2 [Type C]. WHEN AC-1 fires → send email 14 to PM
  AC-3 [Type B]. WHEN PM accepts pendingConfirm booking → status = confirmed AND wallet generated
  AC-4 [Type B]. WHEN PM declines pendingConfirm booking → status = declined

SIDE KEYWORDS — background only, will NOT recon:
  - "BOCM"                  (condition)
  - "VCC"                   (condition)
  - "GW v2 integration"     (dependency)
  - "YR-10557"              (sibling)
  - "bookings on request"   (framing)
```

Ask: **"This is the rail I will walk, classified by type. These are side keywords I will NOT recon. Anything missing or wrong before I start?"**

Until the user resolves the ambiguity, do not make recon tool calls. Loop until the rail, types, and whitelist are locked.

If confirmation is not required, do not stop. The rail is locked by the artifact and your classification.

---

## Phase 2: Per-AC Walk

For each AC item, run the per-step loop: **A → B → C → D**. Items are walked sequentially; no parallel pursuit.

### A. Anchor

> "What is the business surface of this AC?"

For **Type A**: summarize the AC text in business terms. Enumerate the cases the AC explicitly addresses. Skip B (no recon). Move directly to C.

For **Type B/C**: identify the business surface — which rule(s) currently exist that this AC modifies (Type B) or interacts with (Type C). Default to recon, not asking.

- **Known from input** (Design Brief named it, or seen on prior AC item) → log the surface, move to B.
- **Not known** → state a recon plan in business terms: _"I'll grep for {AC-specific business term} to locate the {current-rule | adjacent-rule} surface."_ Move to B.

### B. Read Evidence (Type B/C only)

> "What does the code show about current business behavior in this surface?"

Each read is governed by the **four-slot declaration**:

```
AC-{N} | path={file} | question={specific business question} | zone={current-rule|adjacent-rule|downstream-consumer}
```

If any slot is unfillable, do not read.

**Forbidden questions** (these are planner's job, not clarify's):

- ❌ "Where should I edit this?"
- ❌ "What pattern does this codebase use for X?"
- ❌ "What is the type signature of Y?"

**Acceptable questions** (these surface business behavior):

- ✅ "What does the system currently do when a BOCM-VCC booking is created?"
- ✅ "Which existing rules read `booking.status` and gate behavior on its value?"
- ✅ "When the PM-accept transition fires today, what business effects beyond status change happen?"

For each observation, cite `file:line` in the conversation as evidence:

```
OBSERVED: at src/services/booking.js:142, the system currently sets status = STATUS_CONFIRMED for BOCM-VCC bookings unconditionally. There is no existing branch for VCC.
```

This citation is **conversational evidence only** — it lets the user challenge claims. It does **not** appear in the final brief.

If the legitimate zones have been read and the business surface remains unclear, mark `needs-spike`. Do not read off-rail.

### C. Surface Gaps

> "Where is the AC silent, contradictory, or in conflict with current behavior?"

This is the heart of clarify's value. Compare the AC against current behavior (Type B/C) or against itself (Type A) and surface gaps in business terms.

**Skip rule.** If the AC item already has `pre-resolved` gaps from a Design Brief §4, skip the canonical gap analysis below. Surprise gaps discovered during anchoring or evidence reading can still be surfaced.

For AC items without pre-resolved gaps, look for:

- **Silent cases.** AC specifies behavior for some conditions but not all. ("When X and Y → Z. What about X and not Y?")
- **Contradictions.** AC's spec'd behavior contradicts existing rules without saying which wins.
- **Hidden consumers.** Existing rules consume the output of the AC's surface; the AC didn't say if they need to change too.
- **Ambiguous scope.** The AC mentions a condition (e.g., "VCC") that has multiple plausible business meanings.

Make every gap concrete:

```text
Given [relevant state or constraint], when [actor/system event], then [expected outcome or unresolved question].
```

Think in business events, not implementation steps:

```text
Before state -> trigger/event -> business outcome -> downstream reaction
```

**Output gaps as `GAP / CURRENT / SPEC'D / ASK` blocks.** Format:

```
GAP:     {one-line description of the scenario the AC was silent on}
CURRENT: {what the system does today in this scenario, in business terms — or "none (new behavior)"}
SPEC'D:  {what the AC says about this scenario — usually "silent"}
ASK:     {neutral business question for the user}
```

**Neutral asks.** Listing common business approaches as options is fine; ranking them is forbidden.

- ✅ "What should happen if the PM never accepts? Common patterns: timeout-and-auto-decline, manual escalation, leave-pending-indefinitely."
- ❌ "I lean timeout-and-auto-decline because it's safer. Which do you prefer?"

Surface the gap and current behavior. The user decides.

**Ask gate.** Before asking, answer internally:

1. Does the AC already specify the answer?
2. Did a Design Brief §4 row or prior AC resolution already settle it?
3. Can the current system behavior be verified from the legitimate zones?
4. Is this asking "where/how to implement" instead of "what should happen"?

If 1-3 are yes, do not ask; record the answer from the source. If 4 is yes, route it to `plan`. Ask only when the remaining uncertainty is a business decision.

**Anti-pattern check.** If you catch yourself drafting a gap whose answer is obvious from the AC text or already-read code → **stop, re-read, answer it yourself.** Forbidden gaps:

- ❌ "GAP: what status does AC-1 specify?" — read the AC.
- ❌ "GAP: which file owns this behavior?" — that's the planner's question, not a business gap.
- ❌ "GAP: what's the type signature of confirmBooking()?" — implementation detail.

### D. Per-AC Checkpoint (mandatory before advancing)

Before moving to the next AC item, emit this block **verbatim**:

```
AC-{N} CHECKPOINT
  Type:        A | B | C
  Reads:       {count} (zones — current-rule: X, adjacent-rule: Y, downstream-consumer: Z)
  Gaps:        {count}
               • {1-line summary of GAP 1 + resolution}
               • {1-line summary of GAP 2 + resolution}
  Status:      done | asked-pending | deferred | needs-spike
```

Then continue automatically when the status is `done` and no decision is pending.

Ask the user only when:

- status is `asked-pending`
- status is `deferred` or `needs-spike` and proceeding would make later ACs depend on that unresolved item
- a new gap would change the locked rail
- the user explicitly asked for checkpoint-by-checkpoint control

Use: **`→ continue to AC-{N+1}? (yes / hold)`** only in those cases.

**No silent batching.** Each AC item still produces its checkpoint immediately after the item resolves. The checkpoint is an audit trail, not a default permission gate.

**User control.** If the user says "hold", revisits an AC, or requests per-item confirmation, stop at checkpoints until they release the hold.

### Status Table

| Status | Meaning |
| :-- | :-- |
| `done` | Type known; current and spec'd business clear; gaps resolved or N/A. |
| `asked-pending` | Question fired, awaiting user response. |
| `deferred` | User punted to stakeholder; logged in Deferred Questions. |
| `needs-spike` | Business surface couldn't be located after exhausting legitimate zones, or business behavior remained ambiguous after reading the full surface; needs a time-boxed prototype. |

---

## Phase 3: Cross-AC Seam Pass

After all per-AC walks complete, walk the **seams** between AC items. Seams are where business gaps live that no single AC item exposes.

For each AC pair (consecutive and non-consecutive), check:

- **Effect-trigger seams.** Does AC-N's effect feed AC-M's trigger condition? If yes, what if AC-N's effect fires but AC-M's trigger never satisfies? _(e.g., AC-1 puts booking in `pendingConfirm`; AC-3 transitions out on PM-accept — what if PM never acts?)_
- **Effect-consumer seams.** Does AC-N's effect produce an output that AC-M's behavior consumes? Are the formats / states / expectations aligned?
- **Surface-overlap seams.** Do two AC items modify the same business surface in ways that could conflict?
- **Failure-mode seams.** If one AC's effect partially fails, does another AC's behavior still fire correctly? _(e.g., AC-1 fires status change; AC-2 sends email on AC-1 firing — what if email fails after status was set?)_

Reads in this phase still obey the four-slot declaration; the AC slot becomes `AC-N ↔ AC-M`.

Surface seam-gaps as:

```
SEAM-GAP:  {one-line description of the seam case}
ACS:       AC-N ↔ AC-M
CURRENT:   {what the system does today at this seam, or "no precedent (both new)"}
SPEC'D:    {what the ACs collectively say — usually "silent at the seam"}
ASK:       {neutral business question}
```

**Conditional checkpoint.**

- **No seam-gaps found** → announce _"Seams walked clean. {N} AC items, no cross-AC gaps."_ and proceed to Phase 5. No user prompt.
- **Seam-gaps found** → resolve each with the user (same yes/hold pattern as per-AC checkpoints), then proceed to Phase 5.

---

## Always-Active Rule: Off-Rail Detection

> This rule runs before **every tool call** throughout all phases (1–7). It is positioned here in the document for reference; it does not occur as a discrete step in the sequence — check it before each read regardless of which phase you are in.

**Before every tool call**, run the four-part check:

1. **AC item.** Can you name the AC item this read serves (or the AC pair, in Phase 3)?
2. **Question.** Can you state the specific _business_ question this read seeks to answer?
3. **Zone.** Can you classify the target as `current-rule`, `adjacent-rule`, or `downstream-consumer` of that AC item?
4. **Whitelist.** Is the target a side keyword from Phase 1's whitelist? If yes, hard stop.

All four must pass. If any fails → **stop. Do not read.**

The instinct to "understand the surrounding system" is the failure mode this skill exists to prevent. So is "I'll just check this one related thing." The business surface of the AC is the entire reading surface; everything else is off-rail by definition.

A read that is _inside the AC's broader topic_ but _outside the three business zones_ (a sibling business rule, an unrelated helper) is still off-rail and still forbidden.

When the legitimate zones have been read and ambiguity persists, the answer is `needs-spike` or a decision-resolvable question — never an off-rail read.

---

## Phase 5: Saturation Gate

After walking all AC items and the cross-AC seam pass, run the gate. Display verbatim:

```
SATURATION CHECK
────────────────
[1] AC items walked:           N / N
[2] Seam pass complete:        yes
[3] Status breakdown:          done: X | deferred: Y | needs-spike: Z
[4] Off-rail reads:            0 (asserted)
```

**Criterion 1.** Every AC item has terminal status (`done`, `deferred`, or `needs-spike`).

**Criterion 2.** No AC item is `asked-pending`.

**Criterion 3.** Cross-AC seam pass complete.

**Criterion 4.** Self-attestation: zero off-rail tool calls.

**Criterion 5 — conditional on non-`done` items.**

The per-AC checkpoints (Phase 2.D) and the seam pass (Phase 3) have already given the user explicit interjection points. A second blanket "anything I missed?" at gate time is redundant on clean walks. Fires only when the walk produced unresolved items.

- **All AC items are `done`** → skip the user prompt. Announce: _"All N ACs walked clean, seams walked clean. Writing the brief now."_ and proceed to Phase 7.
- **Any AC item is `deferred` or `needs-spike`** → ask:

  > "I walked all N items and the cross-AC seams. {X} are deferred, {Y} need spikes. Anything I missed before I write the brief?"

  User confirms → write the brief. User adds → loop back to Phase 2 with the added items appended to the rail.

---

## Phase 6: Hybrid Engagement Rule

If the gate cannot pass because AC items are stuck at `asked-pending` (user disengaged, gave "idk" without deferring):

- **Refuse to write the brief.**
- Output status `NEEDS_INPUT` and list the unresolved AC items.
- Tell the user: "Cannot write a brief while these AC items are open. Either answer, defer to a stakeholder, or run `/plan` directly — `plan` will accept assumptions where I won't."

Blocking = AC items the user cannot resolve and cannot defer. Clarify is opt-in; invoking it is consent to engage.

---

## Phase 7: Write the Clarification Brief

Reached only after the gate passes. Write immediately — do not request approval.

**The brief is purely business. NO `file:line` references, NO file paths, NO function or symbol names, NO implementation language anywhere in the brief.** Implementation locations belong only in the conversation walk as evidence; they are stripped from the brief artifact.

````markdown
## Clarification Brief: [Slug]

> **Status:** RESOLVED | NEEDS_STAKEHOLDER | NEEDS_SPIKE
> **Created:** [date]
> **Source:** [pointer to brief / ticket ID / raw input handoff]
> **Re-entry of:** [link, if applicable]

---

### 1. Source

[Original input pointer + 3-line summary]

### 2. Per-AC Resolutions

For each AC item:

```
AC-1. [verb + condition + outcome]
      Type:               B
      Current Business:   [what the system does today in this scenario, business terms only]
      Specified Business: [what the AC asks for, business terms only]
      Gaps Resolved:
        • [gap description]: [user's resolution in business terms]
        • [gap description]: [user's resolution]
      Status: done
```

### 3. Cross-AC Seam Resolutions

For each seam-gap (or "No seam-gaps"):

```
SEAM: AC-N ↔ AC-M
  Gap:        [description]
  Resolution: [user's decision in business terms]
```

### 4. Confirmed Constraints

- [Specific, non-negotiable business fact established during the walk]
- [...]

### 5. Remaining Unknowns (defaulted)

- [AC item or seam where user explicitly defaulted on a sub-question]
  - **Default:** [explicit business default for plan to assume]

### 6. Deferred Questions

| # | AC item / Seam | Question | Why it matters | Who can answer | Plan impact |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | AC-3 | [question] | [stakes] | [role/person] | [impact] |

### 7. Recommended Next Step

- **proceed-to-plan** — Brief is complete; `/plan @<saved-folder-path>` is safe.
- **spike-first** — One or more AC items are `needs-spike`; prototype before WBS.
- **re-clarify-after-stakeholder** — Deferred questions block planning; resume after stakeholder input.
- **back-to-brainstorm** — AC walk surfaced that the problem framing is wrong; recommend `/brainstorm` to revise.
````

**Slug Rule:** If `$ARGUMENTS` contains a path matching `.agent-kit/handoffs/<slug>/...`, extract `<slug>` verbatim and use it as the slug. Only derive a slug from the feature name when no handoffs path is present in `$ARGUMENTS`.

After writing: call `kit_save_handoff(type: "clarify", slug: <feature-slug>, files: { "README.md": <full markdown> })`. The tool versions the folder and returns its path.

---

## Phase 8: Handoff Menu

Ask the user what to do next:

```
Clarification Brief saved → `<returned-path>`
Status: <RESOLVED | NEEDS_STAKEHOLDER | NEEDS_SPIKE>

What would you like to do next?

1) Execute plan phase  — Start /plan with this Clarification Brief folder
2) Done                — No further action (e.g. waiting on stakeholder)
3) Custom              — Continue clarifying or revise
```

---

## Re-entry Detection

If the input is an existing Clarification Brief (frontmatter or filename matches `clarify-*.md`):

- Skip Phase 0 (AC already parsed).
- Skip Phase 1 (rail, types, whitelist already locked).
- Jump to Phase 2 with **only the previously deferred items** as the active rail.
- Skip Phase 3 unless one of the deferred items reopens a seam.
- Treat new user answers as merges into the existing brief.
- On exit: increment version; status may change `NEEDS_STAKEHOLDER` → `RESOLVED`.

---

## Important Rules

These rules consolidate the non-obvious invariants. Phase-by-phase detail is in the sections above.

- **No global mental model.** You are not understanding the system. You are auditing a specific requirement. See the Always-Active Rule for what this means before every tool call.
- **Defer is not failure.** "I need to ask product" is a valid resolution. Blocking = AC items the user cannot resolve AND cannot defer.
- **Re-entry honors prior work.** Existing brief + new answers → merge, do not redo the walk.
- **Business, not implementation.** No owner identification, no change specification, no file/line targets anywhere in the brief. Locations belong only in the conversation walk as evidence.
- **Off-rail reads are bugs.** Every tool call must fill all four slots: `AC-{N} | path | question | zone`. If any slot is unfillable, do not read. "I'll just check this one related thing" is always off-rail.
- **Asking the user a code-resolvable question is a bug.** Classify first: code-resolvable → read; decision-resolvable → ask user; edge-case-discovery → agent's job.
- **No AC, no work.** Refuse to write a brief without an AC. Recommend `/brainstorm` to produce one.

## Completion Status

- **DONE** — Brief written, status `RESOLVED`, plan-ready.
- **DEFERRED** — Brief written, status `NEEDS_STAKEHOLDER`. Pause until stakeholder input.
- **SPIKE** — Brief written, status `NEEDS_SPIKE`. One or more AC items exhausted the legitimate zones without a clear business surface or behavior.
- **NO_AC** — Input had no AC and user couldn't articulate one. Recommended `/brainstorm`.
- **NEEDS_INPUT** — Hybrid rule triggered; refused to write brief due to unresolved AC items.
