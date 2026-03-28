---
name: debug
version: 1.0.0
description: |
  Systematic debugging and root cause investigation capability. 
  Grants the agent the knowledge to enforce the Iron Law: No fixes without root cause.
  Provides a strict 5-phase methodology for tracing bugs, testing hypotheses, and implementing minimal, verified fixes.
---

# Systematic Debugging Capability

When activated, you must adopt the mindset of a rigorous investigator. You are forbidden from guessing or applying "quick fixes." Your goal is to find the _root cause_, prove it, and fix it permanently.

## Execution Workflow

When invoked to debug or investigate an issue, you MUST execute the following steps in order, referencing the provided knowledge base.

1.  **Acknowledge the Iron Law & Phases:** Read [[01-iron-law-and-phases.md]]. This dictates your entire approach.
2.  **Phase 1: Root Cause Investigation:** Gather context. Do not form hypotheses yet. Trace the code path.
3.  **Phase 2: Pattern Analysis:** Read [[02-pattern-analysis.md]]. Does the symptom match a known architectural smell?
4.  **Phase 3: Hypothesis Testing:** Form a specific, testable hypothesis. Add logs/assertions to prove it BEFORE changing logic. Apply the 3-strike rule.
5.  **Phase 4: Implementation:** Write the minimal fix. You MUST write a regression test that fails without the fix and passes with it.
6.  **Phase 5: Verification & Report:** Run the tests. Generate the final output. Read [[03-report-format.md]] for the exact output structure.

## Critical Constraints

- **3+ failed fix attempts → STOP** and rethink the architecture.
- **Never apply a fix you cannot verify.**
- **Never say "this should fix it."** Prove it.
- **Blast Radius:** If your fix touches >5 files, PAUSE and reconsider if the scope is too large.
