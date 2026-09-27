# Plan Artifact Templates

Compose targets for Phase 4. Fill every placeholder — a template shipped with `<angle brackets>` intact is unfinished. Drop an optional section rather than filling it with "n/a".

Size decides the set: **S** → `PLAN.md` only. **M / L / XL** → `README.md`, `ARCHITECTURE.md`, `TASKS.md`, `TESTS.md` (tests on).

Each fact has one home:

| Fact | S | M+ |
| :--- | :--- | :--- |
| Goal, ACs, decisions, scope, dropped options, risks, component manifest | `PLAN.md` | `README.md` |
| Flow, contracts, What Must Be True, failure cases, reuse map | `PLAN.md` | `ARCHITECTURE.md` |
| Tasks, AC coverage | `PLAN.md` | `TASKS.md` |
| Contract → test mapping, gaps | `PLAN.md > Checks` | `TESTS.md` |

---

## PLAN.md (S)

```markdown
# Plan: <Feature Name>

> **Status:** APPROVED · **Created:** <YYYY-MM-DD> · **Source:** <ticket-id / brief-path / user-request> · **Complexity:** S

## Goal
<One sentence>

## Acceptance Criteria
- [ ] AC1: <observable, verifiable condition>

## Decisions
1. **<Area>:** <chose X> (NOT <Y>) — WHY: <one line>. RISK: <main risk, or "none identified">.

## Component Manifest
| Action | Path | Purpose | Reuse check |
| :--- | :--- | :--- | :--- |
| MODIFY | `path/to/file.ts` | <one line> | — |
| CREATE | `path/to/new.ts` | <one line> | searched `<terms>` → no match |

## What Must Be True
| ID | Must hold | Covers |
| :--- | :--- | :--- |
| BC1 | Given <precondition>, <subject> MUST <observable outcome> | AC1 |

## Failure Cases
<!-- optional: omit when nothing can realistically fail -->
| # | What goes wrong | What the system does | Handled by |
| :--- | :--- | :--- | :--- |
| F1 | <failure> | <response> | Task 2 |

## Reuse Map
| Existing asset | Path | Used for |
| :--- | :--- | :--- |
| <function/pattern> | `path/to/file.ts:42` | <where this plan uses it> |

## Tasks
- [ ] [P] **Task 1:** In `<file_path>`, <change> per BC1.
  - _Contract:_ <inputs and outputs — or the one line, when that is the whole change>
  - _Error:_ <exception and exact trigger>
- [ ] [S: 1] **Task 2:** ...

AC coverage: AC1 → Task 1.

## Checks
<!-- omit when tests are off; record why in Decisions -->
| Contract | Checked by |
| :--- | :--- |
| BC1 | Task 1 |

## Scope
**OUT:** <excluded item — one line reason>
```

---

## README.md (M+)

```markdown
# Plan: <Feature Name>

> **Status:** APPROVED · **Created:** <YYYY-MM-DD> · **Source:** <ticket-id / brief-path / user-request> · **Complexity:** <M | L | XL>

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

Defaults taken without asking are listed here too, marked `(default — override if wrong)`.

## Component Manifest

Built from the paths in `TASKS.md`. No search, no CREATE.

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
- <option we looked at — one line why not>

## Risks
- <project-level risk the user should see>
```

---

## ARCHITECTURE.md (M+)

```markdown
# Architecture: <Feature Name>

> Goal and decisions: `README.md`. Tasks: `TASKS.md`.

## System Flow
<!-- optional: only when there is real flow to show -->
<Mermaid: sequence, flowchart, or state diagram of the new or changed behavior>

## Data Contracts

\```ts
// path/to/file.ts
export function bar(input: X): Y;
\```

Only contracts that cross a boundary or that tasks reference. No interface with one implementation.

## What Must Be True

| ID | Must hold | Covers |
| :--- | :--- | :--- |
| BC1 | Given <precondition>, <subject> MUST <observable outcome> | AC1 |
| BC2 | Given <precondition>, <subject> MUST NOT <outcome> | F1 |

## Failure Cases

| # | What goes wrong | What the system does | Handled by |
| :--- | :--- | :--- | :--- |
| F1 | <failure case> | <technical response> | <TASKS.md task ID> |

## Reuse Map

One row per rung-2 hit from the ladder.

| Existing asset | Path | Used for |
| :--- | :--- | :--- |
| <function/class/pattern> | `path/to/file.ts:42` | <where this plan uses it> |
```

---

## TASKS.md (M+)

```markdown
# Tasks: <Feature Name>

> Contracts and IDs: `ARCHITECTURE.md`.
> **Notation:** `[P]` = safe to run in parallel inside its layer. `[S: id]` = waits on the listed tasks. Layers run in order.

## Layer 1: Foundation
<!-- schema, migrations, shared contracts other tasks depend on; omit when none -->
- [ ] [P] **Task 1.1:** In `<file_path>`, <change> per `ARCHITECTURE.md > Data Contracts > <Name>`.

## Layer 2: Core Logic & Edge Cases
- [ ] [P] **Task 2.1:** In `<file_path>`, implement `<funcName>(input: <Type>): <Return>` per BC1.
  - _Contract:_ <inputs and outputs only — or the one line, when that is the whole change>
  - _Error:_ <exception type and exact trigger>
- [ ] [S: 2.1] **Task 2.2:** ...

## Layer 3: Integration & Presentation
- [ ] [S: 2.1, 2.2] **Task 3.1:** ...

## AC Coverage

| AC ID | Covered by |
| :--- | :--- |
| AC1 | Task 2.1, Task 3.1 |
| AC2 | Task 2.2 |
```

---

## TESTS.md (M+, tests on)

```markdown
# Tests: <Feature Name>

> BC and F IDs: `ARCHITECTURE.md`. Task IDs: `TASKS.md`.

One runnable check per piece of non-trivial logic. Trivial one-liners need none.

## Test Mapping

| Contract ID | Tested by |
| :--- | :--- |
| BC1 | Task 2.1 |
| F1 | Task 2.2 |

## Gaps

Anything in `ARCHITECTURE.md` with no test task. Each gets a task, or a note on how it's verified without one. No handling **and** silent (no log, no error, no user signal) → **CRITICAL**, add a task.

| Item | Verified how | Resolution |
| :--- | :--- | :--- |
| F2 | nothing — fails silently | **CRITICAL — Task X.Y added** |
```
