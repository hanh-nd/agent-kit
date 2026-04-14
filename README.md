# Agent Suite Marketplace

A collection of specialized AI agents for software development, research, and learning. This repository acts as a distribution hub (Marketplace) for Claude Code and Gemini.

## Available Plugins

| Plugin                                     | Description                                                 | Language     |
| :----------------------------------------- | :---------------------------------------------------------- | :----------- |
| [**agent-kit**](./plugins/agent-kit)       | Super Engineer - Team of AI Agents for software development | Node.js (TS) |
| [**learning-kit**](./plugins/learning-kit) | Learning Kit - Team of AI Agents for software development   | Node.js (TS) |

## Installation (Claude Code)

To add this entire marketplace to Claude Code:

```bash
claude plugin marketplace add https://github.com/hanh-nd/agent-kit
```

Then install individual plugins:

```bash
claude plugin install [plugin-name]
```

## Installation (Gemini)

To install as a Gemini extension:

```bash
git clone https://github.com/hanh-nd/agent-kit.git
cd agent-kit/plugins/[plugin-name]
gemini extension link .gemini
```

## Development

This is a polyglot monorepo. Each plugin in `plugins/` is an independent project.

### Node.js Plugins (agent-kit)

```bash
cd plugins/agent-kit
npm install
npm run build
```

### Contributing

To add a new plugin:

1. Create a new directory in `plugins/`.
2. Add a `.claude-plugin/plugin.json` (for Claude) and `gemini-extension.json` (for Gemini).
3. Register the plugin in the root `.claude-plugin/marketplace.json`.
