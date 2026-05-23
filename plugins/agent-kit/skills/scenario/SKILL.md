---
name: scenario
description: 'Stress-test a feature or plan for high-risk scenarios, missing decisions, and edge cases.'
version: 2.0.0
providers:
  claude:
    effort: medium
---

# Scenario

**Input:** $ARGUMENTS

---

## Core Thesis

A scenario is a concrete behavior example that makes risk discussable.

This skill is not an edge-case generator. It is a workflow router: it turns vague risk into specific examples, then decides whether each example needs a business decision, architecture work, test proof, review attention, or no action.

Good scenarios have this shape:

```text
Given [relevant state or constraint], when [one actor/system event], then [observable outcome or unresolved question].
```

Use domain language, not implementation steps. If the scenario wording would change just because the UI, database, or method names changed, it is too procedural.

## Position in AgentKit

`scenario` is an optional lens that can run before or between existing artifacts:

```text
raw idea / ticket / Design Brief / Clarification Brief
        -> scenario
        -> clarify   (unknown business behavior)
        -> plan      (known behavior, architecture/error handling needed)
        -> test      (known behavior, proof needed)
        -> code-review (implemented behavior, risk to inspect)
```

It does not replace `brainstorm`, `clarify`, `plan`, `test`, or `code-review`.

- Use `brainstorm` when the problem framing or solution approach is still unsettled.
- Use `clarify` when the answer is a business decision the user or stakeholder must make.
- Use `plan` when behavior is known and the implementation blueprint must account for it.
- Use `test` when behavior is known and should be proven.
- Use `code-review` when a diff exists and the scenario becomes an inspection target.

## User Entry Points

Support these natural requests:

- `/scenario "User can invite team members by email"`
- `/scenario @design-brief.md find planning risks`
- `/scenario @clarification-brief.md find missing seams before plan`
- `/scenario @plan.md identify scenarios that need tests or review`
- `/scenario @diff.md @ticket.md focus review on risky behavior`

If the user gives no anchor, ask for one concrete feature, AC, artifact, or diff. Do not produce generic lists.

## Prompt Contract

Use this contract to keep the skill predictable:

- **Context gathering:** read the supplied artifact first, then only directly referenced ACs, scenarios, plan sections, diff hunks, or nearby code needed to understand the anchor. Stop once you can name the actor, trigger, state, promised behavior, and likely downstream owner.
- **Early stop:** do not keep searching for more scenarios after the top candidates converge on the same risk surfaces. Prefer writing a small high-signal Scenario Brief over expanding the list.
- **Escalate once:** if artifact claims conflict or the anchor is fuzzy, perform one focused clarification pass against the source artifact. If still unresolved, mark the affected rows `clarify`; do not invent the missing business rule.
- **Safe vs unsafe autonomy:** generate and filter scenarios autonomously. Ask the user only when there is no anchor, or when a business decision blocks the next skill.
- **Instruction conflicts:** when two artifacts disagree, preserve both facts in `Why It Matters` and route to `clarify` or `plan`; do not silently reconcile them.
- **Completion:** finish only when every surviving scenario has an owner, handoff payload, and recommended next step.

## Workflow

### Phase 1: Anchor & Mode

Classify the input before generating scenarios:

| Input | Mode | Primary Output |
|---|---|---|
| Raw idea or ticket | discovery | risks, missing decisions, likely AC gaps |
| Design Brief | pre-plan | gaps in edge cases, flow seams, planning risks |
| Clarification Brief | pre-plan | unresolved seams, defaults that need plan attention |
| Plan / blueprint | pre-code | missing behavior contracts, test/review targets |
| Diff / implementation | pre-review | concrete inspection scenarios |
| Investigation Report | regression | recurrence scenarios and prevention targets |

Extract the anchor as:

- **Actor/consumer:** user, service, scheduled job, webhook sender, admin, attacker, etc.
- **Trigger:** one action or event.
- **State/constraint:** role, status, permissions, existing data, feature flag, dependency health, concurrency, or boundary condition.
- **Promised behavior:** AC, Design Brief scope item, clarified resolution, plan contract, or observed current behavior.

If an input artifact already contains scenarios, preserve them as source context. Do not re-ask or re-label them unless they are ambiguous or contradict a later artifact.

### Phase 2: Build the Event Frame

Think in events, not components:

```text
Before state -> trigger/event -> domain outcome -> downstream reaction
```

Use this frame to look for risk surfaces:

