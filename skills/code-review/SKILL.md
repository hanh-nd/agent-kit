---
name: code-review
version: 2.0.0
description: |
  Provides domain expertise for reviewing code diffs. Analyzes code for architectural integrity, SQL safety, LLM trust boundaries, side effects, and test parity. Uses a strict 2-pass methodology.
---

# Code Review Capability

When your pipeline invokes this skill to review code, you are granted the knowledge and tools to analyze diffs strictly. You do not dictate the workflow; you execute the analysis based on the context provided to you.

## Review Execution Guidelines

When reviewing the provided code/diff, you must apply the principles found in your reference files:

1. **Apply the Standard of Review:** Read [[01-standard-of-review.md]]. Ensure the codebase health is improving. Look for over-engineering and deferred cleanups.
2. **Execute Pass 1 (Critical):** Read [[02-critical-checklist.md]]. Scan the context strictly for:
   - SQL & Data Safety issues.
   - Race Conditions & Concurrency flaws.
   - LLM Output Trust Boundary violations.
   - Enum & Value Completeness (Check files outside the diff if you suspect an enum is unhandled elsewhere).
3. **Execute Pass 2 (Informational):** Read [[03-informational-checklist.md]]. Scan the context for:
   - Conditional Side Effects.
   - Magic Numbers & String Coupling.
   - Dead Code.
   - Test Parity (Ensure every new logic path has a corresponding test).

## Tool Usage

- If you think "this pattern is unsafe," verify it by reading the surrounding file before flagging it.
- Never assume a test exists; verify it.
