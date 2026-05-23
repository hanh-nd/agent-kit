# Memory-Kit

**Memory Kit** — Native TypeScript persistent memory for AI agents, integrating with the Agent Kit ecosystem.

Memory Kit provides a zero-configuration, persistent knowledge base for your AI workflows. It allows agents to store, index, and retrieve project context (like architectural decisions, conventions, and learnings) across sessions without needing a standalone vector database or complex setup.

## What It Does

### Commands

| Skill / Command                  | Description                                                        |
| -------------------------------- | ------------------------------------------------------------------ |
| `/wiki [compile\|query\|lint]`   | Persistent project wiki. Commands — compile (default), query {question}, lint. |
| `/recall [query]`                | Search persistent memory for context relevant to the current question. |
| `/init-digest [model]`            | Initialize or toggle optional local conversation digesting setup.  |

---

## Installation

### Option 1: Install via GitHub (Recommended)

Claude Code:

```bash
claude plugin marketplace add https://github.com/hanh-nd/agent-kit
claude plugin install memory-kit
```

Codex:

```bash
codex plugin marketplace add https://github.com/hanh-nd/agent-kit.git
codex
/plugins # then choose memory-kit
```

For Codex hooks, add this to `~/.codex/config.toml`:

```toml
[features]
plugin_hooks = true
```

Note that you may have to manually enable hooks in Codex settings.

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
claude plugin install memory-kit
```

Codex:

```bash
codex plugin marketplace add /absolute/path/to/agent-kit
codex
/plugins # then choose memory-kit
```

For Codex hooks, add this to `~/.codex/config.toml`:

```toml
[features]
plugin_hooks = true
```

**3. Verify**

```
/recall test query
```

---

### Option 3: Install as Gemini Extension (Optional)

If you want to reuse the commands with [Gemini CLI](https://geminicli.com) (for `/delegate` to Gemini), install it using:

```bash
git clone https://github.com/hanh-nd/agent-kit.git
cd agent-kit/plugins/memory-kit
gemini extension link .gemini
```

---

## Development

```bash
# Build once
npm run build
```

This workspace builds the provider plugin bundles. Canonical skill modules are in `skills/`; `npm run build` generates provider-safe copies into `.claude/skills/`, `.codex/skills/`, and `.gemini/skills/`.

---

## Requirements

- Node.js 18+
- Claude Code, Codex, or Gemini CLI
