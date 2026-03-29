---
name: coding-common
description: |
  Master skill for enforcing clean code standards, project conventions, and unit testing protocols.
version: 1.0.0
---

# 💻 Skill: Coding Common Standards

## 🚦 Mandatory Bootstrapping

You have ingested the target source code. Before implementing changes, you MUST load the specific evaluation constraints and implementation rules based on the environment scoring and your mission.

### 1. Mandatory Clean Code Enforcement

**Always Read:**

- [[01-clean-code-standard.md]]
- [[02-refactoring-standard.md]]

- Focus: Naming conventions, architectural patterns (SOLID/DRY), and local style mirroring.
- Action: You are required to refactor any existing "bad code" encountered in the files you are modifying.

### 2. Conditional Unit Testing Protocol

**Action:** Decide whether to create unit tests

- Read `.agent-kit/stats.json` to get the `hasUnitTests`.
- If `hasUnitTests` is `true`, You MUST load the `unit-testing` skill.
- Else, skip this phase.

- Focus: Test coverage, edge case validation, and matching existing testing frameworks (Jest, Vitest, Mocha, etc.).

## 🛠️ Global Execution Constraints

1. **Zero Hallucination:** If you cannot find a required dependency or function, you MUST report a "Logic Gap" instead of guessing.
2. **Actionability:** Every implementation must be production-ready. No placeholders.

Do NOT proceed with the implementation until the required sub-documents have been fully internalized.
