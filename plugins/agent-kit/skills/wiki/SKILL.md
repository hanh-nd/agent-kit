---
name: ak:wiki
description: >
  Maintains a persistent, compounding project wiki anchored to the codebase — not to handoff streams. The wiki annotates what exists in the code (entities), the patterns that constrain it (concepts), how the user wants the agent to work (preferences), and short reference notes (glossary). Use when the user wants to: compile session logs into wiki pages (`/wiki compile`), recall past decisions or feature context (`/wiki query {question}`), or health-check the wiki (`/wiki lint`). Trigger when the user says "what did we decide about", "what's the status of", "catch me up on", "why do we use", "what patterns do we follow", "what did we say about my preference for", or asks about something from a previous session. Default with no arguments runs compile.
version: 3.2.0
---

# 📖 Wiki

**Operation:** $ARGUMENTS

The wiki is the codebase's compounding annotation. It tracks **what exists** (entities), **why it works the way it does** (concepts), **how the user wants to work** (preferences), and **what external terms mean here** (glossary). Every page is a noun. Work events update the noun's page — they do not become new pages.

The goal is not filing. It is _synthesis that saves future sessions from re-deriving the same conclusions_.

---

## Core Mental Model — Codebase-First Anchoring

Five rules that govern every write to the wiki. Violating any of them is the failure mode this skill exists to prevent.

1. **The codebase is the source of truth. The wiki annotates it.** If a wiki claim cannot be traced to a file, a decision artifact, or a stated preference, the claim does not belong in the wiki.
2. **Entity pages are nouns that exist in the codebase.** A file, a directory, a module, a service, a feature, a domain object. Slugs MUST derive from the codebase noun: `credentials-utility`, `kit-jira-tools`, `ak-plan-skill`. Slugs MUST NOT derive from work events (`-refactor`, `-redesign`, `-migration`, `-fix`) or from ticket IDs (`yr-24781`, `proj-1234`).
3. **Work events update the entity; they do not become entities.** A refactor of `credentials-utility` is logged in the entity's `Events` section. It does not produce a separate `credential-manager-refactor.md`.
4. **A handoff bundle resolves to a single target.** When `brainstorm-X`, `plan-X`, and `ticket-X` all describe the same work, they update the SAME entity (the thing being built or changed) — not three separate entities.
5. **Not every handoff deserves a page.** Routine tickets with no synthesis value go into `log.md` only.

---

## Operations

Detect the operation from `$ARGUMENTS`:

- `/wiki` or `/wiki compile` → **Compile** (ingest raw → update wiki).
- `/wiki query {question}` → **Query** (search wiki + synthesize answer).
- `/wiki lint` → **Lint** (health check + anti-pattern detection + suggested next moves).

Default (empty or unrecognized): run **Compile**.

---

## Directory Structure

```
.agent-kit/wiki/
  raw/
    inbox.md                 # append-only handoff log (PostToolUse hook)
    conv_*.txt               # exported conversations
  compiled/
    index.md                 # category-organized catalog (loaded into every session)
    log.md                   # chronological compile/query record
    preferences/
      {slug}.md              # how the user wants the agent to work
    concepts/
      {slug}.md              # patterns, architectural decisions, rules
    entities/
      {slug}.md              # codebase nouns
    glossary/
      {slug}.md              # short reference entries
  archive/
    YYYY-MM.md               # processed inbox entries, verbatim
    conversations/           # processed conv_*.txt files
```

**Slug rules.** Lowercase kebab-case. Descriptive over short. **Stable forever** — once a slug exists, every cross-link in every page depends on it. Anti-patterns enforced by lint: slugs ending in `-refactor`, `-redesign`, `-migration`, `-update`, `-fix`, or matching `^[a-z]+-\d+$` (ticket IDs).

---

## Inbox Entry Format

Written by the `PostToolUse` hook after each `kit_save_handoff` call:

```
## [YYYY-MM-DDTHH:MM:SS] handoff | {type}-{slug}
- type: {brainstorm | plan | ticket | clarify | research}
- slug: {slug}
- path: {relative path to handoff file}
- summary: {one-line summary}
```

