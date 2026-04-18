---
name: ak:wiki
description: >
  Maintains a persistent, compounding project intelligence wiki that accumulates knowledge across sessions — architectural decisions, feature history, patterns, edge cases. Use this skill whenever the user wants to: compile session logs into organized wiki pages (/wiki compile), recall past decisions or feature context (/wiki query {question}), or health-check the wiki (/wiki lint). Trigger this any time the user says "what did we decide about", "what's the status of", "catch me up on", "why do we use", "what patterns do we follow", or asks about something that happened in a previous session. Default with no arguments runs compile.
version: 2.0.0
---

# 📖 Wiki

**Operation:** $ARGUMENTS

The project wiki is a persistent, compounding artifact — unlike re-reading raw handoffs each session, the wiki's cross-references are already built, contradictions already flagged, and the synthesis already reflects everything that's been worked on. Every compile makes it richer. The goal is not filing; it's _synthesis that saves future sessions from re-exploring the same ground_.

---

## Operations

Detect the operation from `$ARGUMENTS`:

- `/wiki` or `/wiki compile` → **Compile** (ingest raw → build/update wiki)
- `/wiki query {question}` → **Query** (search wiki + synthesize answer)
- `/wiki lint` → **Lint** (health-check for issues + suggest next directions)

Default (empty or unrecognized): run **Compile**.

---

## Directory Structure

```
.agent-kit/wiki/
  raw/
    inbox.md                 # append-only handoff log (written by PostToolUse hook)
    conv_*.txt               # exported conversations (/export before /compact)
  compiled/
    index.md                 # content catalog — one line per page, loaded into every session
    log.md                   # chronological record of compiles and queries (append-only)
    entities/
      {slug}.md              # per-feature/service/component pages
    concepts/
      {slug}.md              # architectural decisions, patterns, recurring rules
  archive/
    YYYY-MM.md               # processed inbox entries, verbatim (append-only per month)
```

**Slug rules:** Always lowercase kebab-case. Prefer descriptive over short: `jira-integration`, `fail-open-pattern`, `skill-as-markdown`. A slug, once created, never changes — it is the permanent key for all cross-links across every page in the wiki.

---

## Inbox Entry Format

The `inbox.md` file is written by the PostToolUse hook after each `kit_save_handoff` call.
Each entry looks like:

```
## [YYYY-MM-DDTHH:MM:SS] handoff | {type}-{slug}
- type: {brainstorm | plan | ticket}
- slug: {slug}
- path: {relative path to the handoff file from project root}
- summary: {one-line summary}
```

When compiling, the `path` field can be used to read the full handoff document for richer context than the one-line summary alone.

---

## Operation: Compile

**Goal:** Ingest unprocessed raw entries → build/update wiki pages → archive → leave the wiki richer than you found it.

### Step 1: Check for work

Read `.agent-kit/wiki/raw/inbox.md`. List all `wiki/raw/conv_*.txt` files (Glob).

If inbox is empty AND no conv\_\*.txt exist:

```
Nothing to compile — inbox is empty.
```

Stop.

For large `conv_*.txt` files (>500 lines), focus on sections with decisions, conclusions, or "we always / the rule is / because of" language rather than reading every exchange.

For inbox entries, the `path` field points to the actual handoff document. For entries where the summary alone is insufficient, read the handoff file for deeper context.

### Step 2: Synthesize before writing

Read all raw material. Before touching any file, answer:

- **What entities appear?** Named features, services, integrations, or components being actively built. Signal: has a proper name, decisions are being made about it. Handoff types map naturally: brainstorm = discovery, plan = blueprint, ticket = task.
- **Synthesize Lifecycle & Rationale:** Distinguish between active, parked, and rejected ideas:
  - **active:** The brainstorm is followed by a `plan` or `ticket`.
  - **rejected:** The brainstorm has no subsequent plan AND the agent identified a blocker, red-flag, or high-risk trade-off in the conversation. Use the agent's own critique as the rationale.
  - **parked:** The brainstorm has no subsequent plan and no explicit blockers (a "stale" or "for later" idea).
