---
name: investigate
description: 'Use when investigating bugs, errors, crashes, failing tests, regressions, flaky behavior, unexpected runtime behavior, or unclear root causes before implementation.'
version: 2.0.0
providers:
  claude:
    effort: high
---

# 🔎 Investigate

**Issue:** $ARGUMENTS

---

## The Iron Law

**No conclusions without evidence.** A hypothesis without proof is a guess. Your job is to find and confirm the root cause — not to fix it. Source code changes are out of scope; this skill produces an Investigation Report for a developer or the `code` skill.

## Core Mental Model

Debugging is not explaining the bug. Debugging is eliminating possible worlds until only one mechanically proven world remains:

```
Observe → localize → hypothesize → distinguish → verify → trace back → hand off
```

The decisive question at every step: **What did I directly verify that would have been different if this hypothesis were false?**

**Confirmation standard:** a root cause is `CONFIRMED` only when the investigation observes the suspected condition in the failing path, or runs a targeted test separating it from plausible alternatives. Static code reading and "this would explain it" are leads — they support `PROBABLE`, never confirm.

Generate hypotheses from your knowledge of common failure modes (races, null propagation, state corruption, integration/config drift, caching, off-by-one, dependency conflicts, serialization, auth) freely — but a catalog match is a *lead*, never a conclusion. When evidence allows more than one cause, hold 2–3 competing hypotheses and name what observation distinguishes them:

```
The root cause might be X because Y.
It would be confirmed by A.
It would be refuted by B.
The fastest distinguishing observation is C.
```

A known-good comparison in the same codebase (input shape, config, call order, state) is evidence; a generic pattern match is only a lead. A file patched repeatedly for similar issues signals architecture, not coincidence.

---

## Phase 1: Observe Reality

Capture what is actually happening before forming any theory.

1. **Capture baseline:** exact command run, full error/test output, stack trace, timestamped logs, `git status --short`. This before-state is what `code` verifies against after fixing.
2. **Collect symptoms verbatim** — error messages, stack traces, repro steps.
3. **Reproduce** deterministically; if intermittent, document appearing conditions.
4. **Preserve uncertainty** — no root-cause sentence yet; only observed facts.

## Phase 2: Localize the Boundary

1. **Name the smallest visible failing layer:** test harness, UI, API, job, database, dependency, configuration, environment, external service.
2. **Reduce broad triggers** to the smallest test/input/route/fixture that still fails — but don't minimize for its own sake once the cause is directly exposed.
3. **Trace execution backward** from the localized failure through callers, data flow, config, state, dependency boundaries.
4. **Check history:** `git log --oneline -20 -- <affected-files>` for recent regressions.

## Phase 3: Distinguish and Verify

Define proof before testing: state confirm evidence, refute evidence, and the fastest safe test first. Then:

1. **Prefer discriminating tests** that separate plausible causes; re-confirming the same symptom without narrowing cause is weak evidence.
2. **Verify the suspected condition itself** — the bad value, branch, state transition, response, or call order actually occurring on the failing path — not just the symptom.
3. **Instrument only when needed**, with temporary logs/assertions at the suspected cause; remove them all afterward.
4. **Read the output** — never infer from command success/failure alone.
5. **Record each hypothesis** `CONFIRMED / REFUTED / INCONCLUSIVE` with the distinguishing observation, not merely the reproducing command.
6. **3-strike rule:** three consecutive refuted hypotheses → stop; the cause is architectural or needs unavailable context. Status `INCONCLUSIVE`; document what was ruled out.

## Phase 4: Trace the Causal Chain

After confirmation, trace backward:

```
Symptom → immediate cause → contributing factor(s) → root cause
```

Root cause = earliest actionable trigger inside the codebase or its configuration boundary. A chain stopping where the error appeared caps status at `PROBABLE`. Recommended Actions target the root cause, not the symptom location.

---

## Phase 5: Persist & Handoff

1. **Constraint check:** no temporary instrumentation remains in source.
2. **Persist immediately.** If `$ARGUMENTS` contains `.agent-kit/handoffs/<slug>/...`, extract `<slug>` verbatim; otherwise derive a short slug. Call `kit_save_handoff(type: "investigation", slug: <slug>, files: { "README.md": <full report> })`.

```
# 🔍 INVESTIGATION REPORT: [Short Descriptive Title]

> **Status:** [CONFIRMED | PROBABLE | INCONCLUSIVE]
> **Pattern Match:** [Named failure mode, or "None"]

---

## 📌 Executive Summary
* **Symptom:** [observed behavior/error + steps to reproduce]
* **Root Cause:** [high-level mechanical explanation]
* **Blast Radius:** [number of files] — [systems/modules affected]
* **Verification Target:** [exact command/step failing now that should pass after fix]

---

## 🛠 Technical Deep Dive

### 0. Baseline Captured
| Item | Evidence |
| :--- | :--- |
| Command / Repro Step | `[exact command or steps]` |
| Error / Output | `[verbatim failure output]` |
| Logs / Stack Trace | `[relevant excerpt, timestamped]` |
| Git State | `[git status --short summary]` |
| Localized Boundary / Reduced Repro | `[failing layer + smallest repro, or "not reduced because ..."]` |

### 1. Root Cause Analysis
* **Root Cause Chain:** Symptom → immediate cause → contributing factor(s) → root cause
* **Direct Verification:** [the observed condition confirming it occurs on the failing path; if unavailable, why status is PROBABLE/INCONCLUSIVE]
* **[Primary Issue]:** [detailed explanation]
* **[Contributing Factor]:** [detailed explanation]

### 2. Hypothesis Ledger
| Hypothesis | Confirm Evidence | Refute Evidence | Result | Evidence Used |
| :--- | :--- | :--- | :--- | :--- |
| [Root cause is X because Y] | ... | ... | CONFIRMED / REFUTED / INCONCLUSIVE | [file:line, output, log, observation] |

### 3. Evidence & Observations
| Location (File:Line) | Observation | Significance |
| :--- | :--- | :--- |
| `path/to/file:line` | [output/snippet/state value] | [how this confirms the hypothesis] |

---

## 🚀 Recommended Actions
[Steps for `code`/a developer targeting the root cause — not symptom patches unless proven identical.]
1.  **[File/Component]:** [specific fix logic]

### Prevention Needed
[Every report names prevention or states why none applies.]
* **Regression Coverage:** [test/manual assertion failing before fix, passing after]
* **Guard / Validation:** [boundary check, type guard, timeout, transaction, etc., if applicable]
* **Observability:** [log/error context making recurrence diagnosable, or "none needed"]

---

## 🔗 Metadata & Context
* **Related History:** [prior bugs here, TODOs, architectural notes]
* **Investigation Path:** [hypothesis ledger summary — especially refuted paths future agents should not retry]
* **Hard Stop Notes:** [if Blast Radius > 5 files or reproduction impossible, explain]
```

**Status definitions:** `CONFIRMED` (traced + directly evidenced) · `PROBABLE` (strong but not directly verified — static analysis only, intermittent, restricted environment) · `INCONCLUSIVE` (3-strike triggered).

3. **Present the menu** for `CONFIRMED`/`PROBABLE`: saved path + choice of `1) Execute fix now — start /code with this report` or `2) Done`. For `INCONCLUSIVE`: save the report, print the path, and instruct to continue investigating before implementation.

---

## Hard Stops

- **Blast radius > 5 files** — likely architectural; note in report, recommend planning before any fix.
- **Reproduction impossible** and environment difference unclear — note the gap, cap status at `PROBABLE`/`INCONCLUSIVE`.
- **Root cause in a dependency** — document and stop; do not trace into the package/service.
