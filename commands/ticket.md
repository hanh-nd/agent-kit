---
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

4. Call `kit_save_handoff(type: "ticket", content: <formatted brief>, slug: "<extracted_id>")`.

5. The tool returns the saved file path. Output:

```
✅ Ticket brief saved. To create an implementation plan:
/plan @<returned-path>
```
