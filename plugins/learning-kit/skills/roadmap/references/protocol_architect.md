---
name: protocol_architect
description: 'Final Scaffolding Protocol: Guidelines for sequencing topics, calculating project timelines, and establishing the navigation framework for the final Roadmap.'
version: 4.0.0
---

# Protocol: Final Scaffolding & Roadmap Architecture

This protocol governs the "Scaffolding" phase. Its goal is to transform isolated **Mastery Stacks** into a structured, time-bound, and measurable navigation guide aligned with the user's **Success Metric**.

---

## Step 1: Dependency Mapping & Sequencing

**Action:** Analyze the `dependencies` and `difficulty` ratings of all Mastery Stacks to determine the optimal learning path.

1.  **The Critical Path**: Identify the linear sequence of "Hard Dependencies" that must be followed to reach the Success Metric.
2.  **Difficulty Progression Curve**: Arrange topics to move from Low Difficulty (Axioms) to High Difficulty (Expert Troubleshooting).
3.  **Phase Clustering**:
    - **Phase 1 (Foundations)**: Core Axioms and basic definitions.
    - **Phase 2 (Operations)**: Practical workflows and tool usage.
    - **Phase 3 (Mastery)**: Advanced failure modes and optimization.

---

## Step 2: Temporal Alignment & Budgeting

**Action:** Compare the total `estimatedTime` against the user's `timeBudget`.

1.  **Total Commitment Calculation**: Sum the reading, practice, and audit times for all Core Topics.
2.  **Budget Reconciliation**:
    - If over budget: Move the lowest-priority Core Topics to the **Expansion Topics** section.
    - If on budget: Distribute time across weeks/days based on the user's weekly commitment.

---

## Step 3: Checkpoint & Milestone Design

**Action:** Establish concrete, binary **Pass/Fail Milestones** for each phase.

1.  **Phase Milestones**: Define a "Final Exam" for each phase that requires combining knowledge from all topics within that phase.
2.  **Pass/Fail Criteria**: Criteria must be objective and measurable (e.g., "Correctly identify 3 out of 3 failure causes" or "Perform the assembly in under 20 minutes").

---

## Step 4: Scope Boundary Documentation

**Action:** Clearly define what the learner should NOT focus on.

1.  **Explicit Exclusions**: List items from the `intent.excluded` list and any topics demoted to "Expansion" due to time constraints.
2.  **Focus Protection**: Explain why these items are excluded (e.g., "Exceeds depth requirements for Level 2 Competency").

---

## Step 5: Mastery Log Structure

**Action:** Create a template for the learner to track their progress and success.

1.  **Navigation Table**: A list of topics with "Status," "Pass/Fail Date," and "Time Spent" columns.
2.  **Reflection Hooks**: Brief questions to confirm the "Success Metric" is being approached.

---

## Final Roadmap Mandatory Structure

The Architect must output the file to `output/roadmaps/[slug]_Roadmap.md` using this format:

# 🧭 Deep Roadmap: [Subject]

**Target Depth**: [Level] | **Success Metric**: [Goal] | **Estimated Total Time**: [Hours]

---

## 1. Project Navigation Map

> "Mastery is a journey, not a list. Follow the sequence below."

- [Visual/Textual Flow of Dependencies]

---

## 2. Phase Timelines & Milestones

### Phase 1: [Name]

- **Time**: [X] Hours | **Difficulty**: [X/10]
- **Checkpoint**: [Pass/Fail Task]

### Phase 2: [Name]

- **Time**: [Y] Hours | **Difficulty**: [Y/10]
- **Checkpoint**: [Pass/Fail Task]

---

## 3. The Journey (Mastery Stacks)

[Insert each Topic's Mastery Stack here, sorted by dependency.]

---

## 4. Expansion Horizon (Optional)

- [List of non-critical topics for further study.]

---

## 5. Scope Boundary

- [List of excluded topics/concepts.]

---

## 6. Mastery Log

[Insert Tracking Table]

---

## Critical Constraints

- **ZERO SYLLABUS BLOAT**: If it doesn't serve the Success Metric, it must be removed or demoted.
- **BINARY FEEDBACK**: Every checkpoint must be objectively measurable.
- **TIME REALISM**: Ensure the schedule is physically possible within the user's constraints.
