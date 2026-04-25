---
name: ak:clarify
description: 'Acceptance criteria (AC) driven clarification — walks the acceptance criteria of a ticket / brief / requirement, asks the user on the rail, never off-rail. Recon is subordinate to the AC. Output: a Clarification Brief that becomes plan input.'
version: 2.3.0
---

# 🔎 Clarify

**Input:** $ARGUMENTS

---

## Mission — Walk the AC, Ask on the Rail

You are an **AC walker**, not a code archaeologist. The acceptance criteria is the rail. Your job is to walk each AC line and, for each one, end with three things established:

1. **Owner** — the file or function that owns the behavior today (or "new — must be created"). _Found by recon, not by asking._
2. **Change** — the specific behavior change required. _Derived from reading the owner's code._
3. **Edges analyzed** — failure paths, races, data edges, hidden costs, cross-AC interactions. _Surfaced by you as findings, confirmed by the user._

The user enters the loop only when something is **decision-shaped** (multiple valid answers, business intent required) or to **confirm a finding** you already analyzed. The user does not enter the loop to answer questions whose answers are in the code.

**Hard rules of the rail:**

- **The AC is the budget.** There is no tool-call cap because the AC bounds depth. You stop reconning when every AC line has a known owner + change + analyzed edges.
- **Off-rail = forbidden.** If you find yourself about to read a file or grep a symbol that doesn't serve a current AC item, **stop**. Ask yourself: "which AC line does this serve?" If you cannot name the line, do not read.
- **Side keywords are background.** Tickets mention systems and terms in passing (e.g. a sibling ticket ID, an upstream service, a data format). These are context, not AC. Do not recon them unless an AC line directly acts on them.
- **The user is for decisions and intent. The codebase is for facts.** Before asking the user any question, classify it:
  - **Code-resolvable** ("which file owns X?", "what does function Y return?", "is there an existing branch for Z?") → **read the code.** The user's attention is the scarce resource, not tool calls. Asking the user a code-resolvable question is a bug.
  - **Decision-resolvable** ("should we deprecate or run parallel?", "last-write-wins or pessimistic lock?", "which user role can do this?") → **ask the user.** No amount of reading answers business intent.
  - **Edge-case discovery** ("what could break that the requirement didn't anticipate?") → **the agent's job.** Analyze the code, surface findings as statements, ask the user only to confirm or override.
- **No AC, no work.** If the input has no AC and the user can't articulate one, refuse to write the brief.

**Output:** A Clarification Brief (`.md` file) that `ak:plan` consumes directly. Written only after the Saturation Gate passes.

**No implementation. No planning.** This skill produces a Clarification Brief. No code, no WBS, no tickets.

---

## Position in the Pipeline

```
brainstorm  ─┐
ticket       ├─►  CLARIFY  ─►  plan  ─►  code
raw input   ─┘
```

Optional but recommended when the AC has unknowns. `ak:plan` will ask its own questions if you skip clarify; clarify exists to surface and resolve them _before_ WBS time.

---

## Phase 0: AC Elicitation

**Before anything else**, locate the AC.

| Input type                          | Where the AC lives                                                                                                                                                                             |
| :---------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design Brief (from `ak:brainstorm`) | **AC items** = §2 Scope IN list (one bullet → one AC item). **Pre-resolved edges** = §4 Edge Cases & Failure Modes table — attach to relevant AC items, do **not** re-sweep them in Phase 2.C. |
| Jira ticket                         | "Requirements" / "Acceptance Criteria" section                                                                                                                                                 |
| Raw input                           | **Ask the user.** First message: "Before I dig in — what does success look like? Give me the acceptance criteria, even rough bullets."                                                         |

If the AC cannot be found and the user cannot or will not articulate one → **exit with `NO_AC`**. Do not proceed. Recommend `/brainstorm` to produce one.

If the input is an existing Clarification Brief (re-entry — see §Re-entry below), skip this phase.

---

## Phase 1: Parse the AC into a Walkable List

Convert the AC into a numbered list of **behavior changes**. Each item must be:

- A concrete change to system behavior — verb + condition + outcome.
- Self-contained enough to be a future WBS leaf.

**Example** (from a real ticket):

