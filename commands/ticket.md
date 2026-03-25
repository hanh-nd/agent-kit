---
description: "Fetch a Jira ticket and route to the planning pipeline"
---

# 🎫 Ticket

**Ticket ID:** $ARGUMENTS

---

## Execution

1. Call `kit_jira_get_ticket(ticketId: "$ARGUMENTS")` to fetch the ticket.

2. Format the ticket as a clean markdown brief:

```markdown
## Ticket: $ARGUMENTS

**Title:** <ticket title>
**Type:** <Bug | Feature | Task | etc.>
**Priority:** <priority>
**Status:** <status>

### Description
<ticket description>

### Acceptance Criteria
<acceptance criteria as a checklist>

### Additional Context
<labels, components, linked issues if present>
```

3. Call `kit_save_handoff(type: "ticket", content: <formatted brief>, slug: "$ARGUMENTS")`.

4. The tool returns the saved file path. Output:

```
✅ Ticket brief saved. To create an implementation plan:
/plan @<returned-path>
```