- state transition: status, lifecycle, permissions, ownership, inventory, balances
- trust boundary: external API, webhook, upload, LLM output, user input, auth
- dependency failure: timeout, partial success, retry, duplicate delivery, stale cache
- concurrency: two actors/jobs/events act on the same state
- policy conflict: two business rules could both apply or disagree
- downstream consumer: another rule, notification, report, UI, or integration reads the output
- abuse/misuse: a user or attacker bypasses an expected protective measure

Generate candidates privately. Output only candidates tied to the anchor.

### Phase 3: Scenario Quality Gate

A scenario survives only if it passes all gates:

- **Concrete:** names the actor, trigger, relevant state, and expected outcome or question.
- **Single-behavior:** one meaningful trigger; split scenarios with multiple triggers or unrelated outcomes.
- **Observable:** outcome can be seen by a user, downstream system, emitted event, error, permission result, or persisted business state.
- **Decision-forcing:** changes what another skill should do.
- **Plausible:** supported by the artifact, codebase, domain, or common failure mechanics for that boundary.
- **Non-duplicative:** not already resolved by a stronger artifact or covered by a better scenario.

Reject scenarios that are generic slop: timezone, unicode, SQL injection, 1M rows, mobile viewport, concurrency, or malicious input listed without a reason the anchor makes them real.

### Phase 4: Ownership Routing

Assign one primary owner and optional secondary owners:

- **clarify** — expected business behavior is unknown or policy conflicts.
- **plan** — behavior is known, but architecture, state transition, rollback, idempotency, or error handling must be designed.
- **test** — behavior is known and needs proof.
- **code-review** — implementation exists and the scenario should guide inspection.
- **ignore** — plausible, but low impact or already covered.

Ownership is a data-flow decision, not a label. For each non-ignore row, write the exact handoff payload another skill can consume.

### Phase 5: Write the Scenario Brief

Create a portable artifact. If this is meant to feed another AgentKit skill, call `kit_save_handoff(type: "scenario", slug: <feature-slug>, files: { "index.md": <full markdown> })`.

````markdown
## Scenario Brief: [Feature / Artifact Name]

> **Status:** READY | NEEDS_CLARIFY | MIXED | NO_ACTION
> **Mode:** discovery | pre-plan | pre-code | pre-review | regression
> **Source:** [raw request / ticket / artifact path / diff pointer]
> **Created:** [date]

---

### 1. Anchor

- **Actor / Consumer:** [...]
- **Trigger:** [...]
- **State / Constraint:** [...]
- **Promised Behavior:** [...]

### 2. Scenario Map

| ID | Scenario | Why It Matters | Owner | Handoff |
|---|---|---|---|---|
| S1 | Given ..., when ..., then ... | [risk / missing contract / failure mode] | clarify / plan / test / code-review / ignore | [question, plan requirement, proof obligation, or review focus] |

### 3. Downstream Blocks

#### For Clarify
- [S#] [business question in user-facing terms]

#### For Plan
- [S#] Account for [state/error/integration/concurrency] by designing [constraint], with expected behavior [outcome].

#### For Test
- [S#] Proof obligation: Given ..., when ..., then ...

#### For Code Review
- [S#] Inspect whether the diff handles [scenario], especially [consumer/state/trust boundary].

### 4. Rejected Scenarios

- [candidate] — rejected because [generic / already covered / not plausible / not actionable]

### 5. Recommended Next Step

- **run-clarify** — unresolved business questions block plan.
- **run-plan** — scenarios are known risks that should become blueprint tasks/contracts.
- **run-test** — scenarios are proof obligations for existing behavior.
- **run-code-review** — scenarios should guide review of an existing diff.
- **done** — no action-worthy scenarios found.
````

## Agent Thinking Rules

- Start from the user's workflow need: are they trying to discover gaps, prepare planning, harden tests, or focus review?
- Keep context moving forward. A scenario with owner `clarify` becomes a question; owner `plan` becomes a design constraint; owner `test` becomes a proof obligation; owner `code-review` becomes an inspection target.
- Prefer a few high-signal scenarios over completeness. Three scenarios that change downstream behavior are better than fifteen that only sound thorough.
- Do not bury uncertainty. If expected behavior is unknown, mark it `clarify`; do not invent the answer.
- Do not turn technical implementation details into business scenarios unless the detail is the contract surface, such as an API schema, event payload, permission check, or persistence guarantee.
- Use Markdown only where it carries structure: tables for scenario maps, bullets for downstream blocks, code fences for scenario templates.
