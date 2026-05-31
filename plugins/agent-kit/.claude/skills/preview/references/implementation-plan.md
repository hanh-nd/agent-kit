# Strategy: implementation-plan

For implementation plans / WBS (typically `ARCHITECTURE.md` + `TASKS.md`, or any doc with a numbered task breakdown, acceptance criteria, and a test plan).

**Goal:** a reader sees *the shape of the build, the order, and the risks* at a glance, then expands for the full task list and criteria.

## Templates to study
- `templates/architecture.html` (hero + sidebar nav)
- `templates/data-table.html` (task breakdown table)
- `templates/mermaid-flowchart.html` (architecture + sequence diagrams)

## References to read
- `references/html-design-guidelines.md`, `references/html-css-patterns.md` (always)
- `references/html-libraries.md` (Mermaid; Chart.js if you show progress/effort), `references/html-responsive-nav.md`

## Hero (the glance)

1. **Plan summary banner** — one or two sentences: what this plan delivers. Optionally KPI-style chips: task count, est. effort (human vs Claude if the plan states it), # of new vs changed files.
2. **Architecture diagram** — render the Mermaid architecture/component diagram from `ARCHITECTURE.md`. If the plan describes current-vs-planned, show paired diagrams (current = muted, planned = accent).
3. **Task breakdown** — the WBS as a visual: a compact table or card-per-task with **ID · title · effort · depends-on**. Group by phase/area if the plan does. This is the centerpiece — make it scannable, not a prose list.
4. **Sequence / order** — the recommended implementation order as a numbered pipeline (`html-css-patterns.md` → "Pipeline") or an ordered Mermaid flow. Show dependencies.
5. **Risks** — top risks as chips/callouts, each with a one-line mitigation.

## Drill-downs (collapsible `<details>` — full fidelity)

- **Full task list** — every task with its complete description, files touched, and notes.
- **Acceptance criteria** — as a checklist or table.
- **Test plan** — what's tested, how (render `TESTS.md` if present).
- **Architecture detail** — full component/responsibility breakdown.
- **Open questions / verify-before-implementing** — anything the plan flags as unresolved.

Collapsed by default; the hero is the first thing seen.

## Distillation rule
The task breakdown is a visual (table/cards with ID·effort·deps), never a wall of bullet paragraphs. Full task prose goes in the drill-down. Surface the *sequence and risk* visually — that's what a reader can't get fast from the markdown.
