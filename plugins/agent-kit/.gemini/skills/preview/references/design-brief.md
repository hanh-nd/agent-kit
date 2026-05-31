# Strategy: design-brief

For Design Briefs (typically a `README.md` decision-log + `DETAIL.md` technical spec, or any doc with Problem / Decisions / Scope structure).

**Goal:** a reader understands *what we're building and why* within seconds of glancing, then expands for full fidelity.

## Templates to study
- `templates/architecture.html` (primary — hero + cards + sidebar nav)
- `templates/mermaid-flowchart.html` (for the flow/architecture diagram)

## References to read
- `references/html-design-guidelines.md`, `references/html-css-patterns.md` (always)
- `references/html-libraries.md` (Mermaid), `references/html-responsive-nav.md` (sticky TOC for the drill-downs)

## Hero (the glance — top of page, no scrolling needed to grasp it)

1. **Problem banner** — one sentence. Pull from `## Problem`. Big, high-contrast. Optionally the Who / Status-Quo / Why-Now as three small inline facts.
2. **Decision cards** — one card per item in `## Decisions`. Each card shows:
   - the **area + chosen option** as the card title (e.g. "Output location: PREVIEW.html");
   - a one-line **WHY**;
   - the rejected alternative as a struck/muted "not X" tag;
   - a small **RISK** chip if present.
   Lay cards in a responsive grid (`html-css-patterns.md` → "Card Grid").
3. **Flow / architecture diagram** — render the Mermaid diagram from `DETAIL.md` → `## System Flow`. If none exists, synthesize a simple flowchart from the decisions/entities. Center it; add zoom controls if 10+ nodes.
4. **Scope columns** — three columns: **IN** / **OUT** / **Future**, as compact chip lists. Pull from `## Scope`. This is the fastest "what's covered" signal — keep it tight.

## Drill-downs (collapsible `<details>`, below the hero — full fidelity, nothing dropped)

- **Full decisions** — each decision's complete WHY / HOW / RISK.
- **Edge cases & failure modes** — render `DETAIL.md` → the edge-case table as an HTML table (`html-css-patterns.md` → "Data Tables").
- **Core entities** — if present, as a code block or small cards.
- **Reuse / New** — the reuse map.
- **Handoff to planning** — focus areas, "verify before implementing", "decide before implementing".

Keep every drill-down **collapsed by default** so the hero is what the reader sees first.

## Distillation rule
The hero must be visual structure (cards, diagram, chip columns), not copied paragraphs. Prose belongs in the drill-downs. If the hero reads like the README, redo it.
