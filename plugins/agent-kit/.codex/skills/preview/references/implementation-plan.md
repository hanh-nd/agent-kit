# Strategy: implementation-plan

For implementation plans / WBS. Two shapes:

- **Single file** — `PLAN.md` (small plans): every section below lives in that one file.
- **File set** — `README.md` + `ARCHITECTURE.md` + `TASKS.md` (+ optional `TESTS.md`).
- **Anything else** with a numbered task breakdown and acceptance criteria — map its sections by meaning.

**Goal:** a reader sees *the shape of the build, the order, and the risks* at a glance, then expands for the full task list and criteria.

## Where each piece lives

| Piece | `PLAN.md` | File set |
| :--- | :--- | :--- |
| Goal, ACs, Decisions, Component Manifest, Scope, Risks | `PLAN.md` | `README.md` |
| System Flow, Data Contracts, What Must Be True, Failure Cases, Reuse Map | `PLAN.md` | `ARCHITECTURE.md` |
| Tasks (`[P]` / `[S: id]`), AC coverage | `PLAN.md > Tasks` (flat IDs) | `TASKS.md` (layers) |
| Test mapping, gaps | `PLAN.md > Checks` | `TESTS.md` |

A section that isn't there is skipped — don't render an empty card.

## Templates to study
- `templates/architecture.html` (hero + sidebar nav)
- `templates/data-table.html` (task breakdown table)
- `templates/mermaid-flowchart.html` (flow diagrams)

## Hero (the glance)

1. **Plan summary banner** — the Goal in one sentence. KPI chips: task count, ACs, CREATE / MODIFY / DELETE counts from the Component Manifest.
2. **Flow diagram** — render `System Flow` when present. No flow section → draw the task dependency graph from `[S: id]` instead.
3. **Task breakdown** — the centerpiece. Table or card-per-task: **ID · title · file · depends-on**, grouped by layer when layers exist. Scannable, not a prose list.
4. **Decisions** — one card per decision: chosen option, rejected option as a muted "not X" tag, one-line WHY.
5. **Risks** — `Risks` plus any Failure Case marked critical, as callouts with where it's handled.

## Drill-downs (collapsible `<details>` — full fidelity)

- **Full task list** — every task with its contract, error trigger, and dependencies.
- **Acceptance criteria + coverage** — ACs with the tasks that cover them.
- **What Must Be True + Failure Cases** — as tables.
- **Tests** — Test Mapping and Gaps (or `Checks`), when present.
- **Reuse Map + Component Manifest** — as tables.
- **Scope and dropped options.**

Collapsed by default; the hero is the first thing seen.

## Distillation rule
The task breakdown is a visual (table/cards with ID·file·deps), never a wall of bullet paragraphs. Full task prose goes in the drill-down. Surface the *sequence and risk* visually — that's what a reader can't get fast from the markdown.
