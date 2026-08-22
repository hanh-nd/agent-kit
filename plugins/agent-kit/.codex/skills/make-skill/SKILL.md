---
name: make-skill
description: Use when creating new skills, editing existing skills, or verifying skills work before deployment
---

# Make Skill

## Overview

**Making skills IS Test-Driven Development applied to process documentation.**

You write test cases (pressure scenarios with subagents), watch them fail (baseline behavior), write the skill (documentation), watch tests pass (agents comply), and refactor (close loopholes).

**Core principle:** If you didn't watch an agent fail without the skill, you don't know if the skill teaches the right thing. Required content is defined by observed failures — not by everything you could write down. A skill earns its tokens by surviving baseline testing.

Personal skills live in agent-specific directories (`~/.claude/skills` for Claude Code, `~/.codex/skills` or `~/.agents/skills/` for Codex).

**REQUIRED BACKGROUND:** Understand [test-driven-development](references/test-driven-development.md) before using this skill — it defines the RED-GREEN-REFACTOR cycle this skill adapts to documentation. For platform authoring conventions, see [anthropic-best-practices](references/anthropic-best-practices.md); this document adds the Agent Kit testing methodology on top.

## TDD Mapping for Skills

| TDD Concept | Skill Creation |
|-------------|----------------|
| **Test case** | Pressure scenario with subagent |
| **Production code** | Skill document (SKILL.md) |
| **Test fails (RED)** | Agent violates rule without skill (baseline) |
| **Test passes (GREEN)** | Agent complies with skill present |
| **Refactor** | Close loopholes while maintaining compliance |
| **Write test first** | Run baseline scenario BEFORE writing skill |
| **Watch it fail** | Document exact rationalizations agent uses |
| **Minimal code** | Write skill addressing those specific violations |

## When to Create a Skill

**Create when:** the technique wasn't intuitively obvious, you'd reference it across projects, the pattern applies broadly, others benefit.

**Don't create for:** one-off solutions; practices well-documented elsewhere; project-specific conventions (→ CLAUDE.md/AGENTS.md); mechanical constraints enforceable with regex/validation (automate instead — documentation is for judgment calls).

## Skill Structure

A skill directory contains `SKILL.md` plus optional supporting files:

```
skills/
  skill-name/
    SKILL.md              # Main reference (required)
    supporting-file.*     # Only if needed
```

### YAML Frontmatter (current platform spec)

Two required fields:

- `name`: lowercase letters, numbers, hyphens only; max 64 characters; no XML tags.
- `description`: third-person, max 1,024 characters. **State both what the skill does and when to use it**, with concrete triggers and searchable terms. Write in third person — it is injected into system prompts ("Reviews E2E diffs… Use when…" — never "I can…").

```yaml
# ❌ BAD: vague, first person
description: For async testing

# ✅ GOOD: what + when + trigger symptoms
description: Adds behavior-focused tests for an existing implementation. Use when adding or updating tests after a plan exists, or when coverage exists but tests prove implementation details instead of behavior.
```

Keep `SKILL.md` body under ~500 lines; split heavy material into reference files loaded on demand (progressive disclosure). Reference files link directly from SKILL.md — one level deep, never nested chains.

### Degrees of Freedom

Match instruction specificity to task fragility — this is the main quality lever in modern skill authoring:

- **High freedom** (principles, outcomes): judgment calls where context decides the path — review criteria, diagnosis, design trade-offs. Smart models need the *destination*, not steps.
- **Medium freedom** (templates with parameters): output contracts and report shapes.
- **Low freedom** (exact commands, verbatim blocks): fragile or mechanical operations only — tool-call shapes, migration scripts, artifact schemas.

Over-constraining judgment calls degrades capable models; under-constraining fragile operations breaks weak ones. When in doubt, state the outcome and let the model choose the path.

### Inline vs Reference Files

**Keep inline:** principles, required rules/workflows/gates/stop conditions, short code patterns (<50 lines) — anything the agent must always follow. **Never move required behavior into references** — if skipping a file would let an agent violate the process, that content belongs inline regardless of length.

**Move to separate files:** heavy reference (100+ lines of API docs/syntax), reusable tools/scripts, optional examples loaded only when needed.

## Claude Search Optimization

Future agents find skills through the `description`. Make it answer "should I read this right now?"

- Include both **what it does** and **when to use it** — triggering conditions, symptoms, contexts.
- Cover search vocabulary: error messages, symptoms ("flaky", "hanging"), synonyms, tool names.
- Name skills by activity or insight, verb-first where natural (`condition-based-waiting`, `root-cause-tracing`).
- One warning earned from testing: a description that summarizes *workflow* can become a shortcut agents follow instead of reading the body. State scope and triggers; leave procedure to the body.

## Flowcharts

Use only for non-obvious decision points, loops where stopping early is tempting, or A-vs-B choices. Never for reference material, code examples, linear instructions, or labels without semantic meaning (`step1`, `helper2`). See [graphviz-conventions.dot](references/graphviz-conventions.dot).

