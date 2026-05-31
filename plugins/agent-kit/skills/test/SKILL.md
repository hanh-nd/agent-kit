---
name: test
description: 'Add or update tests given an existing implementation plan or WBS.'
version: 1.0.0
providers:
  claude:
    effort: medium
---

# Test

**Input:** $ARGUMENTS

---

## Core Thesis

A test is meaningful only if it protects a behavior contract, a failure mode, or a past bug. Coverage is a byproduct, not the goal.

A good unit test is a **behavior sensor**: it should fail only when a meaningful behavior changes, and the failure should point to the broken contract without requiring the reader to mentally execute the implementation.

This skill adds or updates tests. It does not change production behavior except for minimal testability seams that already exist in the plan or Investigation Report.

## Failure Model

Guard against these agent failure modes:

- **Method worship** — writing one test per method instead of one test per behavior.
- **Implementation coupling** — asserting private helpers, call order, internal decomposition, broad object equality, or incidental formatting.
- **Mock theater** — proving that mocks were configured correctly rather than proving the system behavior.
- **Flaky signal** — depending on time, randomness, network, filesystem, database state, test order, shared state, or resource timing.
- **Opaque failure** — a test fails but the name, setup, or assertion does not reveal which behavior broke.
- **Coverage laundering** — testing trivial getters, setters, pass-throughs, or dead branches only to raise a percentage.

## Input Gate

Proceed only when intent already exists:

- a WBS plan with Acceptance Criteria or behavioral contracts
- an Investigation Report with a symptom, root cause, and verification target
- an existing feature/class whose public behavior can be read from code and callers

If the expected behavior is a business decision and is not specified, route to `clarify`. If the implementation approach is still unknown, route to `plan`.

## Prompt Contract

Use this contract to keep the skill predictable:

- **Context gathering:** read the implementation intent first, then the target source, nearby tests, and test runner configuration. Stop once you know the behavior contract, the correct test layer, the local test style, and the focused command to run.
- **Early stop:** do not scan unrelated test suites after local conventions and the target test surface are clear. Search again only if the first implementation or verification fails.
- **Escalate once:** if the contract and code disagree, make one focused check against the source artifact or caller behavior. If still unresolved, stop and route to `clarify`, `plan`, or `investigate` rather than writing assumption-driven tests.
- **Safe vs unsafe autonomy:** choose test names, fixtures, and assertions autonomously when behavior is specified. Ask the user only when expected behavior is a business decision or when adding a required testability seam would alter production design.
- **Instruction conflicts:** if coverage pressure conflicts with signal quality, signal quality wins. If existing local style conflicts with this skill, preserve local framework conventions while keeping the proof obligation behavioral.
- **Completion:** finish only when each added test maps to a proof obligation, rejected candidates are explained, and verification has been run or explicitly bounded.

## Workflow

### Phase 1: Behavior Contract

Classify each proof obligation before writing a test:

- **Contract test** — proves an Acceptance Criterion or public behavior.
- **Regression test** — proves a known bug cannot recur.
- **Boundary test** — proves invalid input, auth, external failure, state transition, or trust-boundary behavior.
- **Characterization test** — locks existing behavior before refactor.

Name the behavior in observable terms:

```text
Given [precondition], when [public action], then [observable result]
```

If the proof target is "private helper returns X," ask what public or module-visible contract that helper supports. If no contract exists, reject the test or recommend extracting the behavior behind a real interface before testing it.

### Phase 2: Layer & Double Choice

Choose the narrowest layer that proves the behavior with enough confidence:

- Prefer a unit test when the behavior can be proven through a public API without infrastructure.
- Use a small integration test when the real contract is serialization, persistence, framework routing, or cross-component wiring.
- Use a test double for collaborators that are slow, nondeterministic, external, or hard to put in a known state.
- Prefer a simple fake or stub over a mock when the outcome can be observed directly.
- Use a mock only when the behavior contract is the interaction itself, such as "publishes event X" or "does not charge card twice."

Do not mock more of the system just because the tooling makes it easy. If understanding the test requires stepping through the production implementation, the test is coupled too tightly.

### Phase 3: Signal Filter

Reject tests that:

- only mirror implementation structure
- test private helper mechanics with no behavioral claim
- exist only to raise coverage
- would fail for many unrelated reasons
- duplicate behavior already covered at a better layer
- assert full equality of a complex object when only one field matters
- verify mock choreography when a real observable outcome is available
- depend on wall-clock time, random values, network, filesystem, database, test order, or shared mutable state without an explicit seam
- contain branching, loops, computed expectations, or setup logic complex enough to need its own tests
- test trivial getters, setters, constructors, or pass-through wrappers with no decision logic

### Phase 4: Test Shape

Each accepted test should have one reason to fail:

- one behavior per test; a method can have many behavior tests, and one behavior may span multiple methods
- one Act step unless the behavior is explicitly a state transition sequence
- narrow assertions that check only the relevant observable result
- visible Arrange / Act / Assert or Given / When / Then structure
- names that encode subject, scenario, and expected behavior using the repository's local naming convention
- inputs reduced to the smallest data that proves the behavior; name any non-obvious constants
- setup local to the test unless a helper makes intent clearer without hiding important state

Parameterized tests are fine when every row proves the same behavior. If rows prove different behaviors, split them.

### Phase 5: Minimal Set

Write the smallest useful set:

- one happy path if not already covered
- one to three meaningful edge or failure cases
- one regression case for an Investigation Report
- no exhaustive matrix unless the domain truly requires it

For characterization before refactor, lock the externally observed behavior, not incidental formatting, call order, or private decomposition.

### Phase 6: Implement & Verify

Read nearby tests first and mirror naming, setup, mocking, fixtures, and assertion style. Add tests beside the existing test surface unless the repository has a clear central convention.

Before running, perform a signal audit:

- Would this test fail if the behavior contract is broken?
- Would this test keep passing after a behavior-preserving refactor?
- If it fails, does the name plus assertion point to the broken behavior?
- Is every nondeterministic dependency controlled by a seam, fake, fixture, or explicit test helper?

Run the most focused relevant test command first, then the broader project command if cheap. If a broader suite is expensive or unavailable, state the limit explicitly. A flaky result is not a pass; isolate whether nondeterminism is in the test, production code, or infrastructure.

## Output Shape

```markdown
## Test Design

### Proof Obligations
- [contract / regression / boundary / characterization] ...

### Layer & Doubles
- Layer: unit / small integration / other — because ...
- Doubles: fake / stub / mock / none — because ...

### Tests Added
- `path/to/test.ts` — proves ...

### Tests Rejected
- [candidate] — rejected because it mirrors implementation / duplicates stronger coverage / has low signal / would be flaky

### Verification
- Command: ...
- Result: ...
```
