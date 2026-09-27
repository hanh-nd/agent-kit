---
name: make-skill
description: Use when creating new skills, editing existing skills, or verifying skills work before deployment
version: 2.0.0
providers:
  claude:
    effort: low
---

# Make Skill

## Overview

**Making skills is Test-Driven Development applied to process documentation.**

Write test scenarios, watch an agent without the skill (baseline), write the skill, watch the agent with it, then close the gaps you saw.

**Core principle:** if you didn't watch an agent without the skill, you don't know what the skill should teach. Content is earned by observed failures — not by everything you could write down. The failure may be the agent breaking a rule, or the skill making a capable model worse.

Personal skills live in agent-specific directories (`~/.claude/skills` for Claude Code, `~/.codex/skills` or `~/.agents/skills/` for Codex).

## Voice

Write for a tired teammate, not a reviewer you're impressing.

- Short sentences, one idea each. Plain words. "What else this touches", not "blast radius".
- Answer first, reason second.
- Bullets and tables over paragraphs.
- No filler openers, no self-praise, no restating the request.
- If the explanation is longer than the thing it explains, delete the explanation.

**Every skill in this kit carries this block verbatim** — identical copies are greppable, so drift is catchable by script. A skill may append skill-specific lines after it (e.g. `code`: "Code first, then at most three lines about it.").

Platform authoring conventions: [anthropic-best-practices](references/anthropic-best-practices.md) (snapshot of the official page).

---

## Authoring principles

Current models (Claude Opus 5 / 5.5) are capable, verify their own work, and follow instructions closely. Instructions written for weaker models now make them slower and worse. Every skill meets these:

