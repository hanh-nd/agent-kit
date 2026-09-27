# Strategy: implementation-plan

For implementation plans / WBS — a plan folder, or anything with a numbered task breakdown and acceptance criteria.

Read every file. `README.md` is the human summary; the rest is implementer detail, and each file's header says what it holds. Map sections by meaning.

**Goal:** a reader sees *the shape of the build, the order, and the risks* at a glance, then expands for the full task list and criteria.

A section that isn't there is skipped — don't render an empty card.

## Templates to study
- `templates/architecture.html` (hero + sidebar nav)
- `templates/data-table.html` (task breakdown table)
- `templates/mermaid-flowchart.html` (flow diagrams)

## Hero (the glance)

1. **Plan summary banner** — the Goal in one sentence. KPI chips: task count, ACs, CREATE / MODIFY / DELETE counts from the Component Manifest.
2. **Flow diagram** — from `How it works` (ASCII) when present. You may redraw it as Mermaid with the same boxes and arrows — add nothing. Keep the `*` new/changed marks as a highlight. No such section → draw the task dependency graph from `[S: id]` instead.
3. **Task breakdown** — the centerpiece. Table or card-per-task: **ID · title · file · depends-on**, grouped by layer when layers exist. Scannable, not a prose list.
4. **Decisions** — one card per decision line (`chose X over Y — why`): chosen option, rejected option as a muted "not X" tag, the one-line why.
5. **Risks** — `Risks` plus any Failure Case marked critical, as callouts with where it's handled.

## Drill-downs (collapsible `<details>` — full fidelity)

- **Full task list** — every task with its contract, error trigger, and dependencies.
- **Acceptance criteria + coverage** — ACs with the tasks that cover them.
- **What Must Be True + Failure Cases** — as tables.
- **Tests** — Test Mapping and Gaps (or `Checks`), when present.
- **Reuse Map + Component Manifest** — as tables.
- **What changes and Not included.**

Collapsed by default; the hero is the first thing seen.

## Distillation rule
The task breakdown is a visual (table/cards with ID·file·deps), never a wall of bullet paragraphs. Full task prose goes in the drill-down. Surface the *sequence and risk* visually — that's what a reader can't get fast from the markdown.
