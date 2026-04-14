# Learning Kit

**The Scholar** — a specialized AI learning agent for mastering new subjects. Automate source discovery, knowledge mapping, and adversarial gap analysis to build comprehensive learning roadmaps powered by Claude Code.

## What It Does

### Commands

| Command               | Description                                                                |
| --------------------- | -------------------------------------------------------------------------- |
| `/lk:init [topic]`    | Initialize a new learning topic with NotebookLM                            |
| `/lk:roadmap [topic]` | Build the final learning roadmap and save to Obsidian                      |
| `/lk:list`            | List all in-progress and completed learning topics tracked by Learning Kit |
| `/nlm [command]`      | Direct access to NotebookLM CLI/MCP expert                                 |

---

## Workflow

The Learning Kit follows a specific 3-phase workflow to ensure deep mastery and identification of "Unknown Unknowns":

### Phase 1a: Init & Discovery (`/lk:init`)

- Discovers sources (from a local directory or via automatic web research)
- Creates a **Seed** notebook in NotebookLM
- Extracts a **KnowledgeMap** (topics, subtopics, and current knowledge gaps)
- Generates **Clustered Research Queries** to feed into the adversarial research phase

### Phase 1b: Deep Research (Manual)

- The user opens the **Adversarial** notebook in their browser
- Runs the generated clustered queries in the NotebookLM Deep Research tool
- Saves the resulting reports as **Notes** within the notebook

### Phase 1c: Roadmap Generation (`/lk:roadmap`)

- Resumes the workflow after the user completes the manual research
- Performs sequential extraction of insights and adversarial viewpoints from the research
- Synthesizes all findings into a comprehensive **Markdown Learning Roadmap**
- Automatically writes the roadmap to your **Obsidian vault** (if configured)

---

## Installation

### Option 1: Install via GitHub (Recommended)

```bash
claude plugin marketplace add https://github.com/hanh-nd/agent-kit
claude plugin install lk
```

The plugin fetches from GitHub, registers the MCP server automatically, and makes all commands available immediately.

To update: `claude plugin update lk`
To uninstall: `claude plugin uninstall lk`

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
claude plugin install lk
```

This registers the MCP server automatically (pointing to your local build). Do **not** manually add a `notebooklm` entry to `settings.json` — the plugin handles that.

**3. Verify**

```
/lk:list
```

---

### Option 3: Install as Gemini Extension (Optional)

If you want to reuse the commands with [Gemini CLI](https://geminicli.com), install it using:

```bash
gemini extension install https://github.com/hanh-nd/agent-kit/plugins/learning-kit
```

---

## Development

```bash
# Build once
npm run build

# Watch mode (rebuilds on file changes)
npm run dev
```

Skill modules are in `skills/`.

---

## Requirements

- Node.js 18+
- Claude Code (latest)
- NotebookLM account (logged in via `nlm login`)

---

## Integrations

### NotebookLM (via `nlm` CLI)

Used for all notebook operations, research, and query tasks.

- Run `nlm login` to authenticate before using Learning Kit commands.
- Run `nlm login switch <profile>` if you use multiple Google accounts.

### Obsidian

Learning Kit can automatically save your roadmaps to your Obsidian vault.

- Set the `OBSIDIAN_VAULT_PATH` environment variable to the absolute path of your Obsidian vault.
- Roadmaps will be saved in `00_Roadmaps/[slug]_Roadmap.md`.
