---
name: ship
description: Commit and push local changes, open Bitbucket PRs with reviewers by name, and optionally post the PR links to a Slack channel. Use when the user runs /ship, e.g. "/ship to Dien and Dung", "/ship draft to Dien", or "/ship to Dien, then send slack message to code-review: @enablement please help me to review".
version: 1.0.0
providers:
  claude:
    model: sonnet
    effort: low
    disable-model-invocation: true
  codex:
    policy:
      allow_implicit_invocation: false
---

# Ship

**Request:** $ARGUMENTS

## Voice

Write for a tired teammate, not a reviewer you're impressing.

- Short sentences, one idea each. Plain words. "What else this touches", not "blast radius".
- Answer first, reason second.
- Bullets and tables over paragraphs.
- No filler openers, no self-praise, no restating the request.
- If the explanation is longer than the thing it explains, delete the explanation.

---

## Read the request

| Phrase | Meaning |
|---|---|
| `to Dien and Dung` | Reviewers, by name. Resolved in step 1. |
| `draft` | Create draft PRs. |
| `into develop` | Destination branch. Absent → the repo's default branch, unless merged PRs in `git log` clearly go elsewhere; flag the pick. |
| `then send slack message to <channel>: <text>` | After the PRs, post to `<channel>`. No such clause → PRs only, no Slack. |

## Find the repos

The current repo, if it has changes. If the cwd is not a repo, each immediate child repo with changes. Each shipped repo gets one commit and one PR. Clean repos are skipped silently.

## Pipeline

Run in this order. Steps 1–2 touch nothing remote, so a stop there leaves nothing pushed or posted.

### 1. Resolve every name first

Everything that can need an answer is resolved here, so all questions come in one batch before anything is written.

- **Reviewers** — `kit_find_bitbucket_reviewers(names, workspace)`, with the workspace from `git remote get-url origin`. One call per workspace. Keep the resolved full names or UUIDs for step 5.
- **Slack channel** (if posting) — `slack_search_channels`; use the exact, non-archived name match.
- **Slack mentions** (if posting) — a plain `@mention` sent through the API notifies no one. Convert each one:
  - Person (`@Hoang Nguyen`) → `slack_search_users` with the name; one match → `<@U…>`.
  - Group (`@enablement`) → search Slack messages for an earlier mention of it (`slack_search_public`, keyword = the group name); it renders as `<!subteam^S…>`.
  - Not found → keep the plain text and flag it.

Any name ambiguous or not found (a not-found Slack mention excepted) → ask once, listing the candidates for every problem name. Commit nothing until answered.

### 2. Decide what to commit

- Stage only the files that belong to the change. Leave out secrets (`.env*`, keys, credentials), personal notes, and unrelated churn such as a lockfile from an unrelated install. List what was left out in the final message.
- On the default branch, create a branch first: `<prefix>/<short-slug>`, with the ticket key if one is known (`feature/YR-501-guest-notes`). Match the prefix style of the repo's existing branches (`feature/` vs `feat/`). Never commit to or push the default branch.
- Leave existing commits alone — no amend, squash, or `reset`. A non-conforming unpushed commit is flagged, not rewritten.

### 3. Commit

One commit per repo. **Subject line only — no body, no `Refs:` trailer, no second `-m`.**

- Conventional commit, `type(scope): subject`. Follow the repo's commitlint config (`scope-enum`, `header-max-length`) and recent `git log` style for scope.
- Imperative, lowercase, no trailing period, ≤ 72 characters. Say what changed, not how.

```bash
git commit -m "feat(notes): add guest notes endpoint"
```

Never pass `--no-verify`. If a hook fails on a mechanical issue (unused import, formatting), fix it, re-stage, commit again, and report the fix. Anything needing a judgment call → stop for that repo and report the hook output. Stop after 2 attempts on the same failure.

### 4. Push

`git push -u origin <branch>`. Never force-push.

### 5. Create the PR

`kit_create_bitbucket_pr` per repo:

- `title` — the commit subject, verbatim. No ticket prefix or suffix.
- `description` — 2–5 bullets on what changed and why. Mention the ticket key and any related PR from the same ship.
- `reviewers` — the names resolved in step 1.
- `draft: true` only when the request says draft.
- Omit `closeSourceBranch` unless the user asked.

If one repo fails, finish the others and report the failure.

### 6. Post to Slack (only if asked)

`slack_send_message` to the channel from step 1, with the user's text verbatim (mentions converted), then one PR URL per line. Nothing else — no bullets, repo names, titles, or emoji:

```
@enablement please help me to review
https://bitbucket.org/yourrentals/calendar/pull-requests/437
https://bitbucket.org/yourrentals/image/pull-requests/192
```

Send after every repo has finished. List only the PRs that were created and flag the failed repos. No PR created → don't post.

## Final message

- One line per PR: URL, `source → destination`, reviewers, draft if so.
- Slack message link, if posted.
- Flags: a new branch created (the checkout is now on it), files left out, a destination picked from history, hook fixes, a mention sent as plain text, failed repos, you dropped as reviewer (the PR tool reports this).
