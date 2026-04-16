---
name: protocol_extraction
description: 'Iterative Evidence Mapping: A 3-phase extraction protocol for persona agents to ensure research is intent-aligned, deeply grounded, and evidence-backed.'
version: 4.0.0
---

# Protocol: Iterative Evidence Mapping

This protocol governs the research and extraction phase. It ensures that persona agents do not just "summarize" but "excavate" evidence that directly serves the user's **Success Metric** and **Target Depth**.

---

## Step 1: Intent-Filtered Indexing (The Wide Net)

**Action:** Perform a broad sweep of the NotebookLM (RAG) to identify all relevant mentions of the assigned **Topic**.

1.  **Relevance Filter**: Discard any information that falls outside the **Scope Boundary** or does not contribute to the **Success Metric**.
2.  **Depth Calibration**:
    - If `depth == Level 1`: Look for definitions, analogies, and system overviews.
    - If `depth == Level 2`: Look for standard procedures, component relationships, and rules.
    - If `depth == Level 3`: Look for physics, math, edge cases, and contradictions.
3.  **Output**: A list of "Evidence Claims" with source markers.

---

## Step 2: Surgical Deep Dive (The Core Evidence)

**Action:** Select the top 3-5 high-leverage claims from Step 1 and perform a deep interrogation.

1.  **The "Why" Hook (Theorist)**: Ask the RAG: "What is the underlying logic or axiom that makes Claim X true?"
2.  **The "How" Hook (Practitioner)**: Ask the RAG: "What are the exact tools, values (torque, voltage, temperature), and sequences required to execute Claim X?"
3.  **The "Risk" Hook (Auditor)**: Ask the RAG: "Under what specific conditions does Claim X fail, and what information is missing to prevent this failure?"
4.  **Citation Lock**: Every detail extracted must be accompanied by a `[Source: Page/Section]`.

---

## Step 3: Evidence Triangulation & Reporting

**Action:** Format the extracted data into a structured report for the Synthesizer.

1.  **The Logic-Action-Risk Chain**: Map how the theory (Logic) enables the task (Action) and where it breaks (Risk).
2.  **Dependency Marking**: Explicitly flag if the RAG suggests this topic requires prior knowledge of another concept.
3.  **Gap Flagging**: Use the `[NEW TOPIC CANDIDATE]` tag for any concept mentioned in the RAG that is essential but not explained.

---

## Final Report Mandatory Structure

Persona agents must output their reports using the following sections:

1.  **Executive Summary**: (2 sentences on relevance to Success Metric).
2.  **Evidence Clusters**:
    - **Cluster 1**: [Heading]
    - **Evidence**: [Grounded Detail]
    - **Citation**: [Source: Page]
3.  **Technical Constraints**: (Values, metrics, specific tools).
4.  **Adversarial Gaps**: (Contradictions or missing info).
5.  **Recursive Discovery**: (Any `[NEW TOPIC CANDIDATE]` tags).

---

## Critical Constraints

- **NO EXTERNAL KNOWLEDGE**: Agents are forbidden from using data outside the RAG. If the RAG is silent, the report must state "NO DATA FOUND."
- **INTENT ADHERENCE**: If the user intent is "Familiarity," do not provide Level 3 technical specifications.
- **CITATION INTEGRITY**: Reports without specific page/section citations will be rejected by the Orchestrator.
