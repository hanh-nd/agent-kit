---
name: preview
description: "Use when a markdown document — a Design Brief, implementation plan, investigation/research report, or any handoff — is a wall of text and you want a glanceable, human-friendly visual instead of reading prose."
---

# Preview

**Turn a markdown document into one self-contained, glanceable HTML visual.** Distill — summary on top, full detail in collapsible drill-downs. Don't re-render prose into a prettier wall of text.

The skill is decoupled from any system. It reads markdown from a path and writes HTML next to it. No `kit_*` tools, no hardcoded `.agent-kit/` paths, no assumption that the input is a handoff. No flags, no mode questions — detect the shape and proceed.

## Voice

Write for a tired teammate, not a reviewer you're impressing.

- Short sentences, one idea each. Plain words. "What else this touches", not "blast radius".
- Answer first, reason second.
- Bullets and tables over paragraphs.
- No filler openers, no self-praise, no restating the request.
- If the explanation is longer than the thing it explains, delete the explanation.

## Output contract

- **One file:** a single self-contained `.html`. CSS and JS inline. External resources via CDN only (Google Fonts, Mermaid v11, optional Chart.js).
- **Location:** `<output-dir>/PREVIEW.html`, overwritten silently, via a plain file write — never `kit_save_handoff` (it takes `.md` only and couples the skill to handoffs).
  - Input is a **folder** → `<output-dir>` is that folder, never its parent (`x/plan` → `x/plan/PREVIEW.html`).
  - Input is a **file** → `<output-dir>` is the folder containing it.
- **Diagram:** at least one rendered Mermaid diagram when the source has or implies a flow, structure, or dependency order. Don't invent a flow the source doesn't support.
- **Distilled + drill-down:** a glanceable hero on top, then `<details>` sections holding the full source. Never drop information.
- **Theme toggle:** every page has the light/dark toggle — `references/html-css-patterns.md` → "Theme Toggle Button (MANDATORY)".

## Workflow

### Step 1 — Resolve input and read

1. Path doesn't exist → stop: `Path not found: <path>`.
2. **Folder:** read every `*.md` in it (not recursively). None → stop: `No markdown found at <path>`.
3. **File:** read it.
4. Keep all source markdown — you distill it and embed its full text in drill-downs.

### Step 2 — Route to one strategy

Detect by content signals, not by system:

| Strategy | Choose when (any signal matches) | Reference |
|---|---|---|
| `design-brief` | `README.md` **and** `DETAIL.md` both present; **or** a heading like `# Design Brief` / `# Design Detail`; **or** a Problem + Decisions + Scope structure | `references/design-brief.md` |
| `implementation-plan` | `ARCHITECTURE.md` **and** `TASKS.md` present; **or** `PLAN.md` with `## Tasks` and `## Acceptance Criteria`; **or** WBS markers (task IDs, `[P]` / `[S: id]`, "Acceptance Criteria", "What Must Be True") | `references/implementation-plan.md` |
| `generic` | nothing matches, or the shape is ambiguous | `references/generic.md` |

- One strategy for the whole input. A multi-file folder becomes ONE combined page.
- Unsure → `generic`. Never dead-end on shape.
- Read the chosen strategy reference now — it defines the hero, the drill-downs, and which template to study.

### Step 3 — Build

Skim the design references as needed — they carry the kit's conventions, not remedial design rules:

- `references/html-design-guidelines.md` — anti-slop rules, style presets, typography, quality checklist.
- `references/html-css-patterns.md` — theme toggle, cards, tables, code blocks, Mermaid containers, overflow protection.
- `references/html-libraries.md` — Mermaid v11 setup, "Writing Valid Mermaid", render guard, Chart.js, fonts.
- `references/html-responsive-nav.md` — sticky table of contents for multi-section pages.

Templates under `templates/` (`architecture.html`, `data-table.html`, `mermaid-flowchart.html`) are starting points. Adapt freely; the output contract is what matters.

**Diagrams.** Write Mermaid per `html-libraries.md` → "Writing Valid Mermaid" (or the `ck:mermaidjs-v11` skill, if installed). Two requirements:

- Embed with the render guard (`mermaid.parse()` → styled code-block fallback). A bad block never breaks the page. Pattern: `html-libraries.md` → "Render guard".
- The theme toggle re-runs the render function — Mermaid can't re-theme reactively.

**Distill, don't transcribe.** The hero is visual structure — decision cards, a diagram, scope columns, KPI facts. Anything that doesn't make the hero goes in a `<details>` drill-down. A hero made of paragraphs copied from the source is a re-render — redo it.

### Step 4 — Write and open

1. Write `<output-dir>/PREVIEW.html`.
2. Open it: `open` (macOS) / `xdg-open` (Linux) / `start` (Windows).
3. Open unavailable or fails → print `Saved to <output-dir>/PREVIEW.html — open it in your browser`.

## Before you report done

- Single self-contained `.html` at `<output-dir>/PREVIEW.html`, written with a plain file write.
- Theme toggle present; Mermaid behind the render guard.
- Hero is distilled; every source section is reachable in a drill-down.
- Design quality per `html-design-guidelines.md` → "Quality Checklist".
