---
name: init
description: Extract a codebase DNA Profile — stack, conventions, patterns — for downstream agents.
---

# Codebase DNA Extractor

## Purpose

Before writing code in an existing project, capture its "culture" — the frameworks, patterns, naming conventions, and architectural decisions that make code look like it belongs. This skill distills that into a compact DNA Profile (≤ 2,000 tokens) suitable for injection into a coding agent's system prompt.

The profile answers one question: **"What does a senior developer who's been on this project for 6 months know instinctively that a newcomer doesn't?"**

## How to Explore

You already know how to read a codebase — do it natively, cheaply first:

1. Map the project shape (directory tree, ecosystem markers, monorepo/workspace layout) without deep-reading files.
2. Read high-signal metadata: package manifests, language/linter/formatter configs, README, `.gitignore`. Linter and formatter configs are authoritative for style questions — they represent the target state even where existing code violates them.
3. Then sample representative code: entry points, domain/type definitions, error handling, shared infrastructure (logger, HTTP client, DB setup), one complete route → handler → data path, migrations/schema, one mid-complexity feature module with its test file, CI config.

Scale effort to repo size: small projects (<20 source files) can be read in full; very large ones get shallow coverage everywhere plus depth on load-bearing files. Don't burn context inventorying every file — the profile is about patterns, not a file listing.

## Synthesis Rules

1. **Be specific, not generic.** "Uses error handling" is worthless. "Custom AppException with errorCode enum, caught by global ExceptionFilter, returned as `{ error: { code, message, details } }`" is useful.
2. **Include concrete evidence.** Real names from the code; real paths for patterns.
3. **Flag uncertainty.** A pattern seen once gets "(observed in `user.service.ts`, may not be universal)".
4. **Resolve legacy vs current.** Two conflicting patterns? The newer wins: check which appears in actively developed directories, entry-point/bootstrap code, and linter config; `git log -1 <file>` settles recency when available. Report the current pattern as primary and the legacy one as a warning.
5. **Stay under 2,000 tokens.** Every token over budget steals from the coding agent's working memory. Be terse; use fragments; skip anything the manifest already implies.

## Output Template

```markdown
# Project DNA: [project-name]

## Stack

- Language: [language + version if detectable]
- Runtime: [runtime + version]
- Framework: [primary framework + version]
- Key Libraries: [list only non-obvious ones that affect how code is written]
- ORM/DB: [ORM or DB client + database type]
- Test: [test framework + assertion library + key test utilities]
- Build: [build tool + bundler if applicable]
- CI/CD: [CI system + deployment target if detected]

## Architecture

- Pattern: [e.g., "Modular monolith", "Layered MVC", "Hexagonal", "Microservices"]
- Structure: [describe directory layout pattern with example path]
- Module Boundaries: [how modules interact — barrel exports, DI, event bus, direct imports]
- Monorepo: [Yes/No, tooling if yes]

## Naming & Terminology

- File naming: [convention, e.g., "kebab-case.ts"]
- Class/Function: [convention, e.g., "PascalCase classes, camelCase functions"]
- Business glossary: [project-specific terms that differ from common defaults]
  - [Term] = [what it means / what outsiders might call it]

## API Patterns

- Style: [REST / GraphQL / gRPC / tRPC / etc.]
- Response envelope: [describe shape, e.g., "{ data, meta, errors }"]
- Pagination: [cursor / offset / none detected]
- Auth: [JWT / session / OAuth / API key + where enforced]
- Validation: [approach + library, e.g., "class-validator decorators on DTOs"]

## Error Handling

- Strategy: [Custom exceptions / Result objects / Error codes / raw try-catch]
- Error shape: [describe the error object structure]
- Global handler: [Yes/No, location if yes]
- [1-2 sentence description of the flow]

## Observability

- Logger: [library + format, e.g., "Pino, structured JSON"]
- Trace context: [what metadata is always included, e.g., "traceId, tenantId"]
- Monitoring: [if detected — metrics library, APM tool]

## Testing Conventions

- Unit tests: [location pattern, e.g., "co-located *.spec.ts"]
- Integration/E2E: [location + framework]
- Mocking: [strategy, e.g., "jest.mock for externals, in-memory DB for repos"]
- Test naming: [pattern, e.g., "describe('Service') → it('should verb when condition')"]

## Code Style & Patterns

- Async: [async/await / Promises / callbacks / Rx]
- State management: [if frontend — Redux, Zustand, Context, etc.]
- Imports: [ordering convention if enforced, path aliases]
- Key patterns: [list 2-5 project-specific patterns that a newcomer must follow]
  - [Pattern]: [brief description]

## Critical Rules

[3-7 bullet points of things that WILL cause a PR rejection if violated.
These are the highest-value items in the entire profile.]

## ⚠ Legacy Warnings

[Patterns observed in older code that should NOT be followed]

- [Legacy pattern]: [what to do instead] (seen in: [file paths])
```

Every field is filled or explicitly marked `[Not detected]`. Only report what code evidence supports.

## What NOT to Include

- **Obvious defaults.** Don't say "uses npm" for a Node project.
- **Dependency lists.** Only libraries that change how you write code ("uses Zod for validation").
- **File-by-file descriptions.**
- **Aspirational statements.** What the code does, not what READMEs say it should do.

## Edge Cases

- **Monorepo, multiple apps:** scan shared packages first, then the most representative app; produce one profile per distinct app type if they differ significantly.
- **Minimal/new project:** note that conventions aren't established yet rather than inventing patterns.
- **No tests:** report `[No tests detected]` — important information for downstream agents, don't assume a testing pattern.
- **Config enforces rules code violates:** config is primary; violations are legacy warnings.

## Handoff

Save the profile to `.agent-kit/project.md` and output:

```
✅ DNA profile saved to .agent-kit/project.md.
```
