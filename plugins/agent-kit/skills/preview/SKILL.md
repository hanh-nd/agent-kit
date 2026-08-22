---
name: preview
description: "Use when a markdown document — a Design Brief, implementation plan, investigation/research report, or any handoff — is a wall of text and you want a glanceable, human-friendly visual instead of reading prose."
providers:
  claude:
    argument-hint: "[path-to-file-or-folder]"
    model: sonnet
---

# Preview

**Turn a markdown document into one self-contained, glanceable HTML visual.** An image is worth a thousand words only if it is the *right* image — so this skill **distills** (summary on top, full detail in collapsible drill-downs), it does not re-render prose into a prettier wall of text.

This skill is **decoupled** from any system. It reads markdown from a path you give it and writes HTML next to it. It never calls `kit_*` tools, never hardcodes `.agent-kit/` paths, and never assumes the input is a "handoff." It works on *any* markdown.

## Output Contract (non-negotiable)

- **One file:** a single self-contained `.html` — all CSS and JS inline. External resources via CDN only (Google Fonts, Mermaid v11, optional Chart.js).
- **Output location — write `<output-dir>/PREVIEW.html`**, overwriting silently. Resolve `<output-dir>` exactly:
  - Given a **folder** → `<output-dir>` **is that folder itself**. Do NOT use its parent. (e.g. input `x/plan` → write `x/plan/PREVIEW.html`, never `x/PREVIEW.html`.)
  - Given a **single file** → `<output-dir>` is the folder that **contains** that file.
  - **Plain file write only.** Do NOT use `kit_save_handoff` (it accepts `.md` only and requires a handoff type — that would couple this skill to the handoff system).
- **At least one diagram (non-negotiable):** every preview MUST include ≥1 Mermaid diagram (the flow/architecture) — it is the highest-value visual. A page with only CSS scaffolding and no rendered diagram is incomplete; if the source implies no flow, synthesize one from the entities/decisions.
- **Distilled + drill-down:** a glanceable one-pager at the top, then `<details>` sections holding the full source content. Glance first, expand for fidelity.
- **MANDATORY theme toggle:** every page includes the light/dark toggle button. See `references/html-css-patterns.md` → "Theme Toggle Button (MANDATORY)". A page without it is incomplete.

## Workflow

### Step 1 — Resolve input & read

1. Resolve the argument to a path. If it does not exist → **stop**, tell the user `Path not found: <path>`.
2. If it is a **folder**: read every `*.md` file in it (not recursively). If none → **stop**, `No markdown found at <path>`. Set output dir = the folder.
3. If it is a **file**: read it. Set output dir = its parent directory.
4. Hold all source markdown in memory — you will both distill it AND embed its full text in drill-downs.

### Step 2 — Route to a strategy

Detect the content **shape** and pick exactly one strategy. Detection is by signal, not by coupling to any system:

| Strategy | Choose when (any signal matches) | Reference |
|---|---|---|
| `design-brief` | `README.md` **and** `DETAIL.md` both present in the folder; **or** a heading like `# Design Brief` / `# Design Detail`; **or** a "Decisions" + "Scope" + "Problem" structure | `references/design-brief.md` |
| `implementation-plan` | `ARCHITECTURE.md` **and** `TASKS.md` present; **or** WBS markers (numbered task breakdown, "Acceptance Criteria", "Test Plan", task IDs) | `references/implementation-plan.md` |
| `generic` | none of the above match, or the shape is ambiguous | `references/generic.md` |

Rules:
- **Pick the single best strategy** for the whole input. For a multi-file folder, combine the files into ONE page under one strategy (e.g. `README.md` + `DETAIL.md` → one `design-brief` page).
- **When unsure, fall back to `generic`.** Never dead-end, never error on shape.
- **Read the chosen strategy reference now** — it defines the hero sections, the drill-down sections, and which template to study.

### Step 3 — Read design references, then build

