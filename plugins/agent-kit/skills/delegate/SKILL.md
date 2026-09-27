---
name: delegate
description: 'Delegate a task to an external agent CLI (Gemini, Claude, or Codex) with optional handoff context'
version: 2.0.0
---

# 🤝 Delegate

**Raw Input:** $ARGUMENTS

---

## Voice

Write for a tired teammate, not a reviewer you're impressing.

- Short sentences, one idea each. Plain words. "What else this touches", not "blast radius".
- Answer first, reason second.
- Bullets and tables over paragraphs.
- No filler openers, no self-praise, no restating the request.
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

The server streams the agent's output as MCP log notifications while it runs.

Call `kit_trigger_agent(agent: <agent>, task: <task>)`.

Report the full output to the user.

## Rules

- Agent fails — timeout, CLI not installed — report the error plainly and stop.
- Never retry.
- Never post-process, summarize, or edit the agent's output. Report it raw.
- Called by another skill (e.g. `plan` → parallel batches): hand over only sizeable, independent work. A task the caller can finish in a handful of edits stays with the caller.