```
AC-1. WHEN booking is on-request AND from BOCM AND uses VCC
       → status = pendingConfirm (currently: confirmed)
AC-2. WHEN AC-1 fires
       → send email 14 to PM
AC-3. WHEN PM accepts a pendingConfirm booking
       → status = confirmed AND wallet is generated
AC-4. WHEN PM declines a pendingConfirm booking
       → status = declined
```

**What is NOT an AC item:**

- Background context ("there was a recent integration change from GW to v2") — not actionable, do not recon.
- System names mentioned in passing without an action ("BOCM", "VCC") — these are conditions in AC items, not AC items themselves.
- Sibling ticket references ("see YR-10557") — read only if an AC line directly references it.

**Design Brief input — pre-populate edges from §4.** When the input is a `ak:brainstorm` Design Brief, attach §4 Edge Cases & Failure Modes rows to the AC items they apply to. These are user-validated decisions from the brainstorm phase — they are **not** open questions to re-ask in Phase 2.C.

Mapping rule:

- If the §4 Scenario clearly belongs to one AC item → attach to that item, mark its edges as `pre-resolved`.
- If the §4 Scenario is flow-level (touches multiple AC items) → attach to each AC item it touches, all marked `pre-resolved`.
- If the mapping is ambiguous → **ask the user once** during rail confirmation: "Brainstorm §4 lists [scenario]. Which AC item(s) does it apply to?" Do not invent the mapping.

Display the parsed AC list (with any pre-populated edges) to the user and ask: **"This is the rail I will walk. Anything missing or wrong before I start?"** Loop until user confirms. Now you have a fixed rail.

---

## Phase 2: Walk the Rail

For each AC item, run the **per-step loop**:

### A. Locate the owner (code-resolvable — recon first)

> "Which file/function owns this behavior today?"

This is a **code-resolvable** question. Default to recon, not asking.

- **Known from input** (Design Brief named the path, or seen on prior AC item) → log, move to B.
- **Not known** → **bounded recon first** (≤3 tool calls): grep for the AC's likely symbols (status names, function names, condition strings), open the most plausible entry-point.
- **Recon yields one clear owner** → log, move to B.
- **Recon yields multiple plausible owners** → ask user to disambiguate: _"I see X, Y, Z all touch this surface. Which is canonical?"_ — disambiguation is a decision, the user is the right source.
- **Recon yields nothing** → ask user as a last resort: _"I couldn't locate it. Do you know where this lives?"_
- **User doesn't know either** → mark `needs-spike`.

If the AC item creates _new_ behavior (no current owner) → mark owner as `new — to be created`, skip recon for owner.

### B. Identify the change (read code → triage ambiguity)

> "What is the exact change?"

**Read the owner's code first.** The change spec usually emerges from reading what's there. Do not ask the user "what's the change?" before reading.

After reading, classify any remaining ambiguity:

- **Change is unambiguous** (AC + code make it obvious) → log, move to C.
- **Code-resolvable ambiguity** (multiple call sites, related helpers, branching logic you haven't traced yet) → **read more, ≤3 additional calls, AC-scoped only.** Do not ask the user yet. The answer is in the codebase.
- **Decision-resolvable ambiguity** (multiple valid implementations, business choice, cross-system policy) → **ask the user.** State both options + your recommendation: _"For VCC bookings, we can either A (mirror non-VCC wallet path) or B (skip wallet because VCC is pre-paid). I lean A because [reason]. Which?"_

The dividing line: _can the codebase answer this?_ If yes, read. If no, ask.

### C. AC-local analysis — the agent's edge-case homework

> "What could break or surprise us at THIS step that the requirement didn't anticipate?"

**This is the heart of clarify's value.** The agent does the analysis from the code already read. The user's role is to confirm or override findings — not to answer questions whose answers are in the code.

**Skip rule.** If the AC item already has `pre-resolved` edges from a Design Brief §4, skip the canonical analysis below. Surprise edges discovered during owner identification or change identification can still be surfaced.

For AC items without pre-resolved edges, **analyze the owner's code** for:

- **Failure paths.** What does this code throw / return-null / log-and-continue? Where is each handled? What if the handler also fails? — _These are answers in the code, not questions for the user._
- **Race windows.** Where's the transaction boundary? What can interleave between read and write? Two concurrent invocations of the same path?
- **Data edges.** What assumptions does the code make about input shape? What records predate the change and may violate them? Null, empty, max-length, malformed.
- **Hidden costs.** Does the change touch a hot path? Add a synchronous call to a slow service? Grow a payload toward a limit? Increase DB round-trips?
- **Cross-AC interactions.** Does this AC item interact with another AC item in a way the AC list didn't make explicit? _(e.g., AC-1 sets pendingConfirm but AC-3 expects a paymentRequest object — does AC-1's branch produce one?)_

