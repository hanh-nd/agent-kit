# Agent-Kit

**Super Engineer** — a team of specialized AI agents for software development. Brainstorm ideas, plan implementations, write code, and review PRs using a structured multi-agent workflow powered by Claude Code.

## What It Does

### Commands

| Command                          | Description                                                        |
| -------------------------------- | ------------------------------------------------------------------ |
| `/ak:brainstorm [idea]`          | Strategic architectural analysis                                   |
| `/ak:plan [file or idea]`        | Create an implementation blueprint                                 |
| `/ak:code [file or task]`        | Implement from a plan                                              |
| `/ak:research [topic]`           | Research a topic                                                   |
| `/ak:review-pr [PR URL]`         | Review a pull request                                              |
| `/ak:review`                     | Review uncommitted local changes                                   |
| `/ak:ticket [ID]`                | Fetch a Jira ticket and plan from it                               |
| `/ak:git`                        | Git commit, branch, and PR workflow                                |
| `/ak:init`                       | Create the project overview file                                   |
| `/ak:orchestrate [file or idea]` | Orchestrate agents to solve problems span across multiple projects |
| `/ak:delegate <agent> <task>`    | Delegate a task to Gemini or Claude CLI                            |

---

## Installation

### Option 1: Install via GitHub (Recommended)

```bash
claude plugin marketplace add https://github.com/hanh-nd/agent-kit
claude plugin install agent-kit
```

The plugin fetches from GitHub, registers the MCP server automatically, and makes all commands available immediately.

**Add credentials** to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export ATLASSIAN_CLOUD_ID="your-atlassian-cloud-id"
export ATLASSIAN_USER_EMAIL="you@yourcompany.com"
export ATLASSIAN_API_TOKEN="your-atlassian-api-token"
export BITBUCKET_USER_EMAIL="you@yourcompany.com"
export BITBUCKET_API_TOKEN="your-atlassian-api-token"
export BITBUCKET_DEFAULT_WORKSPACE="your-default-workspace-slug"
```

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

```bash
claude plugin marketplace add /absolute/path/to/agent-kit
claude plugin install agent-kit
```

This registers the MCP server automatically (pointing to your local build). Do **not** manually add a `kit-agents` entry to `settings.json` — the plugin handles that.

**3. Add credentials** to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export ATLASSIAN_CLOUD_ID="your-atlassian-cloud-id"
export ATLASSIAN_USER_EMAIL="you@yourcompany.com"
export ATLASSIAN_API_TOKEN="your-atlassian-api-token"
export BITBUCKET_USER_EMAIL="you@yourcompany.com"
export BITBUCKET_API_TOKEN="your-atlassian-api-token"
export BITBUCKET_DEFAULT_WORKSPACE="your-default-workspace-slug"
```

**4. Verify**

```
/ak:brainstorm test idea
```

---

### Option 3: Install as Gemini Extension (Optional)

If you want to reuse the commands with [Gemini CLI](https://geminicli.com) (for `/ak:delegate` to Gemini), install it using:

```bash
gemini extension install https://github.com/hanh-nd/agent-kit
```

---

## Development

```bash
# Build once
npm run build

# Watch mode (rebuilds on file changes)
npm run dev
```

The MCP server source is in `src/`. Agent personas are in `agents/`. Skill modules are in `skills/`.

---

## Requirements

- Node.js 18+
- Claude Code (latest)

---

## Integrations

### Jira (via Atlassian REST API)

Used by `/ak:ticket` and `/ak:review-pr`.

| Variable               | Description                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `ATLASSIAN_CLOUD_ID`   | Your Atlassian Cloud ID — find it at [admin.atlassian.com](https://admin.atlassian.com) under your site settings                         |
| `ATLASSIAN_USER_EMAIL` | Your Atlassian account email                                                                                                             |
| `ATLASSIAN_API_TOKEN`  | API token — create at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |

### Bitbucket Cloud (via Bitbucket REST API)

Used by `/ak:review-pr`.

| Variable                      | Description                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `BITBUCKET_USER_EMAIL`        | Your Atlassian account email (same as Jira)                                                                                              |
| `BITBUCKET_API_TOKEN`         | API token — create at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |
| `BITBUCKET_DEFAULT_WORKSPACE` | Default workspace slug — used when passing a numeric PR ID without a `workspace` param                                                   |
