# Brainstorming Lenses

Use these as internal thinking lenses, not rituals. Pick the lightest lens that resolves the current uncertainty. Do not run all lenses in sequence. Do not announce the technique unless it helps the user understand the process.

The agent's role is the one defined in the main brainstorm skill: independent problem-solver, not facilitator. A lens is useful only when it helps ground a hypothesis, challenge a weak frame, or unlock the next decision.

## Lens Router

| Current uncertainty | Use | Ask for | Stop when |
|---|---|---|---|
| Symptom is clear but cause is not | 5 Whys | cause chain | root cause is plausible enough to frame |
| Requirements or unknowns are broad | Starbursting | who / what / where / when / why / how unknowns | priority questions are identified |
| Need solution variety | SCAMPER | substitutions, combinations, adaptations, eliminations, reversals | 2-3 meaningfully different directions exist |
| Ideas are scattered | Mind Mapping | themes, relationships, buckets | structure is clear enough to compare options |
| Failure modes are unclear | Reverse Brainstorming | ways the idea could fail | top failure modes and mitigations are known |
| Decision needs balanced judgment | Six Thinking Hats | facts, upside, downside, alternatives, intuition, synthesis | the trade-off is explicit enough to recommend |
| Strategic position is unclear | SWOT | internal strengths/weaknesses and external opportunities/threats | the position changes the recommendation, or does not |
| Recommendation feels plausible but readiness is unclear | Saturation sweep | flow, scope, state, current-state transition, trust, privacy, wedge, overbuild | open strategic decisions are resolved, explicitly out, or safely deferred |

## Question Rule

Every question must have a job:

- Protect the problem frame.
- Choose between solution families.
- Expose a constraint.
- Test a risky assumption.
- Decide what belongs in scope.
- Decide what planning must verify or what the user explicitly defers.

If the answer will not change one of those decisions, do not ask it.

## 5 Whys

Use when the user presents a symptom and the real cause is unclear.

Pattern:

1. State the symptom.
2. Ask why it happens.
3. Use the answer as the next why.
4. Stop before it becomes speculative.

Good stop condition:

- You can state the root cause as a plausible problem frame.
- Further "why" questions would require evidence you do not have.

Do not use when:

- The problem has many interacting causes and the conversation needs breadth first.
- The cause is already known.

## Starbursting

Use when the space is broad and you need to reveal key unknowns before choosing a direction.

Prompts:

- Who is affected, involved, approving, opposing, or operating this?
- What problem, goal, feature, resource, risk, or alternative matters?
- Where does this happen, integrate, live, or fail?
- When is timing, deadline, trigger, sequence, or dependency important?
- Why now, why this problem, why users care, why this approach?
- How will it work, be measured, supported, scaled, or maintained?

Good stop condition:

- You have identified the few priority questions that block recommendation.
- The rest can move to planning verification or explicit deferral.

Do not use as a full questionnaire. Generate the map mentally, then ask only the highest-leverage question.

## SCAMPER

Use when the problem is framed but the solution space is too narrow.

Prompts:

- Substitute: what can be swapped?
- Combine: what can be merged?
- Adapt: what can be borrowed from another domain?
- Modify / magnify / minify: what can change in size, scope, frequency, or intensity?
- Put to other uses: who else could use this, or where else could it apply?
- Eliminate: what can be removed?
- Reverse / rearrange: what can be flipped or reordered?

Good stop condition:

- You have 2-3 solution families that are meaningfully different.
- One is close to the narrowest pain-solving wedge and one preserves part of the ambitious vision.

Do not use when:

- The problem frame is still unstable.
- You only need to evaluate already-known options.

## Mind Mapping

Use when ideas are scattered and the conversation needs structure.

Pattern:

1. Put the central problem or outcome at the center.
2. Group ideas into major themes.
3. Identify relationships and duplicates.
4. Collapse weak branches.

Good stop condition:

- You can name the major themes and compare them.
- The map reveals which branches are scope, risk, implementation detail, future work, or unapproved strategy.

Do not use when:

- You need fresh ideas first.
- The decision is already clear.

## Reverse Brainstorming

Use when the current recommendation sounds plausible but risk is underexplored.

Prompt:

- "How could we make this fail?"

Convert failures into mitigations:

- failure mode -> prevention or detection -> Design Brief risk / planning verification / explicit deferral

Good stop condition:

- The top failure modes are known.
- Each critical/high risk has either a mitigation, an explicit trade-off, or a planning verification item.

Do not use when:

- The session is still trying to generate possibilities and criticism would shut down useful exploration.
- The user is not yet aligned that the critique is cooperative.

## Six Thinking Hats

Use when the decision is important and one perspective is dominating.

Hats:

- Blue: what decision are we making and how will we decide?
- White: what facts do we know or lack?
- Green: what alternatives exist?
- Yellow: why could this work?
- Black: why could this fail?
- Red: what does intuition say?

Good stop condition:

- The trade-off is explicit enough to make a recommendation.
- Any missing facts are recorded as verification items or explicit deferrals.

Do not use as a full formal sequence unless the decision is high-stakes. Usually one or two hats are enough.

## SWOT

Use when the topic is strategic positioning, market entry, competitive posture, or timing.

Quadrants:

- Strengths: internal advantages.
- Weaknesses: internal constraints.
- Opportunities: external openings.
- Threats: external risks.

Good stop condition:

- The strategic position changes the recommendation, or you can say it does not.

Do not use for tactical product details or obvious implementation choices.

## Decision-Framed Asking

Bad:

> "Why now? Who is affected? What does solved look like?"

Better:

> "I need to protect the problem frame before recommending approaches: is the real goal user adoption, operational efficiency, or technical simplification? Each points to a different solution family."

Bad:

> "Let's do 5 Whys."

Better:

> "The feature request sounds like a symptom. Before we ideate, what is the failure you are actually seeing today?"

Bad:

> "What are all the risks?"

Better:

> "The leading approach fails if migration risk is higher than user value. Is backward compatibility a hard requirement or a preference?"
