# Agent-Kit

**Super Engineer** — a team of specialized AI agents for software development. Brainstorm ideas, plan implementations, write code, and review PRs using a structured multi-agent workflow powered by Claude Code.

## What It Does

### Commands

| Command                           | Description                                                        |
| --------------------------------- | ------------------------------------------------------------------ |
| `/ak:brainstorm [idea]`           | Strategic architectural analysis                                   |
| `/ak:plan [file or idea]`         | Create an implementation blueprint                                 |
| `/ak:code [file or task]`         | Implement from a plan                                              |
| `/ak:code-simplify`               | Refactor modified code for readability                             |
| `/ak:research [topic]`            | Research a topic                                                   |
| `/ak:review-pr [PR URL]`          | Review a pull request                                              |
| `/ak:review`                      | Review uncommitted local changes                                   |
| `/ak:debate [subject]`            | Run adversarial debate (Gilfoyle vs Dinesh vs Judge)               |
| `/ak:ticket [ID]`                 | Fetch a Jira ticket and plan from it                               |
| `/ak:git`                         | Git commit, branch, and PR workflow                                |
| `/ak:init`                        | Create the project overview file                                   |
| `/ak:orchestrate [file or idea]`  | Orchestrate agents to solve problems span across multiple projects |
| `/ak:delegate <agent> <task>`     | Delegate a task to Gemini or Claude CLI                            |
| `/ak:wiki [compile\|query\|lint]` | Maintain a persistent, compounding project knowledge wiki          |

---

## Wiki

The wiki is a persistent, compounding knowledge base that accumulates architectural decisions, feature history, patterns, and edge cases across sessions. Unlike conversation memory (which resets), the wiki survives compaction, restarts, and new sessions — it is the long-term institutional memory of your project.

### How It's Auto-Populated (Hooks)

You don't need to run the wiki manually. Five hooks keep it fed automatically:

- **PostToolUse** — every `kit_save_handoff` call is automatically logged to `.agent-kit/wiki/raw/inbox.md`
- **PreCompact** — before `/compact` discards context, the full session transcript is exported to `.agent-kit/wiki/raw/`
- **PostCompact** — after compaction, the wiki index is re-injected as context so the very next turn has full project knowledge
- **SessionEnd** — before session is cleared, the conversation transcript is exported to `.agent-kit/wiki/raw/`
- **SessionStart (clear)** — after `/clear` resets the session, the wiki index is re-injected so the fresh session starts with full project knowledge

### Operations

| Command                          | Description                                                           |
| -------------------------------- | --------------------------------------------------------------------- |
| `/ak:wiki` or `/ak:wiki compile` | Ingest raw inbox + conversation exports → build/update wiki pages     |
| `/ak:wiki query {question}`      | Search the wiki and synthesize a cited answer                         |
| `/ak:wiki lint`                  | Health-check: broken links, orphan pages, contradictions, stale inbox |

### Directory Structure

```
.agent-kit/wiki/
├── raw/
│   ├── inbox.md          # Auto-appended by PostToolUse hook (handoff logs)
│   └── conv_*.md         # Exported by PreCompact hook (conversation transcripts)
├── compiled/
│   └── *.md              # Structured wiki pages built by /ak:wiki compile
└── archive/
    └── *.md              # Old raw files moved here after compilation
```

---

## Installation

### Option 1: Install via GitHub (Recommended)

```bash
claude plugin marketplace add https://github.com/hanh-nd/agent-kit
claude plugin install ak
```

The plugin fetches from GitHub, registers the MCP server automatically, and makes all commands available immediately.

**Add credentials** to `~/.claude/credentials` (like `~/.aws/credentials`):

```bash
touch ~/.claude/credentials && chmod 600 ~/.claude/credentials
```

```ini
[default]
ATLASSIAN_CLOUD_ID = your-atlassian-cloud-id
ATLASSIAN_USER_EMAIL = you@yourcompany.com
ATLASSIAN_API_TOKEN = your-atlassian-api-token
BITBUCKET_USER_EMAIL = you@yourcompany.com
BITBUCKET_API_TOKEN = your-atlassian-api-token
BITBUCKET_DEFAULT_WORKSPACE = your-default-workspace-slug
```

To use multiple profiles, add `[work]`, `[personal]`, etc. sections and set `KIT_PROFILE=work` in your environment.

To update: `claude plugin update ak`
To uninstall: `claude plugin uninstall ak`

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
claude plugin install ak
```

This registers the MCP server automatically (pointing to your local build). Do **not** manually add a `kit-agents` entry to `settings.json` — the plugin handles that.

**3. Add credentials** to `~/.claude/credentials`:

```bash
touch ~/.claude/credentials && chmod 600 ~/.claude/credentials
```

```ini
[default]
ATLASSIAN_CLOUD_ID = your-atlassian-cloud-id
ATLASSIAN_USER_EMAIL = you@yourcompany.com
ATLASSIAN_API_TOKEN = your-atlassian-api-token
BITBUCKET_USER_EMAIL = you@yourcompany.com
BITBUCKET_API_TOKEN = your-atlassian-api-token
BITBUCKET_DEFAULT_WORKSPACE = your-default-workspace-slug
```

**4. Verify**

```
/ak:brainstorm test idea
```

---

### Option 3: Install as Gemini Extension (Optional)

If you want to reuse the commands with [Gemini CLI](https://geminicli.com) (for `/ak:delegate` to Gemini), install it using:

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

Credentials are stored in `~/.claude/credentials` (INI format). Keys can also be set as environment variables — env vars take priority (useful for CI/CD).

### Jira (via Atlassian REST API)

Used by `/ak:ticket` and `/ak:review-pr`.

| Key                    | Description                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `ATLASSIAN_CLOUD_ID`   | Your Atlassian Cloud ID — find it at [admin.atlassian.com](https://admin.atlassian.com) under your site settings                         |
| `ATLASSIAN_USER_EMAIL` | Your Atlassian account email                                                                                                             |
| `ATLASSIAN_API_TOKEN`  | API token — create at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |

### Bitbucket Cloud (via Bitbucket REST API)

Used by `/ak:review-pr`.

| Key                           | Description                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `BITBUCKET_USER_EMAIL`        | Your Atlassian account email (same as Jira)                                                                                              |
| `BITBUCKET_API_TOKEN`         | API token — create at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |
| `BITBUCKET_DEFAULT_WORKSPACE` | Default workspace slug — used when passing a numeric PR ID without a `workspace` param                                                   |
