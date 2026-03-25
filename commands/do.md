---
description: "Analyze a task and route it through the right pipeline"
---

# 🧠 AI Router — Auto Orchestrator

**Task:** $ARGUMENTS

If no task is provided, output usage instructions and stop:
```
Usage: /do <describe your task>

Examples:
  /do implement user authentication with JWT
  /do add pagination to the posts endpoint
  /do review the changes on feature/payment-refactor
```

---

## Step 1: Classify

Analyze the task and determine the right pipeline:

| Task Type | Pipeline |
|---|---|
| Vague idea or requires design discussion | `/brainstorm` |
| Has clear requirements, needs architecture | `/plan` |
| Has a plan file ready, implement it | `/code @<plan-path>` |
| PR URL or diff to review | `/review-pr` or `/review-changes` |
| No existing plan, implement directly | `/plan` → `/code` |

## Step 2: Announce

Output your routing decision:

```text
Routing Decision
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Task:     <brief summary>
Pipeline: <cmd1> → <cmd2>
Strategy: <one-line explanation>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Step 3: Execute

1. Run the first command by following its full workflow (the command files are self-contained — load the first command's instructions and execute them).
2. After each command completes, announce:
   ```
   ✅ Completed: /<command>
   Next: /<next-command> — Proceed? (y/n)
   ```
3. Wait for user confirmation before continuing to the next step.
4. Repeat until the pipeline is complete.