Read as needed (skim; your native design judgment is strong — these files carry the kit's product conventions, not remedial design rules):
- `references/html-design-guidelines.md` — quality checklist and the kit's style presets.
- `references/html-css-patterns.md` — theme toggle (MANDATORY), cards, tables, code blocks, Mermaid containers, overflow protection.

Read for the strategy when the strategy file calls for it:
- `references/html-libraries.md` — Mermaid v11 setup + **"Writing Valid Mermaid"** + theme handling; Chart.js; fonts.
- `references/html-responsive-nav.md` — sticky table-of-contents for multi-section pages.

Templates under `templates/` (`architecture.html`, `data-table.html`, `mermaid-flowchart.html`) are structural starting points if helpful — adapt freely or work from scratch; the output contract is what matters, not resemblance to a template.

Then generate following the strategy's section map: **distilled hero on top, full source content inside `<details>` drill-downs below.**

### Step 4 — Write & open

1. Write the HTML to `<output-dir>/PREVIEW.html` (overwrite).
2. Open it: `open` (macOS) / `xdg-open` (Linux) / `start` (Windows).
3. If the open command is unavailable or fails → do not error; print `Saved to <output-dir>/PREVIEW.html — open it in your browser`.

## Diagrams

Author every diagram with the **`ck:mermaidjs-v11`** skill (v11 syntax, diagram-type choice, validation) — do not re-derive Mermaid rules here. Two output requirements this skill enforces:

- **Never ship Mermaid's error "bomb."** Embed with the validate-before-render guard (`mermaid.parse()` → code-block fallback on failure). Pattern: `references/html-libraries.md` → "Render guard".
- **Re-theme on toggle.** Mermaid can't switch theme reactively, so the theme-toggle handler must re-run the render function.

## Distillation discipline

The whole point is to defeat the wall of text. Hold the line:

- The **hero** is a glance, not a summary paragraph. Use decision cards, a diagram, scope columns, KPI-style facts — visual structure over prose.
- **Never drop information.** Everything from the source that doesn't make the hero goes into a `<details>` drill-down, so fidelity is preserved.
- If your hero is mostly full paragraphs copied from the source, you have re-rendered, not distilled. Redo it.

## Edge Cases

| Scenario | Behavior |
|---|---|
| Path does not exist | Stop before generating: `Path not found: <path>` |
| Folder has no markdown | Stop: `No markdown found at <path>` |
| Folder has multiple `.md` files | Read all; pick ONE strategy; produce ONE combined page |
| Content shape ambiguous / no match | Use `generic` — never error on shape |
| Mermaid block won't parse | Repair; if impossible, render as styled code fallback (page still renders) |
| `PREVIEW.html` already exists | Overwrite silently |
| Input is a single file | Write `PREVIEW.html` into its parent directory |
| Browser-open unavailable/fails | Print the saved path instead of erroring |

## Quality Checklist (before reporting done)

- [ ] Single self-contained `.html`; CSS/JS inline; CDN-only externals.
- [ ] Written INSIDE the input folder (or the file's container) — `<output-dir>/PREVIEW.html`, never the parent — via a plain write (no `kit_*` tools).
- [ ] At least one diagram is actually rendered (not just `.mermaid` CSS with no diagram).
- [ ] Theme toggle present as required (light + dark both render).
- [ ] Distilled hero + `<details>` drill-downs holding full source — not a 1:1 render.
- [ ] **Squint test:** hierarchy readable at arm's length.
- [ ] **Slop test:** no generic AI-frontend clichés (default gradients, emoji accents, Inter-everywhere) — see `html-design-guidelines.md`.
- [ ] No horizontal overflow (tables wrapped in a scroll container).
- [ ] Mermaid diagrams render (zoom controls for 10+ nodes); failed blocks degrade to code, not breakage.
- [ ] Browser opened, or path printed if open unavailable.

## Common Mistakes

| Mistake | Correction |
|---|---|
| Re-rendering the markdown faithfully | Distill: hero = glance, drill-downs = full text. A prettier wall is still a wall. |
| Calling `kit_save_handoff` for the HTML | Plain write to `<input-dir>/PREVIEW.html`. The skill is decoupled by design. |
| Adding flags / asking which mode | There are no flags. Auto-detect the shape and proceed. |
| Hardcoding handoff types or `.agent-kit/` paths | Route by content *signals*; treat input as generic markdown. |
| Omitting the theme toggle | Mandatory on every page; the page is incomplete without it. |
| Letting one bad Mermaid block break the page | Repair or degrade to a code fallback; the page must always render. |
