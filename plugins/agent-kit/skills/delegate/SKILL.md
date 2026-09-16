---
name: delegate
description: 'Delegate a task to an external agent CLI (Gemini, Claude, or Codex) with optional handoff context'
version: 1.1.0
---

# 🤝 Delegate

**Raw Input:** $ARGUMENTS

---

## Voice

Write for a tired teammate, not a reviewer you're impressing.

- Short sentences, one idea each. Cut every word that isn't load-bearing.
- Plain words. "What else this touches", not "blast radius".
- Answer first, reason second. Never the reverse.
- Bullets and tables over paragraphs. Three bullets max per point.
- A question is one question plus one recommendation, under 5 lines.
- No filler openers, no self-praise, no restating the request back.
- If the explanation is longer than the thing it explains, delete the explanation.

## Steps

Parse `$ARGUMENTS` as: `<agent> <task or handoff folder path>`

- **agent** — first word: `gemini`, `claude`, or `codex`
- **task** — remainder: a message string OR a path to a handoff folder

Examples:

- `/delegate gemini scout the codebase and summarize key patterns`
- `/delegate gemini .agent-kit/handoffs/feature-slug/plan`
- `/delegate claude implement the plan in .agent-kit/handoffs/feature-slug/plan`
- `/delegate codex review this repo and identify risky refactors`

---

> The server streams Gemini's output in real-time as MCP log notifications.
> You will see progress appear in the conversation as the agent runs.

Call `kit_trigger_agent(agent: <agent>, task: <task>)`.

Report the full output to the user.

## Rules

- Agent fails — timeout, CLI not installed — report the error plainly and stop.
- Never retry.
- Never post-process, summarize, or edit the agent's output. Report it raw.
