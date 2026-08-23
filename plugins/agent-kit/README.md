# Agent-Kit

**Super Engineer** — a team of specialized AI agents for software development. Brainstorm ideas, plan implementations, write code, and review PRs using a structured multi-agent workflow.

## What It Does

### Commands

Agent Kit ships these workflows as skills. In Claude Code, invoke them as slash commands such as `/plan ...`. In Codex or Gemini, ask the agent to use Agent Kit or the named skill, for example: `Use Agent Kit plan for this change`.

| Skill / Command                 | Description                                                      |
| ------------------------------- | ---------------------------------------------------------------- |
| `/brainstorm [idea]`            | Turn a raw idea into an engineer-ready design brief              |
| `/clarify <file or task>`       | Resolve requirement gaps using codebase evidence                 |
| `/plan [file or idea]`          | Create a detailed implementation blueprint                       |
| `/preview [path]`               | Render a handoff or markdown doc as a glanceable HTML visual     |
| `/investigate [issue]`          | Trace bugs, errors, or unexpected behavior to root cause         |
| `/code [plan or report]`        | Implement from a WBS plan or investigation report                |
| `/test [intent]`                | Add or update focused tests after implementation intent exists   |
| `/code-review [diff or target]` | Review diffs, PRs, or commits with evidence-backed findings      |
| `/e2e-review [diff or target]`  | Review diffs, PRs, or commits with evidence-backed findings      |
| `/review [base]`                | Review local staged and unstaged changes                         |
| `/review-pr [PR URL]`           | Fetch PR/Jira context, check out the branch, and run code review |
| `/code-simplify [target]`       | Improve readability without changing behavior or public shape    |
| `/code-refactor [target]`       | Analyze structural refactors and produce a refactor proposal     |
| `/validate [artifact]`          | Validate artifacts directly or by appending `with /validate`     |
| `/research [topic]`             | Produce source-backed technical research                         |
| `/debate [subject]`             | Run adversarial validation of an analysis, review, or plan       |
| `/ticket [ID]`                  | Fetch a Jira ticket and route it into the planning pipeline      |
| `/delegate <agent> <task>`      | Delegate to Gemini, Claude, or Codex CLI with optional handoff   |

---

## Installation

### Option 1: Install via GitHub (Recommended)

Claude Code:

```bash
claude plugin marketplace add https://github.com/hanh-nd/agent-kit
claude plugin install agent-kit
```

Codex:

```bash
codex plugin marketplace add https://github.com/hanh-nd/agent-kit.git
codex
/plugins # then choose agent-kit
```

For Codex hooks, add this to `~/.codex/config.toml`:

```toml
[features]
plugin_hooks = true
```

**Add credentials** to `~/.agent-kit/credentials` (like `~/.aws/credentials`):

```bash
mkdir -p ~/.agent-kit && touch ~/.agent-kit/credentials && chmod 600 ~/.agent-kit/credentials
```

```ini
[default]
ATLASSIAN_CLOUD_ID = your-atlassian-cloud-id
ATLASSIAN_USER_EMAIL = you@yourcompany.com
JIRA_API_TOKEN = your-jira-api-token
CONFLUENCE_API_TOKEN = your-confluence-api-token
BITBUCKET_USER_EMAIL = you@yourcompany.com
BITBUCKET_API_TOKEN = your-atlassian-api-token
BITBUCKET_DEFAULT_WORKSPACE = your-default-workspace-slug
```

To use multiple profiles, add `[work]`, `[personal]`, etc. sections and set `KIT_PROFILE=work` in your environment.

To update: `claude plugin update agent-kit`
To uninstall: `claude plugin uninstall agent-kit`

---

### Option 2: Clone and Install Locally

Use this if you want to modify the plugin or develop against it.

**1. Clone and build**

```bash
git clone https://github.com/hanh-nd/agent-kit.git
cd agent-kit
npm install
npm run build
```

**2. Register the plugin**

Claude Code:

```bash
claude plugin marketplace add /absolute/path/to/agent-kit
claude plugin install agent-kit
```

Codex:

```bash
codex plugin marketplace add /absolute/path/to/agent-kit
codex
/plugins # then choose agent-kit
```

For Codex hooks, add this to `~/.codex/config.toml`:

```toml
[features]
plugin_hooks = true
```

Note that you may have to manually enable hooks in Codex settings.

**3. Add credentials** to `~/.agent-kit/credentials` for MCP integrations:

```bash
mkdir -p ~/.agent-kit && touch ~/.agent-kit/credentials && chmod 600 ~/.agent-kit/credentials
```

```ini
[default]
ATLASSIAN_CLOUD_ID = your-atlassian-cloud-id
ATLASSIAN_USER_EMAIL = you@yourcompany.com
JIRA_API_TOKEN = your-jira-api-token
CONFLUENCE_API_TOKEN = your-confluence-api-token
BITBUCKET_USER_EMAIL = you@yourcompany.com
BITBUCKET_API_TOKEN = your-atlassian-api-token
BITBUCKET_DEFAULT_WORKSPACE = your-default-workspace-slug
```

**4. Verify**

```
/brainstorm test idea
```

---

### Option 3: Install as Gemini Extension (Optional)

If you want to reuse the commands with [Gemini CLI](https://geminicli.com) (for `/delegate` to Gemini), install it using:

```bash
git clone https://github.com/hanh-nd/agent-kit.git
cd agent-kit/plugins/agent-kit
gemini extension link .gemini
```

---

## Development

```bash
# Build once
npm run build
```

This workspace builds the provider plugin bundles. Agent personas are in `agents/`. Canonical skill modules are in `skills/`; `npm run build` generates provider-safe copies into `.claude/skills/`, `.codex/skills/`, and `.gemini/skills/`.

---

## Requirements

- Node.js 18+
- Claude Code, Codex, or Gemini CLI

---

## Integrations

Credentials are stored in `~/.agent-kit/credentials` (INI format). Keys can also be set as environment variables — env vars take priority (useful for CI/CD).

### Jira (via Atlassian REST API)

Used by `/ticket` and `/review-pr`.

| Key                    | Description                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `ATLASSIAN_CLOUD_ID`   | Your Atlassian Cloud ID — find it at [admin.atlassian.com](https://admin.atlassian.com) under your site settings                         |
| `ATLASSIAN_USER_EMAIL` | Your Atlassian account email                                                                                                             |
| `JIRA_API_TOKEN`       | Jira API token — create at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |

### Confluence (via Atlassian REST API)

Confluence shares `ATLASSIAN_CLOUD_ID` and `ATLASSIAN_USER_EMAIL` with Jira — same site, same account — and differs only in the **token**, because Atlassian issues scoped API tokens per app and one token cannot hold both Jira and Confluence scopes.

Create a Confluence token with the `read:page:confluence` and `read:label:confluence` scopes at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens). The symptom of a missing or Jira-only token is a 401 whose body reads `Unauthorized; scope does not match`.

| Key                    | Description                                             |
| ---------------------- | -------------------------------------------------------- |
| `ATLASSIAN_CLOUD_ID`   | Shared with Jira — one site                             |
| `ATLASSIAN_USER_EMAIL` | Shared with Jira — same Atlassian account              |
| `CONFLUENCE_API_TOKEN` | Confluence-scoped token — separate from `JIRA_API_TOKEN` |

Accepted page references:

- `https://<site>.atlassian.net/wiki/spaces/<SPACEKEY>/pages/<pageId>/<Title>`
- `https://<site>.atlassian.net/pages/viewpage.action?pageId=<pageId>`
- a bare numeric page ID

Blog posts and tiny links (`/wiki/x/<hash>`) are not supported — open a tiny link in a browser and pass the full page URL instead.

### Bitbucket Cloud (via Bitbucket REST API)

Used by `/review-pr`.

| Key                           | Description                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `BITBUCKET_USER_EMAIL`        | Your Atlassian account email (same as Jira)                                                                                              |
| `BITBUCKET_API_TOKEN`         | API token — create at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |
| `BITBUCKET_DEFAULT_WORKSPACE` | Default workspace slug — used when passing a numeric PR ID without a `workspace` param                                                   |