1. **No thinking or care prompts.** No "think carefully", "be careful", "double-check". Effort is the runtime control for thinking; the lines only add latency. ([Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5))
2. **No verification the model does unprompted.** No re-read, re-verify, or "use a subagent to verify" steps — they cause over-verification with no quality gain. Self-checks list only mechanically checkable invariants (file set, IDs resolve, no source edits). ([Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5))
3. **Default and flag.** Make routine calls and record them as overridable defaults, surfaced in the final message. Ask only when readings lead to materially different outcomes, or the call touches security, data integrity, or something irreversible. Batch those into one ask. No stop-and-wait after every phase.
4. **Don't filter inside a finding pass.** "Only report high-severity" or "be conservative" makes the model report less, literally. Find everything; rank or filter in a separate step. ([Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5))
5. **Subagents only for sizeable, independent work.** Not for work finishable in a handful of tool calls, and not to double-check. ([Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5))
6. **Size to the task; state things once.** Output scales with the change (a two-file fix gets one page). Each fact has one home; other places point to it. Each rule is stated once, in plain imperative with a one-line why — no `CRITICAL` / `YOU MUST`, which now causes overtriggering ([best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)). Name the specific patterns to avoid, not a generic "avoid X".
7. **Skills that decide what to build carry the ladder and "When not to cut".** The reuse ladder (see `plan` or `code`) plus the never-cut list: trust-boundary validation, data-loss handling, security, accessibility, anything explicitly requested. ([ponytail](https://github.com/DietrichGebert/ponytail))
8. **Repair loops iterate.** Fix, re-run, repeat until green; stop after 2–3 attempts on the same failure and surface it. Not one-shot.

Bright-line absolutes ("no exceptions") are for safety, data integrity, and irreversible actions — and for loopholes you actually observed in testing. Nowhere else.

---

## When to make one

**Create when:** the technique wasn't intuitively obvious, you'd reference it across projects, the pattern applies broadly, others benefit.

**Don't create for:** one-off solutions; practices the model already knows or that are well documented elsewhere; project-specific conventions (→ CLAUDE.md/AGENTS.md); mechanical constraints enforceable with regex or validation (automate instead — documentation is for judgment calls).

## Structure

```
skills/
  skill-name/
    SKILL.md              # Main reference (required)
    supporting-file.*     # Only if needed
```

### Frontmatter

- `name`: lowercase letters, numbers, hyphens; ≤ 64 characters; no XML tags.
- `description`: third person, ≤ 1,024 characters. **What the skill does and when to use it**, with concrete triggers and searchable terms. It is injected into system prompts ("Reviews E2E diffs… Use when…" — never "I can…").

```yaml
# ❌ vague, first person
description: For async testing

# ✅ what + when + trigger symptoms
description: Adds behavior-focused tests for an existing implementation. Use when adding or updating tests after a plan exists, or when coverage exists but tests prove implementation details instead of behavior.
```

A description that summarizes the *workflow* can become a shortcut agents follow instead of reading the body. State scope and triggers; leave procedure to the body. Name skills by activity, verb-first where natural (`condition-based-waiting`, `root-cause-tracing`).

Keep the body under ~500 lines. Split heavy material into reference files one level deep, linked from SKILL.md.

### Degrees of freedom

Match specificity to fragility — the main quality lever:

- **High freedom** (outcomes, principles): judgment calls — review criteria, diagnosis, design trade-offs. Give the destination, not the steps.
- **Medium freedom** (templates with parameters): output contracts, report shapes.
- **Low freedom** (exact commands, verbatim blocks): fragile or mechanical operations only — tool-call shapes, migration scripts, artifact schemas.

Over-constraining judgment degrades capable models; under-constraining fragile operations breaks weak ones. In doubt, state the outcome.

### Inline vs reference files

**Inline:** required rules, workflow, stop conditions, short patterns (< 50 lines). If skipping a file would let an agent violate the process, that content belongs inline.

**Reference files:** heavy material (100+ lines of API docs or syntax), reusable scripts, optional examples.

### Flowcharts and examples

Flowcharts only for non-obvious decisions, loops where stopping early is tempting, or A-vs-B choices — see [graphviz-conventions.dot](references/graphviz-conventions.dot). One complete, runnable, real example beats several contrived ones; don't dilute across languages.

---

## RED-GREEN-REFACTOR for Skills

| TDD concept | Skill creation |
|---|---|
| Test case | Scenario run by a subagent |
| Production code | `SKILL.md` |
| RED | Baseline without the skill: rule broken, or output worse than it should be |
| GREEN | With the skill: agent complies and output is no worse than baseline |
| REFACTOR | Close observed gaps; cut instructions that cost more than they return |

### Size the testing to the change

| Change | Test |
|---|---|
| New skill, or new/changed behavior | Full cycle below |
| Wording or trimming with no intended behavior change | Re-run the existing scenarios, or one with/without comparison |
| Frontmatter or typo only | None |

No behavior change ships untested. Don't deploy a batch in which any skill with a behavior change is untested.

### RED: baseline

Run scenarios with subagents **without** the skill. Record verbatim: choices made, rationalizations, what took too long or ran too long.

| Skill type | Scenario | Pass when |
|---|---|---|
| **Discipline** (rules) | Pressure scenarios, 3+ combined pressures | Agent follows the rule under pressure |
| **Workflow / technique** | 2–3 real tasks, sized S and M | Correct, no more stops, tokens, or length than needed |
| **Pattern** (mental models) | Recognition, application, counter-examples | Knows when and when not to apply |
| **Reference** (docs/APIs) | Retrieval and application | Finds and uses the right information |

Formats and examples: [testing-skills-with-subagents.md](references/testing-skills-with-subagents.md).

### GREEN: minimal skill

Address exactly the observed failures — nothing for hypothetical cases. Re-run the same scenarios with the skill.

### REFACTOR: close the gaps

- **Name the loophole you saw.** Forbid the specific workaround agents attempted, not a generic "don't cheat".
- **Rationalization table from real baselines only.** Each row traces to an observed excuse.
- **Red-flags list** for discipline skills only.
- **Cut what didn't earn its place.** An instruction that adds stops, length, or tokens without changing the outcome goes.

Re-test until no new failure appears.

---

## Checklist

**RED**
- [ ] Testing sized to the change (table above)
- [ ] Baseline run without the skill; failures recorded verbatim

**GREEN**
- [ ] `name` and `description` meet the frontmatter rules
- [ ] `## Voice` block present verbatim
- [ ] Ladder + "When not to cut" present, if the skill decides what to build
- [ ] Body addresses observed failures only; degrees of freedom match fragility
- [ ] With-skill run: complies, and no worse than baseline on stops, length, tokens

**Authoring principles** — this grep returns nothing outside quoted examples:

```bash
grep -nE 'think (carefully|hard)|be careful|double-check|re-verify|CRITICAL|YOU MUST|IMPORTANT:|only report|be conservative' <skill>/SKILL.md
```

- [ ] Every question gate is justified by principle 3; defaults surface in the final message
- [ ] Subagent use meets principle 5; repair loops meet principle 8
- [ ] Each fact has one home; each rule appears once

**Shape**
- [ ] Body < 500 lines; references one level deep
- [ ] Quick-reference table or common-mistakes section only if testing earned it
- [ ] Flowchart only for a non-obvious decision

**Deployment**
- [ ] Committed and pushed (if configured)
- [ ] Consider upstreaming via PR (if broadly useful)