## Code Examples

One excellent, complete, runnable, real-world example beats many mediocre ones. Choose the most relevant language; don't dilute across five languages or ship contrived fill-in-the-blank templates.

## The Iron Law (same as TDD)

```
NO SKILL WITHOUT A FAILING TEST FIRST
```

This applies to NEW skills AND EDITS to existing skills.

Write skill before testing? Delete it. Start over. Edit without testing? Same violation.

**No exceptions:** not for "simple additions", not for "just a section", not for doc updates. Don't keep untested changes as "reference". Delete means delete.

## Testing All Skill Types

| Skill type | Test with | Success criteria |
|---|---|---|
| **Discipline-enforcing** (rules/requirements) | Academic questions; pressure scenarios; combined pressures (time + sunk cost + exhaustion) | Agent follows rule under maximum pressure |
| **Technique** (how-to guides) | Application scenarios; variations; missing-information probes | Correctly applies technique to new scenario |
| **Pattern** (mental models) | Recognition scenarios; applications; counter-examples | Knows when/how/when-NOT to apply |
| **Reference** (docs/APIs) | Retrieval scenarios; application; gap testing | Finds and correctly uses information |

## Bulletproofing Against Rationalization

Skills that enforce discipline must resist loopholes found under pressure. Ground every defense in observed baseline failures ([persuasion principles](references/persuasion-principles.md) explain why these techniques work):

### Close Every Loophole Explicitly

Don't just state the rule — forbid the specific workarounds agents actually attempted:

```markdown
Write code before test? Delete it. Start over.

**No exceptions:**
- Don't keep it as "reference"
- Don't "adapt" it while writing tests
- Delete means delete
```

### Cut Off "Spirit vs Letter" Arguments Early

State the foundational principle up front: **"Violating the letter of the rules is violating the spirit of the rules."**

### Build the Rationalization Table From Baseline Tests

Every excuse observed in RED-phase testing goes in:

```markdown
| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "Tests after achieve same goals" | Tests-after = "what does this do?" Tests-first = "what should this do?" |
```

Do not invent hypothetical excuses — each row should trace to an observed failure.

### Red Flags List

Make self-checking easy:

```markdown
## Red Flags - STOP and Start Over

- Code before test
- "I already manually tested it"
- "This is different because..."

**All of these mean: Delete code. Start over with TDD.**
```

## RED-GREEN-REFACTOR for Skills

### RED: Baseline

Run pressure scenarios with subagents WITHOUT the skill. Document verbatim: choices made, rationalizations used, which pressures triggered violations.

### GREEN: Minimal Skill

Write the skill addressing exactly those observed violations — nothing for hypothetical cases. Re-run scenarios WITH the skill; agents should comply.

### REFACTOR: Close Loopholes

New rationalization → add its explicit counter → re-test until bulletproof. Full methodology: [testing-skills-with-subagents.md](references/testing-skills-with-subagents.md).

## STOP: Before Moving to Next Skill

After writing ANY skill, complete the deployment process before starting another. No batching untested skills; skipping testing because "batching is efficient" is deploying untested code.

## Skill Creation Checklist

**RED Phase:**
- [ ] Pressure scenarios created (3+ combined pressures for discipline skills)
- [ ] Scenarios run WITHOUT skill — baseline behavior documented verbatim
- [ ] Patterns identified in rationalizations/failures

**GREEN Phase:**
- [ ] Name: lowercase/hyphens, ≤64 chars
- [ ] Frontmatter: `name` + `description` per current spec (≤1024 chars, what + when, third person)
- [ ] Description includes concrete triggers/symptoms/keywords
- [ ] Body addresses specific baseline failures from RED
- [ ] Degrees of freedom matched to fragility (outcomes for judgment; exact steps only for fragile ops)
- [ ] Code inline or linked; one excellent example
- [ ] Scenarios re-run WITH skill — compliance verified

**REFACTOR Phase:**
- [ ] NEW rationalizations captured; explicit counters added
- [ ] Rationalization table built from all test iterations (observed rows only)
- [ ] Red flags list created
- [ ] Re-tested until bulletproof

**Quality Checks:**
- [ ] Body <500 lines; heavy material split into one-level-deep reference files
- [ ] Flowchart only if decision non-obvious
- [ ] Quick reference table; common mistakes section
- [ ] No narrative storytelling; no multi-language dilution
- [ ] Supporting files only for tools or heavy reference

**Deployment:**
- [ ] Committed and pushed (if configured)
- [ ] Consider upstreaming via PR (if broadly useful)

## The Bottom Line

Creating skills IS TDD for process documentation. Same Iron Law, same cycle — RED (baseline) → GREEN (minimal skill) → REFACTOR (close loopholes) — same benefits: better quality, fewer surprises, bulletproof results.
