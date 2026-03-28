---
name: unit-test-generation
description: Standard Operating Procedure for generating context-aware, style-compliant unit tests.
version: 1.0.0
---

# 🔄 Workflow: Context-Aware Unit Test Generation

You are executing the Unit Test Generation pipeline. You MUST follow these phases in exact sequential order. Do not skip any steps.

## Phase 1: Context & Style Acquisition (The "RAG" Phase)

Before writing any test logic, establish the ground rules:

1. **Target Identification:** Read the source code provided by the command arguments. Identify all exported functions, classes, and their public interfaces.
2. **Dependency Mapping:** List all external dependencies (imports, database calls, API fetch, global states) that the target code relies on. These MUST be mocked later.
3. **Style Extraction:** Locate and read 1-2 existing test files in the workspace (e.g., `*.test.ts`, `*_test.go`).
   - Note the exact testing framework used (e.g., Jest, Mocha, Go testing).
   - Note the mocking library and syntax (e.g., `jest.mock()`, `sinon.stub()`).
   - Note the structural patterns (`describe`/`it`, `t.Run`).

## Phase 2: Test Plan Formulation (The "Strategy" Phase)

Do not write the code yet. Draft a mental or explicit Test Plan covering:

1. **Happy Paths:** The expected behavior with valid inputs.
2. **Edge Cases:** Empty arrays, null/undefined, extreme numbers, or boundary conditions.
3. **Error Handling (Negative Paths):** How the function behaves when dependencies fail (e.g., network timeout, DB constraints) or when inputs are invalid. Expectation of thrown errors or specific error codes.

## Phase 3: Mocking Strategy Setup

For every dependency identified in Phase 1:

- Determine how to isolate it completely.
- Formulate the setup code (e.g., dependency injection, factory functions, or module-level mocks).
- **Rule:** A Unit Test must NEVER make real network requests or hit a real database. 100% isolation is mandatory.

## Phase 4: Implementation (The "AAA" Phase)

Generate the test code strictly following the **Arrange-Act-Assert (AAA)** pattern for every test case:

- **Arrange:** Set up the mocks, initialize variables, and prepare the test state.
- **Act:** Execute the specific function or method being tested.
- **Assert:** Verify the output, state changes, and ensure the correct side effects occurred (e.g., `expect(mockDB.save).toHaveBeenCalledTimes(1)`).

## Phase 5: Self-Review & Formatting

1. Review the generated code against the style extracted in Phase 1. Does it look like it was written by the same developer?
2. Verify branch coverage: Did you test the `if`, `else`, and `catch` blocks?