When compiling, the `path` field points to the full handoff document — read it for richer context than the summary alone.

---

## Operation: Compile

**Goal:** Ingest unprocessed raw → update wiki pages → archive → leave the wiki richer than you found it. **Not** "create a page per handoff."

### Step 1 — Check for Work

Read `.agent-kit/wiki/raw/inbox.md`. List all `wiki/raw/conv_*.txt` files via Glob.

If both are empty:

```
Nothing to compile — inbox is empty.
```

Stop.

For large `conv_*.txt` files (>500 lines), focus on sections containing decisions, conclusions, or "we always / the rule is / because" language — not every exchange.

### Step 2 — Bundle Related Handoffs

Group inbox entries that share a slug family:

- `brainstorm-multi-angle-protocol`, `plan-multi-angle-protocol`, `ticket-multi-angle-protocol` → ONE bundle.
- A standalone `ticket-fix-jira-pagination` with no related plan/brainstorm → its own bundle.

A bundle is the unit of triage. All members of a bundle must resolve to the same target page (or be classified together as routine).

### Step 3 — Triage Each Bundle

Classify every bundle into one or more outcomes before writing anything. Most bundles are a single outcome; some legitimately produce two (e.g. an entity update plus a new concept). Decide the full set up front — never start writing partway through triage.

| Outcome | Trigger                                                                                                  | Action                                                            |
| ------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **A**   | The bundle changes or extends an existing codebase noun.                                                 | Update that entity page. Log work in `Events`.                    |
| **B**   | The bundle creates a genuinely new component, file, service, or feature.                                 | Create a new entity page. Slug = the codebase noun, not the slug. |
| **C**   | The bundle reveals or hardens a pattern, architectural decision, or rule applicable across the codebase. | Create or update a concept page.                                  |
| **D**   | The bundle records a user preference (coding style, output style, voice, retry behavior, etc.).          | Create or update a preference page.                               |
| **E**   | The bundle adds reference knowledge (an external API shape, a domain term, a third-party concept).       | Create or update a glossary entry.                                |
| **F**   | Routine task with no synthesis value (typo fix, dependency bump, version update).                        | `log.md` entry only. No page change.                              |

A bundle may produce multiple outcomes (e.g. an A entity update + a C new concept). Triage all outcomes before any write.

#### Unexecuted Handoffs — Additional Routing

A handoff bundle that did not (and will not) produce code is still wiki-worthy if the _decision itself_ has lasting value. The triage above is about **content type**; this is about **execution state**. Both apply.

| Survives non-execution                                                                  | Route to                                                                                                                       |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A principle that generalizes (e.g. "we always reject X for Y reason")                   | Outcome C — concept page captures the rule.                                                                                    |
| An alternative considered for an existing entity (e.g. "we thought about token tables") | Outcome A — that entity's `Considered & Rejected` section (see Entity Page Format).                                            |
| Pure exploration, no conclusion                                                         | Outcome F — log only. Lint surfaces stale F entries (>90 days, no follow-up) for revive/formalize/archive.                     |
| Phantom entity (a brainstorm for something that does not exist and may never)           | **Never produces an entity page.** The slug rule (codebase noun must exist) blocks this structurally. Route to F or C instead. |

Future-tense entities are the same drift as task-tense entities — different timeline, same failure. If the brainstorm describes a thing that does not yet exist in `src/`, you cannot create an entity for it. Wait until the code exists; the brainstorm becomes Events on the entity at that point.

### Step 4 — Target Entity Resolution (for outcomes A and B)

Before creating any entity page:

1. **List existing entities.** Read `entities/` directory.
2. **Identify the codebase noun the bundle targets.** If the work touches `src/utils/credentials.ts`, the noun is `credentials-utility`. If the work creates a new file `src/tools/multi-angle.ts`, the noun is `multi-angle-tool` or whatever the canonical name is.
3. **Resolve.** If the noun already has an entity page → outcome is A (update + log Event). If it does not → outcome is B (create new page with codebase-noun slug).

