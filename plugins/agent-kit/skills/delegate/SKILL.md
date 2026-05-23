---
name: delegate
description: 'Delegate a task to an external agent CLI (Gemini, Claude, or Codex) with optional handoff context'
version: 1.0.0
---

# 🤝 Delegate

**Raw Input:** $ARGUMENTS

---

## Execution

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
- If the agent fails to process (e.g., timed out or requested CLI is not installed), clearly report the error and terminate execution.
- Do NOT retry the execution if the agent fails.
- Do NOT post-process, summarize, or modify the agent's output. Report the exact, raw output to the user.
