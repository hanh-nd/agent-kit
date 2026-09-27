---
name: test
description: 'Add or update tests given an existing implementation plan or WBS.'
version: 3.0.0
providers:
  claude:
    effort: medium
---

# Test

**Input:** $ARGUMENTS

---

## The point

A test is worth writing only if it protects a behavior, a failure case, or a past bug. Coverage is a byproduct, not the goal.

A good test is a **behavior sensor**. It fails only when a real behavior changes, and the failure names the broken promise without making the reader run the implementation in their head.

**Write the fewest tests that cover the most cases.** Each kind of scenario — happy path, boundary, failure, regression — needs one representative proof. Not one test per input, per method, or per branch. Several inputs exercising the same behavior → one parameterized case. Two tests that fail for the same reason → delete one.

This skill adds and updates tests. It doesn't change production behavior, except for testability seams the plan or Investigation Report already called for.

## Voice

Write for a tired teammate, not a reviewer you're impressing.

- Short sentences, one idea each. Plain words. "What else this touches", not "blast radius".
- Answer first, reason second.
- Bullets and tables over paragraphs.
- No filler openers, no self-praise, no restating the request.
- If the explanation is longer than the thing it explains, delete the explanation.

## Before you write a helper or fixture

Test files reinvent utilities more often than production code does. Stop at the first rung that holds:

1. **Does it need to exist?** One test needs it → inline it.
2. **Already here?** Sibling test files, the shared test-utils directory, existing factories and builders. Search by behavior, not by name.
3. **Does the test framework do it?** Built-in fakes, timers, snapshots, fixtures.
4. **Already-installed test dependency?** Use it. Never add one for what five lines cover.
5. **Only then:** the smallest helper that works, placed where the project puts them.

A fixture with one caller belongs in the test that uses it.

## When not to cut

Fewest tests never means skipping:

- Every obligation the plan lists — its test mapping, gaps, or explicit test tasks.
- Validation at trust boundaries, error handling that prevents data loss, security paths, accessibility basics — when the change touches them.
- The regression case for an Investigation Report.

No plan obligations → one runnable check per piece of non-trivial logic (a branch, a loop, a parser, a money or security path). Trivial one-liners need none. No per-function suites unless asked.

## Input gate

Proceed when the intent already exists:

| Source | Where the obligations live |
| :--- | :--- |
| Plan (any size) | Test obligations, what must be true, failure cases, task IDs — read every file in the folder |
| Investigation Report | Symptom, root cause, `Verification target`, `Prevention > Regression coverage` |
| Existing feature, no plan | Public behavior read from code and callers |

The plan owns test scope. Honor its obligations; don't widen them. Plan says tests are off (no test obligations, no test tasks) and the user still invoked this skill → proceed on the user's request, and say so in one line.

Expected behavior is a business decision nobody made → route to `clarify`. Implementation approach still unknown → route to `plan`.

## How to operate

- **Gather context, then write.** Read the intent, the target source, nearby tests, and the runner config. Stop searching once you know the behavior, the layer, the local style, and the focused command. Search again only if a run fails for a reason you don't understand.
- **Decide alone.** Pick names, fixtures, and assertions yourself when behavior is specified. Ask only when expected behavior is a business decision, or a testability seam would change production design.
- **Contract and code disagree** → one focused check against source or callers. Still unresolved → skip that obligation, record it under `Blocked`, route to `clarify`, `plan`, or `investigate`, and keep going on the rest. Never write assumption-driven tests.
- **Local style is law.** Mirror the naming, structure, assertions, fixtures, and formatting of the surrounding tests.

## Workflow

### Phase 1 — Name the behavior

Classify each thing you're proving:

- **Contract** — proves an AC, a `BC` statement, or public behavior.
- **Regression** — proves a known bug can't come back.
- **Boundary** — invalid input, auth, external failure, state transition, trust boundary.
- **Characterization** — locks existing behavior before a refactor.

State it in observable terms:

```text
Given [precondition], when [public action], then [observable result]
```

"Private helper returns X" → ask what public contract that helper serves. No contract → reject the test, or recommend extracting the behavior behind a real interface first.

### Phase 2 — Pick the layer and the doubles

Narrowest layer that proves the behavior with enough confidence:

- **Unit** when the behavior is reachable through a public API with no infrastructure.
- **Small integration** when the real contract *is* serialization, persistence, routing, or wiring.
- **Double** for collaborators that are slow, nondeterministic, external, or hard to put in a known state.
- **Fake or stub** over a mock when you can observe the outcome directly.
- **Mock** only when the interaction *is* the contract: "publishes event X", "doesn't charge the card twice".

### Phase 3 — Reject these

- **Method worship** — one test per method instead of one per behavior.
- **Implementation coupling** — asserting private helpers, call order, internal structure, whole-object equality when one field matters, or incidental formatting.
- **Mock theater** — verifying mock choreography when a real outcome is observable.
- **Flaky signal** — wall clock, randomness, network, filesystem, DB, test order, or shared state with no seam.
- **Opaque failure** — nothing in the name, setup, or assertion says what broke.
- **Coverage laundering** — getters, setters, constructors, pass-throughs, or dead branches with no decision logic.
- **Duplicate coverage** — already proven at a better layer.
- **Logic in the test** — branching, loops, computed expectations, or setup complex enough to need its own tests.

### Phase 4 — Shape

One reason to fail, per test:

- One behavior per test. A method can have many behavior tests; one behavior can span methods.
- One Act step, unless the behavior is explicitly a sequence.
- Narrow assertions — only the relevant result.
- Visible Arrange / Act / Assert or Given / When / Then.
- Names encoding subject, scenario, and expected behavior, in the repo's convention.
- Smallest input that proves the behavior. Name any non-obvious constant.
- Setup local to the test, unless a helper makes intent clearer without hiding state that matters.

Parameterized tests are fine when every row proves the same behavior. Different behaviors → split. Characterizing before a refactor: lock observable behavior, not formatting, call order, or private structure.

### Phase 5 — Write and run

Put tests beside the existing test surface unless the repo has a clear central convention.

Run the most focused command first, then the broader one if it's cheap. Use the project's scripts (`npm test -- <pattern>`), not the underlying binary.

For each failure:

1. **The test is wrong** (setup, fixture, assertion) → fix it and re-run. Iterate until green.
2. **The code is wrong** (the test proves a stated obligation the code breaks) → keep the test, don't change production code, report it under `Failing obligations`.
3. **Flaky** → not a pass. Find whether the nondeterminism is in the test, the code, or the infrastructure.
4. The same failure survives 2–3 attempts → stop on that test and report it.

Command expensive or unavailable → say so.

## Output

Size it to the work. One added test gets a few lines; drop any section with nothing in it.

```markdown
## Test Design

### What we're proving
- [contract / regression / boundary / characterization] — <obligation ID, e.g. BC1 / Task 2 / AC3> ...

### Layer & doubles
- Layer: unit / small integration / other — because ...
- Doubles: fake / stub / mock / none — because ...

### Reused
- `[existing factory/fixture/helper]` at `path` — used for ...

### Added
- `path/to/test.ts` — proves ...

### Rejected
- [candidate] — method worship / coupling / duplicate / low signal / flaky

### Blocked
- <obligation> — contract and code disagree: <one line>; route to <skill>

### Failing obligations
- <test> — proves <obligation>; code returns <actual>

### Verification
- Command: ...
- Result: ...
```
