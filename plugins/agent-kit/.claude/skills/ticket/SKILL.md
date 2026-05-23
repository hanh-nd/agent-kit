---
name: ticket
description: 'Fetch a Jira ticket and route to the planning pipeline'
---

# 🎫 Ticket

**Raw Input:** $ARGUMENTS

---

## Execution

1. Extract the ticket ID from `$ARGUMENTS`.
   - If it's a URL (e.g., `https://jira.com/browse/PROJ-123`), extract `PROJ-123`.
   - If it's a string with extra text (e.g., `Fixing PROJ-123`), isolate `PROJ-123`.

2. Call `kit_jira_get_ticket(ticketId: "<extracted_id>")` to fetch the ticket.

3. Format the ticket as a clean markdown brief:

```markdown
## Ticket: <extracted_id>

**Title:** <ticket title>
**Type:** <Bug | Feature | Task | etc.>
**Priority:** <priority>
**Status:** <status>

### Description

<ticket raw description>
```

4. Call `kit_save_handoff(type: "ticket", slug: "<extracted_id>", files: { "README.md": <formatted brief> })`.

5. The tool returns the saved folder path. Present the execution choices as an interactive TUI menu using arrow keys (use `AskUserQuestion` tool or `ask_user` with type of `choice`) with the following format:

```
✅ Ticket brief saved → `<returned-path>`

What would you like to do next?

1) Plan        — Start /plan with this ticket
2) Done        — No further action
```

**On user selection:**

- **1 — Plan:** Invoke `/plan @<saved-path>` to hand the ticket brief folder directly to the planning skill.
- **2 — Done:** Output `Ticket saved. No further action.` and stop.
- **3 — Custom:** The user types their request. Treat it as continuing the conversation — brainstorm the approach, ask questions about the ticket, or anything else they need.