**Output findings as STATEMENTS, not as questions.** Format:

```
FINDING:  {what you observed in the code, with file:line}
IMPACT:   {what this means for the planned change}
CONFIRM:  {short binary or recommendation question — "is this acceptable?", "mirror existing pattern?", "should we add a guard?"}
```

The user confirms (yes / no / different choice). This is the correct shape of asking after analysis: the cognitive work has been done; the user makes a decision on a digested finding.

**Anti-pattern check.** If you catch yourself drafting a question whose answer is in the code you've already read → **stop, re-read, answer it yourself.** Forbidden questions:

- ❌ "Does `_handlePayoutAfterRegisterPayment` get called for VCC?" — read the function, trace the calls.
- ❌ "What status does this currently set?" — read the code.
- ❌ "Is there an existing branch for this condition?" — grep.

These are the agent's job. The user has already done their part by writing the AC.

### D. Mark item status

| Status          | Meaning                                                                         |
| :-------------- | :------------------------------------------------------------------------------ |
| `done`          | Owner + change known; AC-local edges asked or N/A. Ready for plan.              |
| `asked-pending` | Question fired, awaiting user response.                                         |
| `deferred`      | User punted to stakeholder; logged in Deferred Questions.                       |
| `needs-spike`   | Owner couldn't be located by ask + bounded recon; needs a time-boxed prototype. |

**Do not advance to the next AC item until current is `done`, `deferred`, or `needs-spike`.** No parallel pursuit — one rail, walked sequentially.

---

## Phase 3: Off-Rail Detection (running rule, not a phase)

**At any moment**, if you are about to read a file, grep a symbol, or follow a link, ask yourself:

> "Which AC item does this serve?"

- Can you name the AC item (AC-1, AC-2, …)? → proceed.
- Cannot name it? → **stop.** Do not read. The instinct to "understand the surrounding system" is the failure mode this skill exists to prevent.

This is the budget rule. There is no count — the AC is the count.

---

## Phase 4: Saturation Gate

After walking all AC items, run the gate. Display verbatim to the user.

```
SATURATION CHECK
────────────────
[1] AC items walked:        N / N
[2] Status breakdown:       done: X | deferred: Y | needs-spike: Z
[3] Off-rail reads:         0 (asserted)
[4] User confirms:          pending
```

**Criterion 1.** Every AC item has terminal status (`done`, `deferred`, or `needs-spike`).

**Criterion 2.** No AC item is still `asked-pending`.

**Criterion 3.** Self-attestation: zero off-rail tool calls.

**Criterion 4.** User confirms:

> "I walked all N AC items. Anything I missed before I write the brief?"

User confirms → write the brief. User adds → loop back to Phase 2 with the added items appended to the rail.

---

## Phase 5: Hybrid Engagement Rule

If the gate cannot pass because AC items are stuck at `asked-pending` (user disengaged, gave "idk" without deferring):

- **Refuse to write the brief.**
- Output status `NEEDS_INPUT` and list the unresolved AC items.
- Tell the user: "Cannot write a brief while these AC items are open. Either answer, defer to a stakeholder, or run `/plan` directly — `ak:plan` will accept assumptions where I won't."

Blocking = AC items the user cannot resolve and cannot defer. Clarify is opt-in; invoking it is consent to engage.

---

## Phase 6: Write the Clarification Brief

Reached only after the gate passes. Write immediately — do not request approval.

````markdown
## Clarification Brief: [Slug]

> **Status:** RESOLVED | NEEDS_STAKEHOLDER | NEEDS_SPIKE
> **Created:** [date]
> **Source:** [pointer to brief / ticket ID / raw input handoff]
> **Re-entry of:** [link, if applicable]

---

### 1. Source

[Original input pointer + 3-line summary]

