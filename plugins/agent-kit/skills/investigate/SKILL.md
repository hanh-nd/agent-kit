---
name: investigate
description: 'Use when investigating bugs, errors, crashes, failing tests, regressions, flaky behavior, unexpected runtime behavior, or unclear root causes before implementation.'
version: 2.1.0
providers:
  claude:
    effort: high
---

# 🔎 Investigate

**Issue:** $ARGUMENTS

---

## The iron law

**No conclusions without evidence.** A hypothesis without proof is a guess.

Your job is to find and confirm the root cause, not to fix it. No source changes. The output is an Investigation Report for a developer or the `code` skill.

## Voice

Write for a tired teammate, not a reviewer you're impressing.

- Short sentences, one idea each. Cut every word that isn't load-bearing.
- Plain words. "What else this touches", not "blast radius".
- Answer first, reason second. Never the reverse.
- Bullets and tables over paragraphs. Three bullets max per point.
- A question is one question plus one recommendation, under 5 lines.
- No filler openers, no self-praise, no restating the request back.
- If the explanation is longer than the thing it explains, delete the explanation.

## How to think

Debugging isn't explaining the bug. It's eliminating possible worlds until one proven world is left.

```
Observe → localize → hypothesize → distinguish → verify → trace back → hand off
```

The question at every step: **what did I directly verify that would look different if this hypothesis were false?**

**When it counts as confirmed:** you observed the suspected condition on the failing path, or ran a targeted test separating it from the alternatives. Reading code and thinking "this would explain it" is a lead. Leads support `PROBABLE`. They never confirm.

Generate hypotheses freely from known failure modes — races, null propagation, state corruption, config drift, caching, off-by-one, dependency conflicts, serialization, auth. But a pattern match is a *lead*, never a conclusion.

When the evidence allows more than one cause, hold 2–3 and name what tells them apart:

```
Root cause might be X because Y.
Confirmed by A.
Refuted by B.
Fastest way to tell: C.
```

A known-good comparison in the same codebase — input shape, config, call order, state — is evidence. A generic pattern match isn't. A file patched repeatedly for similar issues is telling you something about the architecture, not a coincidence.

---

## Phase 1 — Observe

Capture what's happening before forming any theory.

1. **Baseline:** exact command, full error and test output, stack trace, timestamped logs, `git status --short`. This is what `code` verifies against after the fix.
2. **Symptoms, verbatim** — error messages, stack traces, repro steps.
3. **Reproduce** deterministically. Intermittent → document when it appears.
4. **No root-cause sentence yet.** Observed facts only.

## Phase 2 — Localize

1. **Name the smallest failing layer:** test harness, UI, API, job, database, dependency, config, environment, external service.
2. **Shrink the trigger** to the smallest test, input, route, or fixture that still fails — but stop minimizing once the cause is exposed.
3. **Trace backward** through callers, data flow, config, state, dependency boundaries.
4. **Check history:** `git log --oneline -20 -- <affected-files>`.

## Phase 3 — Distinguish and verify

Define the proof before testing: what confirms it, what refutes it, and the fastest safe test. Then:

1. **Run tests that separate causes.** Re-confirming the same symptom without narrowing anything is weak evidence.
2. **Verify the condition itself** — the bad value, branch, state transition, response, or call order actually happening on the failing path. Not just the symptom.
3. **Instrument only when needed.** Temporary logs and assertions at the suspected cause. Remove every one afterward.
4. **Read the output.** Never infer from exit code alone.
5. **Record each hypothesis** `CONFIRMED / REFUTED / INCONCLUSIVE`, with the observation that decided it — not just the command that reproduced it.
6. **Three strikes.** Three refuted hypotheses in a row → stop. The cause is architectural, or needs context you don't have. Status `INCONCLUSIVE`, document what's ruled out.

## Phase 4 — Trace the chain

After confirming, trace backward:

```
Symptom → immediate cause → contributing factors → root cause
```

