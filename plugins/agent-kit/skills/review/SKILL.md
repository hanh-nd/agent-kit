---
name: review
version: 1.1.0
description: Review local uncommitted changes with Jira context. Accepts an optional base branch/commit.
---

# Review Local Changes

**Target Base:** `$ARGUMENTS` _(defaults to `HEAD` — reviews all staged and unstaged changes to tracked files)_

Thin orchestrator for reviewing local code changes. Computes the diff, detects Jira context from the current branch, invokes the `code-review` skill, and assembles the output. Review criteria, severity, and output format are owned by `code-review` — this skill does not duplicate them.
## Voice

Write for a tired teammate, not a reviewer you're impressing.

- Short sentences, one idea each. Cut every word that isn't load-bearing.
- Plain words. "What else this touches", not "blast radius".
- Answer first, reason second. Never the reverse.
- Bullets and tables over paragraphs. Three bullets max per point.
- A question is one question plus one recommendation, under 5 lines.
- No filler openers, no self-praise, no restating the request back.
- If the explanation is longer than the thing it explains, delete the explanation.


---

## Pipeline

### Phase 1 — Get the changes

Compute the diff with JS/TS noise excluded:

```bash
BASE_TARGET="$ARGUMENTS"
if [ -z "$BASE_TARGET" ]; then
  BASE_TARGET="HEAD"
fi

CURRENT_BRANCH=$(git branch --show-current)

DIFF=$(git diff "$BASE_TARGET" -- . \
  ':(exclude)package-lock.json' \
  ':(exclude)yarn.lock' \
  ':(exclude)pnpm-lock.yaml' \
  ':(exclude)bun.lockb' \
  ':(exclude)node_modules/*' \
  ':(exclude)dist/*' \
  ':(exclude)build/*' \
  ':(exclude).next/*' \
  ':(exclude)out/*' \
  ':(exclude).turbo/*' \
  ':(exclude)coverage/*' \
  ':(exclude)storybook-static/*' \
  ':(exclude)*.min.js' \
  ':(exclude)*.min.css' \
  ':(exclude)*.snap' \
  ':(exclude)*.tsbuildinfo' \
  ':(exclude)*.svg' \
  ':(exclude)*.png' \
  ':(exclude)*.jpg' \
  ':(exclude)*.jpeg' \
  ':(exclude)*.gif' \
  ':(exclude)*.ico' \
  ':(exclude)*.woff' \
  ':(exclude)*.woff2' \
  ':(exclude)*.ttf')

FILES_CHANGED=$(git diff "$BASE_TARGET" --name-only -- . | wc -l | tr -d ' ')
UNTRACKED_COUNT=$(git ls-files --others --exclude-standard | wc -l | tr -d ' ')
```

Scope notes:

- `.env*` files are intentionally NOT excluded. If one shows up in the diff, it should surface as a secret-leak finding via the `code-review` skill's Trust Boundaries category, not be silently hidden.
- Migration files are NOT excluded. Destructive operations are in scope for review.
- Untracked files are outside `git diff` and cannot be reviewed here. They're reported as a footnote only.

**Empty diff:** stop. Tell the user there are no changes between the working tree and `$BASE_TARGET`, and suggest `git status` or a different base. Never invoke `code-review` on an empty diff.

### Phase 2 — Find the ticket (optional)

Extract a ticket ID from the current branch name:

```bash
TICKET_ID=$(echo "$CURRENT_BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1 || true)
```

- If `TICKET_ID` is non-empty: call `kit_jira_get_ticket(ticketId: "$TICKET_ID")` and pass the ticket body as intent to the child skill. If the tool call fails, proceed without intent — do not block the review.
- If `TICKET_ID` is empty: proceed with no intent. Do not warn, do not prompt. This is the expected case for branches without ticket references.

### Phase 3 — Route it

Inspect the diff from Phase 1 to determine the review path:

- **E2E-only:** The diff primarily changes Playwright, Cypress, browser automation, E2E fixtures, visual regression, accessibility automation, or E2E CI configuration — load `e2e-review`.
- **Mixed:** The diff contains both production code and E2E changes — load `code-review` for the production-code portion and `e2e-review` for the E2E portion, then combine the verdicts into a single report.
- **Production-only:** All other diffs — load `code-review`.

Pass to the chosen skill(s):

- **Diff** — from Phase 1 (full diff for single-skill path; split by file type for the mixed path).
- **Intent** — Jira ticket body if available; otherwise absent.
- **Codebase access** — always full (running locally in the target repository).

The child skill owns framing, scope drift, the consumer check, the category sweep, self-critique, and report formatting. Don't re-run those here.

### Phase 4 — Assemble the report

Prepend this header to the child skill's report:

```markdown
## 🕵️ Local Change Review

- **Branch:** `{CURRENT_BRANCH}`
- **Base:** `{BASE_TARGET}`
- **Files changed:** {FILES_CHANGED}
- **Ticket:** `{TICKET_ID}` — {ticket title} ← omit this line entirely if no ticket
```

Append the child skill's full report below, unchanged.

If `UNTRACKED_COUNT > 0`, append to the report footer:

> ℹ️ {UNTRACKED_COUNT} untracked file(s) exist in the working tree but were not reviewed — `git diff` does not include them. Run `git add -N .` (or `git add -A`) and re-run `/review` to include them.

---

## What this skill doesn't do

- Define review criteria, severity, or output format. Those belong to `code-review` or `e2e-review`.
- Touch git state. No staging, stashing, commits, or branch switches.
- Review untracked files by default.
- Drop `.env*` files or migrations from the diff. Those need eyes on them.
- Re-assess scope drift, consumers, or category coverage. The child owns those.
