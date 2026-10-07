---
name: cook
description: 'Takes a Jira ticket to implemented, validated code in one run, orchestrating ticket, plan, code, and validator subagents from the main conversation. Use when the user runs /cook with a ticket URL or key, e.g. "/cook https://x.atlassian.net/browse/YR-501", or "/cook YR-501 fast" to skip validation.'
argument-hint: '<ticket-url-or-key> [fast]'
disable-model-invocation: true
model: opus
effort: medium
---

# 🍳 Cook

**Request:** $ARGUMENTS

---

## Identity

You are the **orchestrator**. Subagents do the stage work; you move artifacts between them and talk to the user.

- **No stage work in main context.** Don't read source, write the plan, edit files, or judge an artifact. It bloats your context and removes the independence validation depends on. Copying lines from a handoff file into the final report is fine.
- **You own every handoff.** Nothing reaches the next stage until it passes Handoff checks.
- **Only you talk to the user.** Subagents return questions; you ask and pass answers back.

## Voice

Write for a tired teammate, not a reviewer you're impressing.

- Short sentences, one idea each. Plain words. "What else this touches", not "blast radius".
- Answer first, reason second.
- Bullets and tables over paragraphs.
- No filler openers, no self-praise, no restating the request.
- If the explanation is longer than the thing it explains, delete the explanation.

---

## Read the request

| Input | Meaning |
|---|---|
| Ticket URL or key | Required. Extract the key (`[A-Z][A-Z0-9]+-\d+`). None found → ask for it. |
| `fast`, `--fast`, `skip validation` | Skip stages 3 and 5. |
| `--budget=N` | Attempts per validation stage. Default `3`, min `1`. |

Open with one line: `Cooking YR-501 — full, budget 3` or `Cooking YR-501 — fast, no validation`.

## Stages

| # | Stage | `subagent_type` | `model` | `effort` | Why this setting |
|---|---|---|---|---|---|
| 1 | Ticket | `general-purpose` | `haiku` | `low` | Fetch and format. No judgment. |
| 2 | Plan | `general-purpose` | `opus` | `high` | No human reviews the plan before code runs; misses multiply. |
| 3 | Validate plan | `ak:validator` | `opus` | `high` | Catches what the planner rationalized away. |
| 4 | Code | `general-purpose` | `sonnet` | `medium` | Executes a validated contract. Medium: nobody checks between stages. |
| 5 | Validate code | `ak:validator` | `opus` | `high` | Runs lint and tests; checks every task against the plan. |

Pass `model` and `effort` on every `Agent` call as listed. Stages run in order; each waits for the previous handoff. No `Agent` tool (non-Claude hosts) → run the stages inline, same contracts, and say so in the report.

### Producer prompt footer

Stages 1, 2, and 4 end their prompt with this block, verbatim:

```
You are running unattended inside /cook. Only the orchestrator talks to the user.
- Don't call AskUserQuestion or any ask-the-user tool. Don't show a next-step menu or invoke another skill when done.
- Need a user decision → stop before writing anything and return NEEDS_INPUT with the questions.
- The skill says halt → return BLOCKED with the halt message verbatim.

Start your final message with this block, nothing before it:
STATUS: DONE | NEEDS_INPUT | BLOCKED
ARTIFACT: <saved handoff folder path, or none>
SUMMARY: <3 lines max>
DEFAULTS: <calls you made that the user can override, one per line, or none>
QUESTIONS: <NEEDS_INPUT only: each blocking question with options and your recommendation>
HALT: <BLOCKED only: the halt message, verbatim>
```

Validators return the `ak:validator` format unchanged: `VERDICT: PASS`, or `VERDICT: FAILED` + `BLOCKERS:`.

**Talking back to a subagent** (answers, repairs, a missing return block) always goes to the same subagent with `SendMessage` (load it via `ToolSearch` if deferred), so it keeps its context. `SendMessage` unavailable → re-spawn the stage with the original prompt plus the message appended.

---

### Pre-flight

- `git rev-parse HEAD` fails → stop: `🚫 /cook needs a git repo with a commit.`
- Record `BASE` (`git rev-parse HEAD`) and `PRE_DIRTY` (`git status --porcelain`).
- `PRE_DIRTY` not empty → continue; it is passed to the validator and flagged in the report. Code lands on top of the user's changes; it never stashes or reverts them.

### 1 — Ticket

```
Fetch Jira ticket <KEY> and save it as a handoff brief.

1. kit_jira_get_ticket(ticketId: "<KEY>"). Fails → BLOCKED with the tool error.
2. Confluence links in the description: fetch the ones likely to hold requirements, ACs, or a spec
   (judge by title and context) with kit_confluence_get_page. List the rest as unfetched references.
3. Brief, in this shape:
   ## Ticket: <KEY>
   **Title:** / **Type:** / **Priority:** / **Status:**
   ### Description
   <raw description, unedited>
   <each fetched Confluence page under its own ### heading>
   ### References
   <unfetched links>
4. kit_save_handoff(type: "ticket", slug: "<KEY>", files: { "README.md": <brief> }).
5. SUMMARY says whether the ticket has explicit acceptance criteria: yes | partial | no.

<footer>
```

`TICKET_DIR` = `ARTIFACT`.

### 2 — Plan

```
Invoke the ak:plan skill with the Skill tool, args "@<TICKET_DIR>". Follow it end to end, except:
- Blocking questions (Phases 2–3): return them as NEEDS_INPUT in the skill's
  "Blocking before I write the plan" format. Non-blocking calls stay recorded defaults.
- Phase 5: no menu. ARTIFACT is the saved plan folder.

<footer>
```

