# Strategy: generic (fallback)

For any markdown that isn't a Design Brief or implementation plan — investigation/research reports, clarifications, scenarios, code reports, notes, READMEs. **Nothing dead-ends here.**

**Goal:** make an unfamiliar document graspable at a glance, then expandable to the full text.

## Templates to study
- `templates/architecture.html` (hero + sidebar nav)
- `templates/data-table.html` (if the doc has comparison/matrix tables)
- `templates/mermaid-flowchart.html` (if the doc has or implies a flow)

## References to read
- `references/html-design-guidelines.md`, `references/html-css-patterns.md` (always)
- `references/html-libraries.md` (only if diagrams/charts), `references/html-responsive-nav.md` (multi-section docs)

## How to distill (shape-agnostic)

1. **Title + one-line gist** — infer the document's purpose from the top heading / first paragraph. State it in one sentence at the top.
2. **Section map** — for each top-level `##` heading, create a **summary card**: the heading as title + 1–3 distilled bullets capturing that section's point (not its full text). Lay out as a responsive card grid. This is the glanceable index of the whole document.
3. **Surface structured content** — if the source contains:
   - **tables** → render them as styled HTML tables in the hero;
   - **Mermaid / diagrams** → render them (with zoom for 10+ nodes);
   - **a clear list of findings / decisions / steps** → render as cards or a checklist.
4. **Key callouts** — pull out anything marked important: warnings, conclusions, recommendations, status verdicts. Render as callout boxes.

## Drill-downs (collapsible `<details>` — full fidelity)

One `<details>` per top-level section, holding that section's **full rendered markdown** (headings, paragraphs, lists, code). Collapsed by default. This guarantees nothing is lost — the hero is the map, the drill-downs are the territory.

## Distillation rule
Section cards are *distilled bullets*, not the section's whole text. The full text lives in the matching drill-down. If a card is just the section pasted in, shorten it — the card is a glance, the `<details>` is the read.
