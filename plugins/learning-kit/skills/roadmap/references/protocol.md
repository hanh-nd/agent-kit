# Iterative Evidence Mapping Protocol (v1.0)

Follow these steps sequentially to interrogate the NotebookLM for your assigned Topic and Persona.

## Phase 1: Indexing (The "What")
- **Action:** Call `notebook_query` to list every distinct claim, piece of evidence, and technical detail regarding the topic from your persona's perspective.
- **Constraint:** Do not summarize. Provide an exhaustive index.
- **Guardrail (Topic Explosion):** If you detect >10 distinct points, explicitly notify the Orchestrator in your final report that the topic should be split.
- **Guardrail (Material Silence):** If no evidence is found, report "Index Empty" and terminate early.

## Phase 2: Deep Dive (The "Why/How")
- **Action:** Review the Index from Phase 1 in your conversation history.
- **Selection:** Select the items that are most complex, contradictory, or central to the "Seed" material's claims.
- **Interrogation:** For each selected item, call `notebook_query` to extract the underlying logic and evidence.
- **Constraint:** Max 6 queries total for this phase to ensure context focus.

## Phase 3: Gap Audit (The "Missing")
- **Action:** Compare your extracted evidence against the notebook's full scope.
- **Identify:** What is implied but not stated? What is notably *not* mentioned?
- **Recursive Discovery:** If you find a completely new concept (an "Unknown Unknown"), flag it clearly as a "NEW TOPIC CANDIDATE" in your final report.

## Final Report Structure
Return your findings to the Orchestrator using this structure:
1. **Persona Summary**: 1-2 sentences on your overall assessment.
2. **Evidence Index**: The list from Phase 1.
3. **Deep Dive Insights**: Detailed synthesis of the Phase 2 interrogations.
4. **Gaps & Unknowns**: Findings from Phase 3.
5. **New Topic Candidates**: Any "Unknown Unknowns" discovered.