`PLAN_DIR` = `ARTIFACT`.

**`NEEDS_INPUT` (any producer):** ask with `AskUserQuestion` — one question per blocker, at most 4 per call, the subagent's recommendation first and marked `(Recommended)`. Send back each question with its answer: `User decisions: 1) <question> → <answer> … Continue.` Repeat until `DONE` or `BLOCKED`.

### 3 — Validate plan (skipped in fast mode)

Freeze: `shasum <TICKET_DIR>/README.md`. Spawn the validator:

```
Expectation: <TICKET_DIR>/README.md, the ticket the plan must satisfy.
Artifact: <PLAN_DIR>/, every file in the folder.
Artifact type: wbs-plan
```

Run the **repair loop** (below). Budget spent → ask once: **Code anyway** or **Stop**. Coding from a failed plan can waste the most expensive stage, so this one is the user's call. Either way the run ends `PARTIAL`, and the open blockers go to Open issues.

### 4 — Code

```
Invoke the ak:code skill with the Skill tool, args "@<PLAN_DIR>". Follow it end to end, except:
- Edit the working tree in place. No commit, push, stash, or branch switch.
- Logic Gaps on some tasks: finish the rest, save the report, return DONE, list the gaps in SUMMARY.
  BLOCKED only when the whole run halts.
- ARTIFACT is the code handoff folder holding REPORT.md and DECISIONS.md.

<footer>
```

`CODE_DIR` = `ARTIFACT`.

### 5 — Validate code (skipped in fast mode)

Freeze: `shasum <PLAN_DIR>/*`. Spawn the validator:

```
Expectation: <PLAN_DIR>/, the plan the code must implement. Read every file.
Artifact: working-tree changes since <BASE>:
  - git diff <BASE>
  - new files: git ls-files --others --exclude-standard
  - dirty before this run, not part of the artifact: <PRE_DIRTY or none>
  - executor's claims to verify, not evidence: <CODE_DIR>/REPORT.md, <CODE_DIR>/DECISIONS.md
Artifact type: source-code
Run the project's own lint and test scripts.
<only when the user chose Code anyway:>
Known plan gaps the user accepted. Don't fail the code for these alone: <stage 3 BLOCKERS, verbatim>
```

Run the **repair loop**. Budget spent → report `PARTIAL`. Revert nothing.

### Repair loop (stages 3 and 5)

An attempt is one validator run; `--budget` caps them.

1. Before each validator spawn, re-hash the frozen expectation. Changed → halt.
2. `VERDICT: PASS` → next stage.
3. `VERDICT: FAILED`, attempts left → send the producer:
   ```
   The validator FAILED your output. Address every BLOCKER. Don't change scope.
   Save to the same slug. Same return block.

   <validator report, verbatim>
   ```
   Then spawn a **fresh** validator with the same prompt. It has no memory of the last verdict, so it can't grade the fix against its own critique.
4. `VERDICT: FAILED`, no attempts left → budget spent.

`PASS` exists only when the latest validator literally returned `VERDICT: PASS`. Never re-word, filter, or reorder a validator report.

---

## Handoff checks

After every return, before moving on:

1. **Parse.** No `STATUS:` / `VERDICT:` line, or `DONE` with no `ARTIFACT` → ask the same subagent once: `Reply with only the return block.` Still malformed → halt. A malformed validator gets re-spawned once instead.
2. **Artifact exists** (`DONE` only). `ls` it. Ticket: `README.md`. Plan: `README.md` + `PLAN.md` or `TASKS.md`. Code: `REPORT.md` + `DECISIONS.md`. Missing → malformed.
3. **One slug.** All folders sit under `.agent-kit/handoffs/<key-lowercase>/`. Otherwise halt with both paths.
4. **Paths, not content.** Pass folder paths between stages, never pasted or summarized artifacts — a summary drops exactly what validation checks.

One progress line per stage result: `✅ Plan → .agent-kit/handoffs/yr-501/plan/ — validating`, `❌ Plan validation 1/3 — repairing`.

## Halts

Stop, report what exists, name the stage:

- No ticket key.
- Producer returned `BLOCKED` — show `HALT` verbatim.
- Return still malformed after one retry.
- Frozen expectation changed mid-loop.
- Stage folders under different slugs.
- User chose Stop.

Never fix a halt yourself or edit an artifact to get it past a validator.

---

## Final report

```markdown
## 🍳 Cook — <KEY> · <full | fast> · <DONE | PARTIAL | BLOCKED>

| Stage | Result | Attempts |
|---|---|---|
| Ticket | ✅ | – |
| Plan | ✅ | – |
| Validate plan | ✅ PASS · ⏭ skipped · ❌ FAILED, coded anyway | 1/3 |
| Code | ✅ | – |
| Validate code | ❌ FAILED · ⏭ skipped | 3/3 |

Handoffs: `.agent-kit/handoffs/<key>/`

**Changed:** <"Files Modified" section of REPORT.md, as-is>
**Defaults taken:** <every DEFAULTS line + user answers, one line each — omit if none>
**Flags:** <pre-existing dirty files, validation skipped, inline run — omit if none>
**Open issues:** <latest validator report verbatim, logic gaps, or halt text — omit if none>

Next: `/review`, then `/ship to <reviewer>`.   ← DONE only
```