Root cause is the earliest actionable trigger inside the codebase or its config. A chain that stops where the error appeared caps the status at `PROBABLE`. Recommended actions target the root cause, not where the symptom showed up.

**Recommending the fix:** prefer the guard, validator, or utility the codebase already has over a new one. One guard in the shared function is a smaller change than a guard in every caller — and patching only the path in the ticket leaves every sibling caller broken. Before recommending a new helper, search for the existing one.

---

## Phase 5 — Save and hand off

1. **Check:** no temporary instrumentation left in source.
2. **Save immediately.** If `$ARGUMENTS` contains `.agent-kit/handoffs/<slug>/...`, use `<slug>` exactly. Otherwise derive a short one. Call `kit_save_handoff(type: "investigation", slug: <slug>, files: { "README.md": <full report> })`.

```
# 🔍 INVESTIGATION REPORT: [Short Title]

> **Status:** [CONFIRMED | PROBABLE | INCONCLUSIVE]
> **Known failure mode:** [named pattern, or "None"]

---

## 📌 Summary
* **Symptom:** [what happens + how to reproduce]
* **Root cause:** [the mechanism, plainly]
* **What else it touches:** [N files] — [systems affected]
* **Verification target:** [exact command failing now that should pass after the fix]

---

## 🛠 Detail

### 0. Baseline
| Item | Evidence |
| :--- | :--- |
| Command / repro | `[exact command or steps]` |
| Error / output | `[verbatim]` |
| Logs / stack trace | `[excerpt, timestamped]` |
| Git state | `[git status --short]` |
| Failing layer / smallest repro | `[layer + repro, or "not reduced because ..."]` |

### 1. Root Cause
* **Chain:** symptom → immediate cause → contributing factors → root cause
* **Directly verified:** [what you observed on the failing path; if nothing, why the status is PROBABLE or INCONCLUSIVE]
* **[Primary issue]:** [explanation]
* **[Contributing factor]:** [explanation]

### 2. Hypothesis Ledger
| Hypothesis | Confirms it | Refutes it | Result | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| [Root cause is X because Y] | ... | ... | CONFIRMED / REFUTED / INCONCLUSIVE | [file:line, output, observation] |

### 3. Evidence
| Location | Observation | Why it matters |
| :--- | :--- | :--- |
| `path/to/file:line` | [output/snippet/value] | [how it confirms the hypothesis] |

---

## 🚀 Recommended Actions
[For `code` or a developer. Target the root cause. No symptom patches unless proven identical.]
1.  **[File/Component]:** [the specific fix]

**Reuse:** [existing guard/validator/utility this fix should use, with path — or "none applies"]

### Prevention
[Every report names prevention, or says why none applies.]
* **Regression coverage:** [test or assertion that fails before the fix, passes after]
* **Guard:** [boundary check, type guard, timeout, transaction — if applicable]
* **Observability:** [log or error context making a recurrence diagnosable, or "none needed"]

---

## 🔗 Context
* **History:** [prior bugs here, TODOs, architectural notes]
* **Path taken:** [ledger summary — especially the refuted paths future agents shouldn't retry]
* **Hard stop notes:** [if more than 5 files affected, or reproduction impossible]
```

**Status meanings:** `CONFIRMED` — traced and directly evidenced. `PROBABLE` — strong, not directly verified (static reading only, intermittent, restricted environment). `INCONCLUSIVE` — three strikes.

3. **Show the menu.** For `CONFIRMED` / `PROBABLE`: the saved path, then `1) Fix it now — start /code with this report` or `2) Done`. For `INCONCLUSIVE`: save, print the path, say to keep investigating before implementing.

---

## Hard stops

- **More than 5 files affected** — likely architectural. Note it, recommend planning before any fix.
- **Can't reproduce**, and the environment difference is unclear — note the gap, cap the status at `PROBABLE` or `INCONCLUSIVE`.
- **Root cause is in a dependency** — document it and stop. Don't trace into the package.
