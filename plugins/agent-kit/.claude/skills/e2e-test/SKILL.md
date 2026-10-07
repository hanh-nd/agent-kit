---
name: e2e-test
description: 'Proves a branch works end to end against the local Tilt stack before a PR. Checks the running Tilt resource is built from this branch, derives a minimal critical test plan from the plan handoff or diff, asks the human once for any missing setup (Tilt, URLs, login, token), runs API checks over HTTP, UI checks via chrome-devtools-mcp, and cron jobs via kubectl on fresh test data, then reports PASS/FAIL/BLOCKED per case with evidence. Report only, no fixes. Use when the user runs /e2e-test in a code repo, or asks to e2e test, smoke test, or verify a change on the local stack.'
argument-hint: '[base-branch or focus]'
disable-model-invocation: true
model: sonnet
effort: high
---

# E2E Test

**Input:** $ARGUMENTS

## Voice

Write for a tired teammate, not a reviewer you're impressing.

- Short sentences, one idea each. Plain words. "What else this touches", not "blast radius".
- Answer first, reason second.
- Bullets and tables over paragraphs.
- No filler openers, no self-praise, no restating the request.
- If the explanation is longer than the thing it explains, delete the explanation.

---

## The point

Unit tests already passed. This run proves the wiring: route, auth, gateway, UI binding, against the code on this branch, running locally.

It's a sensor. It never edits the repo, never fixes a failure, and never tests code it can't prove came from this branch.

**Out of scope.** Typecheck, lint, unit tests, coverage search, the Playwright repo, test-data cleanup, infra repos (helm overlays, secret files). Those are other skills' jobs or out of bounds.

## Before adding a case

Stop at the first rung that holds:

1. **Does it need to exist?** Name the wiring bug it would catch. Can't → skip.
2. **Already proven by another case this run?** Skip it.
3. **Provable over plain HTTP?** API case. Cheaper and steadier than UI.
4. **Only then:** a UI or job case.

Aim for 3–8 cases. A one-file UI change usually needs 2–3: the new behavior, and one regression on the path it touched. Cosmetic checks (collapse toggles, sibling sections that didn't change) don't earn a case.

## When not to cut

- Every acceptance criterion in the plan handoff, if one exists.
- Auth or permission paths the change touches.
- Anything that writes data: prove the write landed.

## 1. Find what changed

- Base: `$ARGUMENTS` if given, else the remote default branch (`git symbolic-ref refs/remotes/origin/HEAD`). `git fetch origin <base>` first; a stale local ref pulls already-merged work into the diff. Diff = `git diff $(git merge-base origin/<base> HEAD)` plus uncommitted.
- Plan: `.agent-kit/handoffs/<ticket>/plan/` if present (ticket key from the branch name, matched case-insensitively). It owns expected behavior and scope; the diff is the fallback. Diff far larger than the plan (branch carries merged work) → scope to the plan's files and this ticket's commits.
- Resource: match changed paths to the repo's own `Tiltfile` (`docker_build` context, `k8s_resource` name). Tilt may run from another repo's Tiltfile that includes this one; the names still come from here. Unclear → put it in the step 4 ask and run step 2 after the answer.

## 2. Check readiness

Read-only checks. Never fix setup yourself: anything missing goes into the one ask in step 4.

| Check | How | Missing → ask the human to |
|---|---|---|
| Tilt reachable | `tilt get uiresource <name> -o json` | start Tilt |
| Resource enabled and up | `status.disableStatus.state`, `runtimeStatus`, `updateStatus` | enable `<name>` in Tilt |
| Built from current tree | `status.buildHistory[0].finishTime` is newer than the newest mtime of the changed files, and no `pendingBuildSince` | Pending build → wait once first. Still stale → trigger a rebuild |
| No build error | `buildHistory[0].error` empty | fix the build (quote Tilt's error line) |
| Base URL | Tilt `status.endpointLinks` | give the base URL of each app the cases hit |
| Devtools browser opens | `list_pages` | close the other Chrome holding the profile, or restart chrome-devtools-mcp |
| UI login | Load one protected page in the devtools browser. The profile persists, so a past login usually holds. | log in in the devtools browser window |
| API token | `E2E_API_TOKEN` env, if API cases need auth | export `E2E_API_TOKEN` and restart the session |

Resources with `live_update` sync files without a new build, so build time proves little. For them, compare one changed file inside the pod (`kubectl exec … md5sum`) with the local copy.

Never bypass auth: no forged cookies or sessions, no dev-bypass personas, no reading secrets or tokens from the browser or cluster. Never print or save a token.

A request answered by a `*-dev` host instead of the local one is testing someone else's code: BLOCKED.

## 3. Plan

Short table: id, kind, covers, expect, data it needs. Apply the ladder.

**Test data is fresh every run.** Create what the cases need through the app's own API or UI, named `e2e-<ticket>-<HHmm>`. Reuse a record across cases in this run; never search for or reuse records from earlier runs. No create path for a record (e.g. it comes from an upstream system) → add it to the ask.

## 4. Ask once, then run

Show the plan. Everything missing from steps 2–3 goes into **one** message to the human, as a checklist. Wait for "done", re-run only the failed checks, then run all cases without further stops. No answer, or still missing → the cases that need it are BLOCKED; run the rest.

Nothing missing → show the plan and start right away. No approval gate; the user can interrupt.

### API cases

- One request per case. Assert the status code plus the fields the change affects.

### UI cases (chrome-devtools-mcp)

- One `take_snapshot` per screen, then targeted reads. Act by snapshot `uid`.
- Per case, check `list_console_messages` and `list_network_requests` for errors on the path you touched.
- When switching accounts, clear localStorage and sessionStorage. Multi-account switchers keep the old identity otherwise.
- Login wall mid-run (session expired) → ask the human to log in again, then continue.

### Job cases

- Cron: `kubectl create job e2e-<ticket>-<n> --from=cronjob/<name> -n <ns>`, wait, then read its logs and the data it should change.
- A queue consumer with no trigger endpoint → BLOCKED with the reason. Never edit code to call a function.

### Verdicts

- **PASS** — observed the expected result.
- **FAIL** — ran, and the result is wrong. A confirmed bug.
- **BLOCKED** — couldn't run (auth, data, infra). Not a bug.

A failure in your own setup (wrong selector, bad request body) isn't a FAIL. Fix the step and re-run. Stop after 2–3 attempts on the same step and mark it BLOCKED.

## Output

Chat only. No files, no screenshots.

```markdown
**E2E <branch>: <n> PASS · <n> FAIL · <n> BLOCKED**

Running code: <resource> built <time>, newer than the change ✓

| # | Case | Kind | Verdict | Evidence |
|---|---|---|---|---|
| E1 | ... | api | PASS | `GET /x/1` → 200, `field: "y"` |
| E2 | ... | ui | FAIL | Expected "..."; saw "..."; console: `TypeError ...` |

**Next:** <per FAIL: `/investigate E2` or fix and re-run> · <per BLOCKED: what unblocks it>
**Defaults used:** <base branch, URLs, data created>
```

Evidence is inline and short: status line plus the key fields, the visible text, the first console or network error.