**Slug derivation rules:**

- ✅ Use codebase nouns: `credentials-utility`, `kit-jira-tools`, `ak-plan-skill`, `auth-middleware`.
- ❌ Never use the handoff slug: `multi-angle-protocol-code-review` is a handoff slug, not an entity. The entity might be `ak-code-review-skill`.
- ❌ Never use work verbs: `-refactor`, `-redesign`, `-migration`, `-update`, `-fix`, `-cleanup`.
- ❌ Never use ticket IDs: `yr-24781`, `proj-1234`. (Ticket IDs go in the Event line as the source citation.)

If the codebase noun is genuinely ambiguous, prefer the most descriptive specific name and document the choice in the entity page's Summary.

### Step 5 — Verify Against Codebase (Reality Check)

For every entity page being created or updated:

- Confirm the cited files/directories exist. Use Read or Glob.
- If files exist with content → status `active` or `complete`.
- If a plan exists but the files are missing → set status to `parked` and add `> ⚠️ Reality Gap: Plan exists but {path} is missing` near the top.
- If files were previously documented and are now gone → set status to `deprecated` and add `> ⚠️ Reality Gap: {path} no longer exists in the codebase`.

This step is what makes the wiki self-correcting. Skip it and the wiki diverges from the code.

### Step 6 — Apply Outcomes

For each triaged bundle, apply its outcome using the corresponding page format (see "Page Formats" section).

**Per-page rules:**

- **Existing page:** Read it. Merge new decisions, edge cases, and cross-links. If new material contradicts an existing claim, add `> ⚠️ Contradiction: {new claim} — from {source-slug}` rather than silently overwriting. Increment `Sources` count, update `Last updated`.
- **New page:** Use the page format for the chosen category. Be specific — a good page is useful to someone who missed every session that produced it.
- **Idempotent:** Re-compiling the same bundle never duplicates content. If a decision is already listed, skip it.

### Step 7 — Rebuild `index.md`

Overwrite `wiki/compiled/index.md` with category-ordered structure. Preferences load first because they trump everything else in subsequent code sessions.

```markdown
# Project Wiki Index

> Last compiled: {YYYY-MM-DD} | {P} preferences | {C} concepts | {E} entities | {G} glossary

## 👤 Preferences (Always Apply)

- [[{slug}]](preferences/{slug}.md) — {one-line rule} | updated: {date}

## 🏛️ Concepts (Architectural Decisions & Patterns)

- [[{slug}]](concepts/{slug}.md) — {one-line summary} | seen in: {N} entities | updated: {date}

## 🧱 Entities (Codebase Nouns)

- [[{slug}]](entities/{slug}.md) — {one-line summary} | status: {active|complete|deprecated} | updated: {date} | sources: {N}

## 📚 Glossary

- [[{slug}]](glossary/{slug}.md) — {one-line definition} | updated: {date}
```

Within each section, sort by `updated` descending — most recently touched first. This gives a code session both the always-loaded preferences and a "what's been moving lately" view.

### Step 8 — Append to `log.md`

```
## [{YYYY-MM-DD}] compile
- Bundles: {N} | Conversations: {M}
- Outcomes: A:{n} B:{n} C:{n} D:{n} E:{n} F-routine:{n} F-exploration:{n}
- Updated: {slug, slug, ...}
- Created: {slug, slug, ...}
- F-routine (logged only): {summary, summary, ...}
- F-exploration (logged only): {handoff-slug — one-line topic, ...}
```

