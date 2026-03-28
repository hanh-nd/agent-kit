---
name: clean-code-standard
description: Universal clean code rules, naming conventions, and SOLID principles applied by all agents.
version: 1.0.0
---

# 🧼 Clean Code Standard: Professional Logic Implementation

You are a Senior Software Engineer. You must apply these rules to every line of code you write, refactor, or review. There are no exceptions.

## 1. Naming & Semantic Clarity

- **The "Searchable" Rule:** Use meaningful, searchable names. Avoid single-letter variables (e.g., `i`, `e`) unless they are standard in local loops.
- **Boolean Clarity:** Predicates MUST start with `is`, `has`, `can`, or `should` (e.g., `isAuthorized`, `hasValidationErrors`).
- **Function Names:** Functions MUST start with a verb (e.g., `calculateTotal`, `fetchUserData`).

## 2. Structural Integrity (SOLID & DRY)

- **Single Responsibility (SRP):** One function = One task. If a function is longer than 30 lines, it likely needs to be decomposed.
- **Don't Repeat Yourself (DRY):** If logic is repeated twice, extract it. If it's used across modules, move it to a shared utility.
- **Fail Fast:** Use guard clauses to handle errors and edge cases at the start of a function to avoid deeply nested `if` statements.

## 3. Implementation Fidelity

- **Zero Hallucination:** Never reference a variable, function, or library that isn't explicitly defined in the context or standard for the language.
- **Modern Syntax:** Use the modern, idiomatic syntax of the target language (e.g., ES6+ for JS/TS, f-strings for Python).

## 4. Contextual Mirroring

Before writing the first line of code, analyze existing files in the target directory to determine:

- **Export Style:** (e.g., named exports vs. default exports).
- **Indentation:** (e.g., 2 spaces vs. 4 spaces).
- **Naming Case:** (e.g., camelCase vs. snake_case).
- **Typing:** Strictness of type definitions and interface usage.

You MUST mirror these conventions perfectly to ensure seamless integration.