- **Verify against Codebase (Reality Check):** For any entity with a `plan` or `ticket` status, verify the existence of mentioned files/directories:
  - If files exist and have content: status remains `active` or `in-progress`.
  - If files are missing but a plan exists: downgrade status to `parked` and add a `⚠️ Reality Gap: Plan exists but files are missing` marker.
  - If a feature was previously `complete` but its files are now gone: mark as `deprecated`.
- **What concepts emerge?** Architectural decisions, patterns, or rules that will constrain future choices. Signal: "we always...", "the rule is...", the same pattern appearing in two or more features (that's when it earns its own concept page vs staying as a bullet on an entity).
- **What cross-links exist?** Which entities implement which concepts? Which entities relate to each other?
- **What's new vs confirmatory?** For pages that already exist, does this material extend, confirm, or contradict them?

Build a working inventory: `(type, slug, status, rationale, sources[], key-facts[], links-to[])` before writing.

### Step 3: Update or create entity pages

For each entity in the inventory, check `wiki/compiled/entities/{slug}.md`:

- **Exists:** Read it. Merge new decisions, edge cases, status, and cross-links. If new material contradicts an existing claim, add this marker rather than silently overwriting: `> ⚠️ Contradiction: {new claim} — from {source-slug}`. Update `Last updated` date and increment `Sources` count.
- **New:** Create using the entity page format below. Be specific — a good entity page is useful to someone who missed all the sessions that produced it.

### Step 4: Update or create concept pages

Same process for concepts using the concept page format. Concept pages are the wiki's connective tissue — they explain _why_ things are the way they are and point to every feature where a pattern appears.

### Step 5: Rebuild index.md

Overwrite `wiki/compiled/index.md`:

```markdown
# Project Wiki Index

> Last compiled: {YYYY-MM-DD} | {N} entities | {M} concepts

## Entities

- [[{slug}]](entities/{slug}.md) — {one-line summary} | updated: {date} | sources: {N}

## Concepts

- [[{slug}]](concepts/{slug}.md) — {one-line summary} | updated: {date} | sources: {N}
```

### Step 6: Append to log.md

Append to `wiki/compiled/log.md` (create if absent):

```
## [{YYYY-MM-DD}] compile
- Inbox entries: {N} | Conversations: {M}
- Updated: {slug, slug, ...}
- Created: {slug, slug, ...}
```

### Step 7: Archive and clear

Append processed inbox entries verbatim to `wiki/archive/{YYYY-MM}.md`.
Move `conv_*.txt` files to `wiki/archive/conversations/` with Bash `mv`.
Overwrite `wiki/raw/inbox.md` with an empty file.

### Step 8: Report

```
✅ Wiki compiled.
  Sources: {N} inbox entries + {M} conversations
  Pages updated: {list}
  Pages created: {list}

{2-3 sentence synthesis: what's new, what's confirmed, any notable cross-feature patterns}
```

The synthesis paragraph is what makes this more than a filing operation. Write it as a briefing for someone returning from two weeks away.

---

## Operation: Query

**Goal:** Synthesize a well-cited answer from the compiled wiki.

1. Check if `wiki/compiled/index.md` exists. If it doesn't, say so and offer:
   - Run `/wiki compile` first to build the wiki, OR
   - Scan `wiki/raw/inbox.md` directly for a quick (less complete) answer.
2. Read `index.md`. Identify up to 5 pages most relevant to the question (match on titles and one-line summaries).
3. Read the identified pages in full.
4. Synthesize an answer with inline `[[slug]]` citations. Every claim should be traceable.
5. If the answer is substantive (more than a direct fact), offer:
   ```
   Save this analysis as a wiki page? (y/n)
   ```
   If yes: write to `concepts/query-{slug}.md` using the concept page format, update `index.md` with the new entry, append to `log.md`.
   If no: do nothing further.

---

## Operation: Lint

**Goal:** Find health issues and surface what to do next.

1. Read `wiki/compiled/index.md` to enumerate all pages.
2. **Broken links:** Scan every compiled page for `[[target]]` where the linked file doesn't exist.
3. **Orphan pages:** Find compiled pages that no other compiled page links to via `[[slug]]`.
4. **Unresolved contradictions:** Scan for `⚠️ Contradiction:` or `⚠️ Reality Gap:` markers across all pages — these are flagged but unresolved, list them for human attention.
5. **Shadow Features:** Find directories/files in `src/` that have significant logic but no corresponding entity page in the wiki.
6. **Stale inbox:** Check `wiki/raw/inbox.md` for entries with timestamps older than 7 days.
7. **Missing concept pages:** Find `[[slug]]` references in entity pages that have no corresponding `concepts/{slug}.md`.
8. **Suggested investigations:** Based on the gaps and orphans found, suggest 2-3 specific questions worth exploring or topics worth compiling next. The wiki is a map of what's known — lint should point toward what isn't.

**Output:**

```
## Wiki Health Report — {YYYY-MM-DD}

### 🔗 Broken Links ({N})
- {page}: [[{target}]] → file not found

### 🏝️ Orphan Pages ({N})
- {page}: no inbound links — consider linking from related pages or archiving

### ⚠️ Unresolved Contradictions ({N})
- {page}: flagged contradiction on "{topic}" — human resolution needed

### 🏗️ Reality Gaps ({N})
- {page}: documented as {status} but files {path} are missing or empty

### 🕵️ Shadow Features ({N})
- {path}: source code exists but no wiki entity page found — consider compiling

### 📥 Stale Inbox
...

### 📄 Missing Concept Pages ({N})
- [[{slug}]] referenced in {page} but concepts/{slug}.md doesn't exist

### 🔍 Suggested Investigations
- {specific question or topic worth exploring next, based on gaps found}

### Recommendations
- {prioritized action items}
```

If no issues: `✅ Wiki is healthy. No broken links, orphans, or contradictions found.`

---

## Entity Page Format

```markdown
# {Feature/Entity Name}

> Last updated: {YYYY-MM-DD} | Sources: {N}

## Summary

{1-2 sentences: what this is and why it exists}

## Lifecycle

{active | parked | rejected | in-progress | complete | deprecated}
{Link the stages: [[brainstorm-slug]] → [[plan-slug]] → [[ticket-slug]]}

## Rationale (for rejected/parked)

{Synthesized reason for rejection or why the idea is parked} — [[source-slug]]

## Key Decisions

- {Specific decision} — [[source-slug]]

## Edge Cases & Risks

- {Edge case or risk} — [[source-slug]]

## Open Questions

- {Something not yet resolved}

## Related

- [[concept-slug]] — {why related}
- [[entity-slug]] — {relationship}
```

---

## Concept Page Format

```markdown
# {Pattern/Decision Name}

> Last updated: {YYYY-MM-DD} | Seen in: {N} features

## What It Is

{Plain explanation — someone who missed these sessions should understand it}

## Why We Use It

{Rationale — what problem it solves, what alternative was considered}

## Where Applied

- [[entity-slug]] — {how the concept manifests here}

## Contradictions / Open Questions

- {Any unresolved tension or edge case}
```

---

## Rules

- **Never modify raw sources.** `wiki/raw/` and `wiki/archive/` are write-once (append to archive, clear inbox after compile, move conv files — never edit existing content).
- **Fail gracefully.** Missing files → skip and note in the report, never abort.
- **Idempotent pages.** Re-compiling the same entries updates a page, never duplicates content.
- **No auto-resolution of contradictions.** Add `⚠️ Contradiction:` markers, let the human decide.
- **Cite everything.** Every key decision or risk needs a `[[slug]]` source link.
- **Stable slugs.** Once created, slugs never change — renaming a slug breaks every page that links to it.
