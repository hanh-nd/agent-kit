---
name: ticket
description: 'Fetch a Jira ticket and route to the planning pipeline'
disable-model-invocation: true
effort: low
---

# 🎫 Ticket

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

1. Extract the ticket ID from `$ARGUMENTS`.
   - If it's a URL (e.g., `https://jira.com/browse/PROJ-123`), extract `PROJ-123`.
   - If it's a string with extra text (e.g., `Fixing PROJ-123`), isolate `PROJ-123`.

2. Call `kit_jira_get_ticket(ticketId: "<extracted_id>")` to fetch the ticket.

3. Confluence links in the description: fetch the ones likely to hold requirements, ACs, or a spec for this ticket (judge by title and context) with `kit_confluence_get_page` and append them to the brief. List the rest as references, unfetched.

4. Format the ticket as a clean markdown brief:

```markdown
## Ticket: <extracted_id>

**Title:** <ticket title>
**Type:** <Bug | Feature | Task | etc.>
**Priority:** <priority>
**Status:** <status>

### Description

<ticket raw description>
```

5. Call `kit_save_handoff(type: "ticket", slug: "<extracted_id>", files: { "README.md": <formatted brief> })`.

6. The tool returns the saved folder path. Present the next step as a choice menu (`AskUserQuestion`, or `ask_user` with type `choice`):

```
✅ Ticket brief saved → `<returned-path>`

What would you like to do next?

1) Clarify     — Resolve unknowns in the ACs first (/clarify)
2) Plan        — Start /plan with this ticket
3) Done        — No further action
4) Custom      — Something else
```

Recommend **Clarify** when the ACs have unknowns, silent cases, or ambiguous scope; otherwise recommend **Plan**. Mark the recommendation in the menu.

**On user selection:**

- **1 — Clarify:** Invoke `/clarify @<saved-path>`.
- **2 — Plan:** Invoke `/plan @<saved-path>`.
- **3 — Done:** Output `Ticket saved. No further action.` and stop.
- **4 — Custom:** The user types their request. Treat it as continuing the conversation — brainstorm the approach, ask questions about the ticket, or anything else they need.
