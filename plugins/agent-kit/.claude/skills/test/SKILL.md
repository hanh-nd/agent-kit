---
name: test
description: 'Add or update tests given an existing implementation plan or WBS.'
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

- Short sentences, one idea each. Cut every word that isn't load-bearing.
- Plain words. "What else this touches", not "blast radius".
- Answer first, reason second. Never the reverse.
- Bullets and tables over paragraphs. Three bullets max per point.
- A question is one question plus one recommendation, under 5 lines.
- No filler openers, no self-praise, no restating the request back.
- If the explanation is longer than the thing it explains, delete the explanation.

## How this skill fails

- **Method worship** — one test per method instead of one per behavior.
- **Implementation coupling** — asserting private helpers, call order, internal structure, whole-object equality, or incidental formatting.
- **Mock theater** — proving the mocks were configured, not that the system works.
- **Flaky signal** — depending on time, randomness, network, filesystem, DB state, test order, shared state, or timing.
- **Opaque failure** — it fails, and nothing in the name, setup, or assertion says what broke.
- **Coverage laundering** — testing getters, setters, pass-throughs, or dead branches to move a percentage.
- **Rebuilt fixtures** — writing a new factory, builder, or helper when one already exists two files over.

## Before you write a helper or fixture

Test files reinvent utilities more often than production code does. Before adding one:

1. **Does it need to exist?** One test needs it → inline it.
2. **Already here?** Check the sibling test files, the shared test-utils directory, and the project's existing factories and builders. Search by behavior, not by name.
3. **Does the test framework do it?** Built-in fakes, timers, snapshots, fixtures.
4. **Already-installed test dependency?** Use it. Never add one for what five lines cover.
5. **Only then:** the smallest helper that works, placed where the project puts them.

A fixture with one caller belongs in the test that uses it.

## Input gate

Proceed only when the intent already exists:

- a WBS plan with ACs or behavior statements
- an Investigation Report with a symptom, root cause, and verification target
- an existing feature whose public behavior you can read from code and callers

Expected behavior is a business decision nobody made → route to `clarify`. Implementation approach still unknown → route to `plan`.

## How to operate

- **Gather context, then stop.** Read the intent, then the target source, nearby tests, and the runner config. Stop once you know the behavior, the right layer, the local style, and the focused command to run.
- **Don't keep scanning.** Once local conventions and the target surface are clear, stop searching. Search again only if the first attempt fails.
- **Escalate once.** Contract and code disagree → one focused check against the source or callers. Still unresolved → stop and route to `clarify`, `plan`, or `investigate`. Never write assumption-driven tests.
- **Decide alone, or ask.** Pick test names, fixtures, and assertions yourself when behavior is specified. Ask only when expected behavior is a business decision, or when a testability seam would change production design.
- **Signal beats coverage.** Every time.
- **Local style is law.** Mirror the naming, structure, assertions, fixtures, and formatting of the surrounding tests and the code they exercise. Never impose your own style on a codebase with conventions.
- **Done means:** every test maps to a stated obligation, rejected candidates are explained, and verification ran or its limits are stated.

## Workflow

### Phase 1 — Name the behavior

Classify each thing you're proving:

- **Contract** — proves an AC or public behavior.
- **Regression** — proves a known bug can't come back.
- **Boundary** — invalid input, auth, external failure, state transition, trust boundary.
- **Characterization** — locks existing behavior before a refactor.

State it in observable terms:

```text
Given [precondition], when [public action], then [observable result]
```

If the target is "private helper returns X", ask what public contract that helper serves. No contract → reject the test, or recommend extracting the behavior behind a real interface first.

### Phase 2 — Pick the layer and the doubles

Narrowest layer that proves the behavior with enough confidence:

- **Unit** when the behavior is reachable through a public API with no infrastructure.
- **Small integration** when the real contract *is* serialization, persistence, routing, or wiring.
- **Double** for collaborators that are slow, nondeterministic, external, or hard to put in a known state.
- **Fake or stub** over a mock when you can observe the outcome directly.
- **Mock** only when the interaction *is* the contract: "publishes event X", "doesn't charge the card twice".

Don't mock more just because the tooling makes it easy. If understanding the test means stepping through production code, it's coupled too tightly.

### Phase 3 — Reject these

- Mirrors implementation structure
- Tests private helper mechanics with no behavioral claim
- Exists only to raise coverage
- Would fail for many unrelated reasons
- Duplicates coverage that exists at a better layer
- Asserts a whole complex object when one field matters
- Verifies mock choreography when a real outcome is observable
- Depends on wall clock, randomness, network, filesystem, DB, test order, or shared state with no seam
- Contains branching, loops, computed expectations, or setup complex enough to need its own tests
- Tests trivial getters, setters, constructors, or pass-throughs with no decision logic

### Phase 4 — Shape

One reason to fail, per test:

- One behavior per test. A method can have many behavior tests; one behavior can span methods.
- One Act step, unless the behavior is explicitly a sequence.
- Narrow assertions — only the relevant result.
- Visible Arrange / Act / Assert or Given / When / Then.
- Names encoding subject, scenario, and expected behavior, in the repo's convention.
- Smallest input that proves the behavior. Name any non-obvious constant.
- Setup local to the test, unless a helper makes intent clearer without hiding state that matters.

Parameterized tests are fine when every row proves the same behavior. Different behaviors → split.

### Phase 5 — The minimal set

- One happy path, if not already covered.
- One to three edge or failure cases, each a *distinct* kind of scenario.
- One regression case for an Investigation Report.
- No exhaustive matrix unless the domain truly needs it. Parameterize when inputs share a behavior.

Characterizing before a refactor: lock the observable behavior, not formatting, call order, or private structure.

### Phase 6 — Write and verify

Read nearby tests first and follow them exactly — naming, setup, mocking, fixtures, assertions. Match the production code's conventions too. Put tests beside the existing test surface unless the repo has a clear central convention.

Before running, audit the signal:

- Would this fail if the behavior broke?
- Would it still pass after a behavior-preserving refactor?
- When it fails, do the name and assertion point at what broke?
- Is every nondeterministic dependency controlled by a seam, fake, or fixture?

Run the most focused command first, then the broader one if it's cheap. Expensive or unavailable → say so. A flaky result is not a pass — find out whether the nondeterminism is in the test, the code, or the infrastructure.

## Output

```markdown
## Test Design

### What we're proving
- [contract / regression / boundary / characterization] ...

### Layer & doubles
- Layer: unit / small integration / other — because ...
- Doubles: fake / stub / mock / none — because ...

### Reused
- `[existing factory/fixture/helper]` at `path` — used for ...

### Added
- `path/to/test.ts` — proves ...

### Rejected
- [candidate] — mirrors implementation / duplicated at a better layer / low signal / would be flaky

### Verification
- Command: ...
- Result: ...
```