The outcome breakdown makes it easy to spot drift over time (e.g. lots of B's = unusual creation rate; lots of F-explorations = many parked ideas to revisit). F-routine and F-exploration are logged separately because lint treats them differently — routine tasks never go stale; explorations do.

### Step 9 — Archive and Clear

- Append processed inbox entries verbatim to `wiki/archive/{YYYY-MM}.md`.
- Move `conv_*.txt` files to `wiki/archive/conversations/` via `mv`.
- Overwrite `wiki/raw/inbox.md` with an empty file.

### Step 10 — Report

```
✅ Wiki compiled.
  Sources: {N} bundles + {M} conversations
  Updated: {list}
  Created: {list}
  Routine (no page): {count}

{2–3 sentences synthesizing what's new, what's confirmed, any cross-feature patterns or contradictions surfaced.}
```

The synthesis paragraph is what makes this more than filing. Write it as a briefing for someone returning from two weeks away.

---

## Operation: Query

**Goal:** Synthesize a well-cited answer from the compiled wiki.

1. If `wiki/compiled/index.md` doesn't exist, say so and offer: run `/wiki compile` first, OR scan `wiki/raw/inbox.md` directly for a quick (less complete) answer.
2. Read `index.md`. Identify up to 5 pages most relevant to the question — match across all four categories.
3. Read those pages in full.
4. Synthesize an answer with inline `[[slug]]` citations. Every claim must be traceable.
5. If the answer is substantive (more than a direct fact), offer:
   ```
   Save this analysis as a wiki page? (concept | glossary | n)
   ```

   - `concept` → write to `concepts/{slug}.md` if it's a pattern/decision.
   - `glossary` → write to `glossary/{slug}.md` if it's reference knowledge.
   - `n` → do nothing.
     Update `index.md` and append to `log.md` on save.

---

## Operation: Lint

**Goal:** Surface health issues, codebase-anchoring violations, and suggested next moves.

Run all checks. Group findings by severity.

1. **Anti-pattern slugs** (BLOCKER): entity slugs ending in `-refactor`, `-redesign`, `-migration`, `-update`, `-fix`, `-cleanup`, or matching `^[a-z]+-\d+$`. These are work events or ticket IDs masquerading as entities. Suggest a target codebase noun and recommend merging the page's content into that entity's `Events` section.
2. **Codebase orphans** (BLOCKER): entity slugs whose `Anchors` section points to files that don't exist in `src/`. Either rename to a real anchor, archive the page, or fold into another entity.
3. **Broken links**: `[[target]]` references where the linked file doesn't exist.
4. **Page orphans**: pages with no inbound `[[slug]]` references from any other page. Consider linking or archiving.
5. **Unresolved markers**: scan for `⚠️ Contradiction:` or `⚠️ Reality Gap:` across all pages. List for human resolution.
6. **Shadow features**: directories or files in `src/` with significant logic but no entity page. Flag as candidates for the next compile.
7. **Stale inbox**: entries older than 7 days.
8. **Missing concept pages**: `[[slug]]` references in entity pages with no corresponding `concepts/{slug}.md`.
9. **Stale explorations**: F-exploration entries in `log.md` older than 90 days with no follow-up handoff referencing the same topic. Surface for revive (move into a concept or new entity), formalize (promote the rejection rationale into a concept), or archive (note as abandoned in `log.md`).
10. **Suggested investigations**: based on gaps and orphans, propose 2–3 specific topics worth compiling next.

**Output:**

```
## Wiki Health Report — {YYYY-MM-DD}

### 🚫 BLOCKER — Anti-Pattern Slugs ({N})
- entities/{slug}.md → suggested rename to `{codebase-noun}` and merge into `entities/{codebase-noun}.md` Events section.

### 🚫 BLOCKER — Codebase Orphans ({N})
- entities/{slug}.md → Anchor `{path}` does not exist. Action: rename | archive | fold.

### 🔗 Broken Links ({N})
### 🏝️ Page Orphans ({N})
### ⚠️ Unresolved Contradictions / Reality Gaps ({N})
### 🕵️ Shadow Features ({N})
### 📥 Stale Inbox
### 📄 Missing Concept Pages ({N})
### 🧊 Stale Explorations ({N})
- {handoff-slug} ({YYYY-MM-DD}, {topic}) — action: revive | formalize | archive

### 🔍 Suggested Investigations
- {specific question or topic worth compiling next}

### Recommendations
- {prioritized actions}
```

If no issues: `✅ Wiki is healthy. No anti-patterns, orphans, or contradictions found.`

---

## Page Formats

### Entity Page Format (`entities/{slug}.md`)

```markdown
# {Codebase Noun}

> Last updated: {YYYY-MM-DD} | Sources: {N} | Status: {active | complete | deprecated | parked}

## Summary

{1–2 sentences: what this is in the codebase. Cite the canonical file path inline.}

## Anchors

- Primary: `{file or directory path}`
- Related: `{path}`, `{path}`

## Key Decisions

- {Specific decision} — `{file:line}` or [[source-slug]]

## Edge Cases & Risks

- {Edge case or risk} — `{file:line}` or [[source-slug]]

## Considered & Rejected

- {YYYY-MM-DD} — {alternative considered} — rejected because {rationale} — [[handoff-slug]]

## Events

- {YYYY-MM-DD} — {kind: brainstorm | plan | ticket | clarify | refactor | bugfix | migration} — {one-line description} — [[handoff-slug]]
- {YYYY-MM-DD} — {kind} — {description} — [[handoff-slug]]

## Open Questions

- {Unresolved}

## Related

- [[concept-slug]] — {applies here because…}
- [[entity-slug]] — {relationship}
```

The `Events` log is critical: it preserves work history without spawning event-named pages. Cite handoff slugs inline; the handoffs themselves remain in `.agent-kit/handoffs/`.

### Concept Page Format (`concepts/{slug}.md`)

```markdown
# {Pattern / Decision Name}

> Last updated: {YYYY-MM-DD} | Seen in: {N} entities

## What It Is

{Plain explanation — readable by someone who missed every session that produced it.}

## Why We Use It

{Rationale — what problem it solves, what alternatives were rejected.}

## Where Applied

- [[entity-slug]] — {how the pattern manifests here, with `file:line` if useful}

## Contradictions / Open Questions

- {Any unresolved tension}
```

### Preference Page Format (`preferences/{slug}.md`)

```markdown
# {Preference Title}

> Last updated: {YYYY-MM-DD} | Confirmed in: {N} sessions | Status: {active | superseded | retired}

## Rule

{One-line directive — what the agent must do or avoid.}

## Why

{The rationale the user gave or that emerged from sessions.}

## How To Apply

- {When this kicks in}
- {Where it does NOT apply}

## Sources

- [[source-slug]] — {what was said or decided}

## Supersedes / Superseded By

- {[[other-pref-slug]] — if applicable}
```

### Glossary Page Format (`glossary/{slug}.md`)

**When a term earns a glossary page (threshold rule):**

- Referenced from 2+ other wiki pages (cross-cutting reference), OR
- Project-specific usage is non-obvious enough to warrant a paragraph of explanation.

If neither holds, the term stays inline in whichever page mentions it — do **not** create a glossary page. Single-mention terms with obvious meaning bloat the wiki without earning their footprint.

```markdown
# {Term}

> Last updated: {YYYY-MM-DD}

## Definition

{1–3 sentences. Cite source if external.}

## In This Project

{How it appears in our code or decisions, with `file:line` citations if applicable.}

## See Also

- [[entity-slug]] — {how related}
```

---

## Rules

- **Codebase-first anchoring.** Every entity slug derives from a codebase noun. Work events update entities; they never become entities. (See Core Mental Model.)
- **Never modify raw sources.** `wiki/raw/` and `wiki/archive/` are write-once (append to archive, clear inbox after compile, move conv files — never edit existing content).
- **Fail gracefully.** Missing files → skip and note in the report, never abort.
- **Idempotent pages.** Re-compiling the same bundle updates a page, never duplicates content.
- **No auto-resolution of contradictions.** Add `⚠️ Contradiction:` markers, let the human decide.
- **Cite everything.** Every key decision or risk needs a `[[slug]]` source link or `file:line` reference.
- **Stable slugs.** Once created, slugs never change — renaming a slug breaks every page that links to it. Choose carefully on first creation; lint surfaces anti-patterns for migration with human review.
- **Routine work logs only.** Outcome-F bundles never produce pages. The compile log records that they happened.
- **Preferences first in the index.** They trump every other category in subsequent code sessions.
