# Saturation Pressure Scenarios

Optional reference for refining brainstorm behavior when a conversation risks converging too early. The required rules live in `SKILL.md`; this file only gives examples of how those rules fail under pressure.

## Core Failure

The agent answers the user's latest concern, gets agreement on that concern, and treats it as full consensus. This creates polished Design Briefs with missing product flow, current-state transition, trust boundaries, failure behavior, or scope decisions.

## Correct Instinct

The user owns final choices. The brainstormer owns the decision surface. Rough ideas are allowed during exploration; rough Design Briefs are not.

After resolving a narrow concern, ask internally:

- What did this settle?
- What does it newly expose?
- Which open decision can still change approach, scope, flow, risk, trust, or success?

Then say the zoom-out explicitly when needed:

> "This settles [narrow decision]. I am not ready to save the brief because [open strategic decisions] can still change the shape."

## Strategic Ledger Example

```text
Stable decisions:
- Canonical state is agreed.
- Conflict policy is agreed.

Open strategic decisions:
- First-run setup flow.
- Trigger model: manual, automatic, scheduled, or hybrid.
- Privacy/security posture.
- Conflict visibility and user-facing recovery.

Deferred to planning:
- Exact SDK/library.
- Exact schema field names.
- Test harness implementation details.

Exploratory ideas:
- Filesystem-only adapter for tests, not a product wedge.
- Background automation, not approved until trigger model is decided.

Risks / pushbacks:
- Shared state may expose sensitive content.
- Provider/pricing claims are time-sensitive.
- Hidden automation can hide failures.
```

## Idea Stages

| Stage | Allowed quality | Promotion rule |
|---|---|---|
| Exploratory | Incomplete, flawed, provocative, or partially wrong | Useful if it sharpens the frame |
| Candidate | Coherent, trade-offs named, core pain preserved | Recommend only if it actually solves the stated problem |
| Approved | User agreed and strategic gaps resolved/deferred | May enter the Design Brief |

Do not punish the brainstormer for imperfect exploratory ideas. Do punish it for promoting an invalid wedge or saving unvalidated strategy.

## Representative Scenario

User asks for sync across devices. Agent initially frames local freshness, then user clarifies multi-device fragmentation. Agent recommends syncing source records. User challenges deduplication and linked artifacts. Agent answers those points and user says "ok A sounds good."

Bad stop:

- Save the Design Brief immediately.

Good stop:

- Acknowledge the narrow decision that is now settled.
- Refuse to save yet because setup flow, trigger model, current-state import, provider boundary, sharing/trust model, privacy, conflict visibility, and failure behavior can still change the design.
- Ask the next highest-leverage question, usually grouped when the user is giving rich context.

## General Pressure Scenarios

### Invalid Wedge

Problem: users need state shared across environments.

Bad wedge:

- Local-only storage because it is easiest to implement.

Correction:

- Local-only may be a test adapter, but the product wedge must include the smallest real shared path or it does not solve the pain.

### Existing-State Gap

Problem: users already have fragmented state.

Bad stop:

- Design only future capture/sync.

Correction:

- Decide whether existing local state is imported, ignored, manually migrated, or explicitly out of scope.

### Artifact Smuggling

Problem: user approved the high-level approach but never chose how the behavior is triggered.

Bad artifact:

- DETAIL quietly adds automatic hooks, background jobs, or setup behavior.

Correction:

- Ask before saving, exclude from scope, or put under "Decide before implementing."

## Relationship to Sequential Thinking

Use the idea, not the ceremony. Do not print `Thought 1/N` unless the user asks for visible reasoning.

Apply these internal moves:

- **Revision:** update the problem frame when the user clarifies.
- **Branching:** compare 2-3 solution families before convergence.
- **Scope expansion:** when a narrow issue reveals a bigger surface, deepen instead of saving.
- **Final readiness:** finish only when open strategic decisions are resolved, deferred, or irrelevant.

## Blind Spots to Watch

| Blind spot | Symptom | Correction |
|---|---|---|
| Latest-objection capture | Conversation only discusses the user's last concern. | Resolve it, then zoom out. |
| Premature consensus | User agrees to an option and the agent saves immediately. | Run the saturation gate first. |
| Invalid wedge | Proposed v1 is testable but does not solve the user's pain. | Relabel as scaffold or choose a pain-preserving wedge. |
| Artifact smuggling | README/DETAIL contains product behavior not agreed in chat. | Ask, exclude, or mark "Decide before implementing." |
| Planning leakage | Agent asks implementation mechanics during brainstorm. | Defer if it does not change recommendation. |
| Over-questioning | Agent asks every possible question. | Ask only the next question that changes strategy. |
| Hidden trust boundary | Remote or shared state is designed without privacy decisions. | Treat privacy as strategic, not implementation detail. |
