---
name: delegate
description: 'Delegate a task to an external agent CLI (Gemini, Claude, or Codex) with optional handoff context'
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

Parse `$ARGUMENTS` as: `<agent> [--session <id>] <task or handoff folder path>`

- **agent** — first word: `gemini`, `claude`, or `codex`
- **--session <id>** (or `--session=<id>`) — optional: session ID from a previous run to resume context and provide feedback
- **task** — remainder: a message string (new task or feedback) OR a path to a handoff folder

Examples:

- `/delegate gemini scout the codebase and summarize key patterns`
- `/delegate gemini --session 460812bf-c1bd-4ae7-8153-4fb8bb929098 fix the failing test in auth.test.ts`
- `/delegate claude implement the plan in .agent-kit/handoffs/feature-slug/plan`
- `/delegate claude --session 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d handle the timeout edge case`
- `/delegate codex review this repo and identify risky refactors`

---

The server streams the agent's output as MCP log notifications while it runs.

Call `kit_delegate(agent: <agent>, task: <task>, sessionId: <sessionId if present>)`.

Report the full output and `sessionId` to the user so follow-up feedback can be passed via `--session <sessionId>`.

## Rules

- Agent fails — timeout, CLI not installed — report the error plainly and stop.
- Never retry automatically without caller feedback.
- Never post-process, summarize, or edit the agent's output. Report it raw.
- Called by another skill (e.g. `plan` → parallel batches): hand over only sizeable, independent work. A task the caller can finish in a handful of edits stays with the caller.
