# Plan Artifact Templates

Compose targets for Phase 4. Fill every placeholder — a template shipped with `<angle brackets>` intact is an unfinished artifact.

---

## README.md

```markdown
# Plan: <Feature Name>

> **Status:** APPROVED
> **Created:** <YYYY-MM-DD>
> **Source:** <ticket-id / design-brief-path / user-request>
> **Complexity:** <S | M | L | XL>

## Goal
<One sentence: what we're building and why>

## Acceptance Criteria
- [ ] AC1: <observable, verifiable condition>
- [ ] AC2: <...>

## Decisions
1. **<Area>:** <chose X> (NOT <rejected Y>)
   - WHY: <one line>
   - HOW: <concrete approach>
   - RISK: <main risk, or "none identified">
2. **<Next>:** ...

## Component Manifest

Every CREATE row carries the search that proves nothing existing fits.
No search, no CREATE — reuse instead.

| Action | Path | Purpose | Reuse check |
| :--- | :--- | :--- | :--- |
| CREATE | `path/to/file.ts` | <one line> | searched `<command or terms>` → no match |
| MODIFY | `path/to/other.ts` | <one line> | — |
| DELETE | `path/to/dead.ts` | <one line reason> | — |

## Scope
**IN:**
- <feature/behavior>

**OUT:**
- <excluded item — one line reason>

## Considered and dropped
- <architectural option we looked at — one line why not>

## Risks
- <project-level risk the user should see>

## File Map
- `README.md` (this file) — decisions, component manifest, summary
- `ARCHITECTURE.md` — diagrams, contracts, failure cases, reuse map
- `TASKS.md` — the work breakdown + AC coverage
- `TESTS.md` — codepaths, test mapping, gaps

## Summary
- Scope challenge: <accepted as-is | cut per recommendation | skipped (Design Brief)>
- Architecture: <N issues, N resolved>
- Code quality: <N issues, N resolved>
- Tests: <N gaps, N critical>
- Performance: <N issues, N resolved>
- Existing code reused: <N places>
- Critical gaps: <N>
```

---

## ARCHITECTURE.md

```markdown
# Architecture: <Feature Name>

> See `README.md` for goal, decisions, and component manifest.
> See `TASKS.md` for the work breakdown referencing the contracts below.

## System Flow
<Mermaid: sequence, flowchart, or state diagram of the new or changed behavior>

## Data Contracts

\```ts
// path/to/file.ts
export interface FooContract { ... }
export function bar(input: X): Y;
\```

## What Must Be True

| ID | Must hold | Covers |
| :--- | :--- | :--- |
| BC1 | Given <precondition>, <subject> MUST <observable outcome> | AC1 |
| BC2 | Given <precondition>, <subject> MUST NOT <outcome> | F1 |

## Failure Cases

| # | What goes wrong | What the system does | Handled where |
| :--- | :--- | :--- | :--- |
| F1 | <failure case> | <technical response> | <TASKS.md task ID> |

## Reuse Map

What this plan leans on instead of rebuilding. One row per rung-2 hit from the ladder.

| Existing asset | Path | Used for |
| :--- | :--- | :--- |
| <function/class/pattern> | `path/to/file.ts:42` | <where this plan uses it> |

## Considered and dropped
- <architectural option we looked at — one line why not>
```

---

## TASKS.md

```markdown
# Tasks: <Feature Name>

> See `README.md` for goal and decisions.
> See `ARCHITECTURE.md` for the contracts referenced below.

> **Notation:** `[P]` = safe to run in parallel inside its layer. `[S: id]` = waits on the listed tasks. Layers always run in order.

## Layer 1: Foundation & Types
- [ ] [P] **Task 1.1:** In `<file_path>`, export interface `<Name>` per `ARCHITECTURE.md > Data Contracts > <Name>`.
- [ ] [P] **Task 1.2:** ...

## Layer 2: Core Logic & Edge Cases
- [ ] [P] **Task 2.1:** In `<file_path>`, implement `<funcName>(input: <Type>): <Return>` per `ARCHITECTURE.md > Data Contracts > <Name>`.
  - _Contract:_ <inputs and outputs only — no algorithm>
  - _Error:_ <exception type and exact trigger>
- [ ] [S: 2.1] **Task 2.2:** ...

## Layer 3: Integration & Presentation
- [ ] [S: 2.1, 2.2] **Task 3.1:** ...

## AC Coverage

| AC ID | Covered by |
| :--- | :--- |
| AC1 | Task 2.1, Task 3.1 |
| AC2 | Task 2.3 |

An AC with no task means the plan is incomplete. Add the task before saving.
```

---

## TESTS.md

```markdown
# Tests: <Feature Name>

> See `README.md` for goal and ACs.
> See `TASKS.md` for the task IDs below.
> See `ARCHITECTURE.md` for the BC and F IDs below.

## Codepath Diagram
<Mermaid: every new codepath, annotated with which contract it exercises>

## Test Mapping

| Contract ID | Covers | Tested by |
| :--- | :--- | :--- |
| BC1 | AC1 | Task 2.1 |
| BC2 | F1 | Task 2.3 |

## Gaps

Anything in `ARCHITECTURE.md` with no test task. Each needs a task, or a written note on how it gets verified without one.

| Item | Test task? | Verified another way? | Resolution |
| :--- | :--- | :--- | :--- |
| BC1 | yes (Task 2.1) | n/a | covered |
| F2 | NO | no — fails silently | **CRITICAL — add Task X.Y to TASKS.md** |

## Critical Gaps

Gaps where nothing handles the error AND the failure is silent — no log, no user-facing signal, no exception:
- <none / explicit list>
```
