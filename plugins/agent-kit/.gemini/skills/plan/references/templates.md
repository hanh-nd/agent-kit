# Plan Artifact Templates

Compose targets for Phase 4. Fill every placeholder — a template shipped with `<angle brackets>` intact is unfinished. Drop an optional section rather than filling it with "n/a".

Size decides the set: **S** → `README.md` + `PLAN.md`. **M / L / XL** → `README.md`, `ARCHITECTURE.md`, `TASKS.md`, `TESTS.md` (tests on).

Split by reader. `README.md` is for the human: one screen, plain words. Every other file is for the implementing agent and carries the detail.

Each fact has one home:

| Fact | S | M+ |
| :--- | :--- | :--- |
| Summary, what changes, flow diagram, decisions, ACs, not included, risks | `README.md` | `README.md` |
| Component manifest, contracts, What Must Be True, failure cases, reuse map | `PLAN.md` | `ARCHITECTURE.md` |
| Tasks, AC coverage | `PLAN.md` | `TASKS.md` |
| Contract → test mapping, gaps | `PLAN.md > Checks` | `TESTS.md` |

Every file opens with a `>` line naming its reader, its purpose, and where the other facts live. Consumers read every file and rely on that line — no other skill maps files to sections.

Files disagree (an AC, ID, contract, or task that differs between two files) → that's a plan bug. Fix it before saving; never ship it.

---

## README.md (all sizes)

````markdown
# <Feature Name>

> APPROVED · <YYYY-MM-DD> · <ticket-id / brief-path / user-request> · <S | M | L | XL>

**In one line:** <what the user/system gets, plain words>

## What changes
- Today: <current behavior>. After: <new behavior>.
- <3–6 bullets total; behavior, not files>

## How it works
<!-- optional: omit when there is no real flow (config tweak, rename) -->
```text
<ASCII diagram — see rules below>
```

## Decisions
- <Chose X over Y> — <why, one line>.
- <area>: <value> (default — override if wrong)

## Done when
- [ ] AC1: <observable, verifiable condition>

## Not included
<!-- optional -->
- <item> — <one-line reason>

## Risks
<!-- optional: at most 3 -->
- <risk> — <mitigation>

This page is the human summary. Implementer details: <S: `PLAN.md` | M+: `ARCHITECTURE.md` · `TASKS.md` · `TESTS.md` (tests on)>
````

**Rules:**

- Fits on one screen apart from the diagram. No file paths, no BC / F / task IDs, no code, no tables. AC IDs are fine — the agent files point to them.
- "What changes" is the story. "Done when" is the pass/fail list. A bullet that restates an AC gets cut.
- Decisions: one line each, "chose X over Y — why". The rejected option lives in that line; there is no separate dropped-options list. No WHY / HOW / RISK sub-bullets — HOW goes in tasks or contracts, RISK goes in Risks.
- Risks: at most 3.
- Empty optional section (How it works, Not included, Risks) → drop it.

**The diagram:**

- ASCII, never Mermaid. Plain text in a ```` ```text ```` fence: boxes and arrows (`[ Box ] --> [ Box ]`, `|`, `v`).
- ≤ ~10 boxes, ≤ 80 columns wide.
- Mark new or changed parts with `*` and add the legend line `* = new/changed`.
- Draw only the flow traced in the code in Phase 1. Never invent architecture.

Example:

```text
[ Checkout form ] --> [ Create order ] --> [ Charge card ] --> [ Order saved ]
                                                  |                   ^
                                                  | declined          |
                                                  v                   |
                                           [ Retry step ]* -----------+

* = new/changed
```

---

## PLAN.md (S)

```markdown
# Plan: <Feature Name>

> For the implementer: contracts, reuse, tasks, and checks. Goal, ACs, decisions, what's not included, risks: `README.md`.

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

## Component Manifest

Built from the paths in Tasks. No search, no CREATE.

| Action | Path | Purpose | Reuse check |
| :--- | :--- | :--- | :--- |
| MODIFY | `path/to/file.ts` | <one line> | — |
| CREATE | `path/to/new.ts` | <one line> | searched `<terms>` → no match |

## Tasks
- [ ] [P] **Task 1:** In `<file_path>`, <change> per BC1.
  - _Contract:_ <inputs and outputs — or the one line, when that is the whole change>
  - _Error:_ <exception and exact trigger>
- [ ] [S: 1] **Task 2:** ...

AC coverage: AC1 → Task 1.

## Checks
<!-- omit when tests are off; record why in README Decisions -->
| Contract | Checked by |
| :--- | :--- |
| BC1 | Task 1 |
```

---

## ARCHITECTURE.md (M+)

```markdown
# Architecture: <Feature Name>

> For the implementer: contracts, what must be true, failure cases, reuse, and the component manifest. Goal, ACs, decisions: `README.md`. Tasks: `TASKS.md`. Tests: `TESTS.md` (tests on).

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

## Component Manifest

Built from the paths in `TASKS.md`. No search, no CREATE.

| Action | Path | Purpose | Reuse check |
| :--- | :--- | :--- | :--- |
| CREATE | `path/to/file.ts` | <one line> | searched `<command or terms>` → no match |
| MODIFY | `path/to/other.ts` | <one line> | — |
| DELETE | `path/to/dead.ts` | <one line reason> | — |
```

---

## TASKS.md (M+)

```markdown
# Tasks: <Feature Name>

> For the implementer: the build order. ACs: `README.md`. Contracts and IDs: `ARCHITECTURE.md`.
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

> For the implementer: the test obligations — which task checks each contract, and the gaps. BC and F IDs: `ARCHITECTURE.md`. Task IDs: `TASKS.md`.

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