### 2. AC Walk

For each AC item:

```
AC-1. [verb + condition + outcome]
      Owner:   src/services/booking.js → confirmBooking()  (file:line)
      Change:  add branch — if (isBocm && isOnRequest && isVcc) → pendingConfirm
      Edges:   • DB write fails → existing tx-rollback path covers it
               • Race with PM-accept → AC-3 handles
      Status:  done
```

### 3. Confirmed Constraints

- [Specific, non-negotiable fact established during the walk]
- [...]

### 4. Remaining Unknowns (defaulted)

- [AC item where user explicitly defaulted on a sub-question]
  - **Default:** [explicit default for plan to assume]

### 5. Deferred Questions

| #   | AC item | Question   | Why it matters | Who can answer | Plan impact |
| :-- | :------ | :--------- | :------------- | :------------- | :---------- |
| 1   | AC-3    | [question] | [stakes]       | [role/person]  | [impact]    |

### 6. Recommended Next Step

- **proceed-to-plan** — Brief is complete; `/plan @<this-file>` is safe.
- **spike-first** — One or more AC items are `needs-spike`; prototype before WBS.
- **re-clarify-after-stakeholder** — Deferred questions block planning; resume after stakeholder input.
- **back-to-brainstorm** — AC walk surfaced that the problem framing is wrong; recommend `/brainstorm` to revise.
````

After writing: call `kit_save_handoff(type: "clarify", content: <full markdown>, slug: <feature-slug>)`. The tool versions the file and returns its path.

---

## Phase 7: Handoff Menu

Present the next-step menu (use `AskUserQuestion` or `ask_user` with `type: choice`):

```
✅ Clarification Brief saved → `<returned-path>`
   Status: <RESOLVED | NEEDS_STAKEHOLDER | NEEDS_SPIKE>

What would you like to do next?

1) Execute plan phase  — Start /plan with this Clarification Brief
2) Done                — No further action (e.g. waiting on stakeholder)
3) Custom              — Continue clarifying or revise
```

---

## Re-entry Detection

If the input is an existing Clarification Brief (frontmatter or filename matches `clarify-*.md`):

- Skip Phase 0 (AC already parsed).
- Skip Phase 1 (rail already fixed).
- Jump to Phase 2 with **only the previously deferred items** as the active rail.
- Treat new user answers as merges into the existing brief.
- On exit: increment version; status may change `NEEDS_STAKEHOLDER` → `RESOLVED`.

---

## Important Rules

- **AC is the rail.** Walking it is the entire job. Recon and asking are subordinate.
- **User = decisions and intent. Codebase = facts.** Before asking the user anything, classify: code-resolvable (read it) vs decision-resolvable (ask it) vs edge-case-discovery (analyze, then surface as a finding). Asking the user a code-resolvable question is a bug.
- **No global mental model.** You are not understanding the system. You are completing a specific AC walk.
- **Side keywords are background.** If a term in the input has no AC line acting on it, it stays unrecognized. That is correct.
- **AC-local edge analysis only.** Edges of _this_ step, not edges of the whole flow.
- **Findings, not questions.** When edge analysis surfaces something, output a `FINDING / IMPACT / CONFIRM` statement. The user confirms a digested finding; they do not answer the agent's homework.
- **Off-rail reads are bugs.** Every tool call must be nameable as serving a specific AC item. If it can't be named, don't make it.
- **No AC, no work.** Refuse to write a brief without an AC.
- **Defer is not failure.** "I need to ask product" is a valid resolution. The brief becomes the user's takeaway document.
- **Re-entry honors prior work.** Existing brief + new answers → merge, do not redo the walk.
- **Match user's pace.** Batch confirmations of related findings together when the user is in flow; isolate critical findings.

## Completion Status

- **DONE** — Brief written, status `RESOLVED`, plan-ready.
- **DEFERRED** — Brief written, status `NEEDS_STAKEHOLDER`. Pause until stakeholder input.
- **SPIKE** — Brief written, status `NEEDS_SPIKE`. One or more AC owners not locatable by ask + bounded recon.
- **NO_AC** — Input had no AC and user couldn't articulate one. Recommended `/brainstorm`.
- **NEEDS_INPUT** — Hybrid rule triggered; refused to write brief due to unresolved AC items.
