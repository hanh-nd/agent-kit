---
name: protocol_synthesis
description: 'Mastery Fusion Protocol: Guidelines for reconciling adversarial reports, quantifying learning metrics (time/difficulty), and defining binary pass/fail criteria.'
version: 4.0.0
---

# Protocol: Mastery Fusion & Topic Synthesis

This protocol governs the "Synthesis" phase. Its goal is to perform a lossless, intent-aware compression of three adversarial perspectives into a singular **Mastery Stack**.

---

## Step 1: Adversarial Triangulation (The Clash)

**Action:** Load the `theorist`, `practitioner`, and `auditor` reports for a specific topic and identify the points of friction.

1.  **The Logic-Action Bridge**: How does the Theorist’s axiom specifically enable the Practitioner’s workflow?
2.  **The Risk Stress-Test**: How do the Auditor’s failure modes invalidate the "Ideal State" described by the other two?
3.  **Conflict Resolution**: Identify where sources in the RAG disagree on values or steps. Highlight these as "Critical Expert Insights."

---

## Step 2: Intent-Aware Quantification

**Action:** Based on the evidence density and user's `intent` matrix, calculate the navigation metrics.

1.  **Time Estimation**:
    - _Reading_: Estimate minutes based on the length of cited RAG sections.
    - _Practice_: Estimate minutes based on the complexity of the Operational Drill.
    - _Audit_: Assign 15-30% of total time for reviewing failure modes.
2.  **Difficulty Rating (1-10)**:
    - 1-3: Conceptual/Familiarity.
    - 4-7: Operational/Competency.
    - 8-10: Expert/Mastery (Physics-level or High-Stakes Troubleshooting).

---

## Step 3: Mapping Dependencies & Scopes

**Action:** Define the boundaries and connections for this specific block of knowledge.

1.  **Hard Dependencies**: Identify if this topic is a "Blocker" for others. (e.g., Topic A must be mastered before Topic B).
2.  **Scope Boundary Enforcement**: Based on the `intent.excluded` list and `targetDepth`, explicitly state what is NOT included in this stack to prevent scope creep.

---

## Step 4: Constructing the Feedback Loop (Checkpoints)

**Action:** Formulate the binary feedback mechanism that replaces vague "understanding."

1.  **Logic Check (The Why)**:
    - **Task**: A deep-reasoning question.
    - **Pass Criteria**: The specific axiom or link the user must mention to succeed.
2.  **Operational Drill (The How)**:
    - **Task**: A hands-on or simulation task.
    - **Pass Criteria**: Specific output, value, or sequence that must be achieved.
3.  **Diagnostic Challenge (The What If)**:
    - **Task**: A failure scenario based on the Auditor’s report.
    - **Pass Criteria**: Correct identification of the root cause using the Logic Check.

---

## Mandatory Mastery Stack Structure

The output must be saved to `output/state/[slug]/mastery_stacks/[topic].md` using this format:

### [Topic Name]

```json
{
  "meta": {
    "difficulty": "X/10",
    "estTime": "XX mins",
    "priority": "Core/Expansion",
    "dependencies": ["Topic IDs"]
  }
}
```

1.  **Learning Objectives**: (S.M.A.R.T format).
2.  **The Essence**: (Distilled meaning).
3.  **The Knowledge Pillars**:
    - **Logic**: (Distilled axioms).
    - **Operation**: (Specific workflow & tools).
    - **Diagnosis**: (Critical failure modes).
4.  **Checkpoint: The Final Exam**:
    - **Task**: [Detailed inquiry/drill].
    - **Pass/Fail Criteria**: [Specific, measurable requirement].
5.  **Reading List**: (Specific citations and page numbers).

---

## Critical Constraints

- **NO PARTIAL CREDIT**: Pass/Fail criteria must be objective.
- **TIME REALISM**: If a topic takes 4 hours but the user has a 2-hour budget, the Synthesizer must flag this to the Re-Planner.
- **CITATION PRESERVATION**: Never lose the link back to the RAG.
