---
name: review-pr
version: 1.1.0
description: Fetch a PR, check out locally, run code-review, return a full review.
---

# Review PR

**PR Target:** $ARGUMENTS

This skill is a thin orchestrator. It handles fetching the PR, pulling its Jira ticket, and setting up the local codebase so the `code-review` skill can run with full context. Review criteria, severity levels, output format, and judgment all live in `code-review` — this skill does not duplicate or override them.
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

### Phase 1 — Gather context

Collect what `code-review` needs:

1. **PR details + diff.** Call `kit_get_bitbucket_pr(input: "$ARGUMENTS", includeDiff: true)`. Capture PR metadata (`workspace`, `repoSlug`, `sourceBranch`, `destinationBranch`, `title`, `description`, `author`) and the unified diff. On tool error, stop and report the error to the user — do not fall back to partial data.

2. **Jira ticket (if referenced).** If a ticket ID matching `[A-Z]+-\d+` appears in the PR title, description, or branch name, call `kit_jira_get_ticket(ticketId: "EXTRACTED-ID")` and capture the ticket body. This becomes part of the intent passed to the child skill.

3. **Intent availability.** If no PR description, commit messages, or Jira ticket exists, record this — the child skill will emit its own missing-intent warning.

### Phase 2 — Set up the checkout

Check out the source branch locally so `code-review` can read the whole codebase — it needs that to check consumers:

1. `git branch --show-current` → save as `originalBranch`.
2. `git status --porcelain` → if non-empty, mark `checkoutState = UNHAPPY` (dirty working tree; checkout would destroy uncommitted work).
3. `git remote get-url origin` → if the URL does not contain both `workspace` and `repoSlug` from Phase 1, mark `checkoutState = UNHAPPY` (wrong repo).
4. If not marked `UNHAPPY`:
   - `git fetch origin`
   - `git checkout {sourceBranch}`
   - `git reset --hard origin/{sourceBranch}`
   - Set `checkoutState = CHECKED_OUT`.
5. If `UNHAPPY`: skip checkout. Never stash, never force. Record the reason (`dirty working tree` or `mismatched repo`).

### Phase 3 — Route it

Inspect the diff from Phase 1 to determine the review path:

- **E2E-only:** The diff primarily changes Playwright, Cypress, browser automation, E2E fixtures, visual regression, accessibility automation, or E2E CI configuration — load `e2e-review`.
- **Mixed:** The diff contains both production code and E2E changes — load `code-review` for the production-code portion and `e2e-review` for the E2E portion, then combine the verdicts into a single report.
- **Production-only:** All other diffs — load `code-review`.

Pass to the chosen skill(s):

- **Diff** — from Phase 1 (full diff for single-skill path; split by file type for the mixed path).
- **Intent** — PR description and Jira ticket body (when available). If neither exists, pass what you have and let the child skill handle the missing-intent case.
- **Codebase access** — full if `checkoutState = CHECKED_OUT`, degraded if `UNHAPPY`. Tell the child which one, so its consumer check can adjust.

The child skill owns framing, scope drift, the consumer check, both sweep passes, self-critique, and report formatting. Don't re-run those here, and don't second-guess its verdict.

### Phase 4 — Assemble the report

Prepend this PR header to the child skill's report:

```markdown
## 📝 PR Review: {PR Title}

- **PR:** [{workspace}/{repoSlug}#{PR number}]({PR URL})
- **Branch:** `{sourceBranch}` → `{destinationBranch}`
- **Ticket:** `{TICKET-ID}` — {ticket title, if available}
- **Author:** {PR author}
```

Append the child skill's full report below the header, unchanged. Do not rewrite or summarize the child's findings.

If `checkoutState = UNHAPPY`, append this to the report footer:

> ⚠️ Codebase unavailable ({reason}). Consumer and call-site checks couldn't run. This review is diff-only.

### Phase 5 — Restore git state (always runs)

Runs before returning the report, even if Phases 1–4 errored. Cleanup that survives failure:

- If `checkoutState = CHECKED_OUT`: `git checkout {originalBranch}`.
- If `checkoutState = UNHAPPY`: nothing to restore; skip.

If the restore itself fails, say so clearly in the output. A silent failure leaves the user on an unexpected branch — worse than the review problem they started with.

**Rule:** Phase 5 is mandatory. Hit an error mid-pipeline → run Phase 5 before you finish the response.

---

## What this skill doesn't do

Keeping the boundary with `code-review` clean:

- Define review criteria, severity, category checklists, or output sections. Those belong to `code-review` or `e2e-review`.
- Produce findings of its own. A PR-level concern the child missed is a reason to improve `code-review`, not to duplicate logic here.
- Touch the PR. No comments, no approve or reject. The review is advisory; the human decides.
- Re-assess scope drift, consumers, or category coverage. The child reports those once, in its own format.
