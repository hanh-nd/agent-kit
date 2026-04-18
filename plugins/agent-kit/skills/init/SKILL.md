---
name: ak:init
description: >
  Extract a compact "DNA Profile" from any codebase — capturing stack,
  architecture, conventions, error handling, testing patterns, and business terminology —
  so that downstream coding agents produce code that matches the project's existing style
  and structure. Use this skill whenever you need to understand a codebase before
  generating code, planning implementation, or reviewing PRs.
version: 1.0.0
---

# Codebase DNA Extractor

## Purpose

Before writing code in an existing project, you need to understand its "culture" —
the frameworks, patterns, naming conventions, and architectural decisions that make
code look like it belongs. This skill extracts that understanding into a compact
DNA Profile (≤ 2,000 tokens) suitable for injection into a coding agent's system prompt.

The profile answers one question: **"What does a senior developer who's been on this
project for 6 months know instinctively that a newcomer doesn't?"**

---

## How It Works: Three Phases

### Phase 1 — Structural Discovery (shell commands, no file reading)

Map the project shape without reading file contents. This phase is cheap and fast.

**Step 1: Get the directory tree.**

```bash
find <project_root> -type f \
  -not -path '**/node_modules/**' \
  -not -path '**/.git/**' \
  -not -path '**/vendor/**' \
  -not -path '**/dist/**' \
  -not -path '**/build/**' \
  -not -path '**/__pycache__/**' \
  -not -path '**/target/**' \
  -not -path '**/.next/**' \
  -not -path '**/coverage/**' \
  -not -name '*.lock' \
  -not -name '*.map' \
  | head -500
```

If the project has more than 500 files, also run a directory-only tree (depth 3) to see the top-level organization:

```bash
find <project_root> -type d -maxdepth 3 \
  -not -path '**/node_modules/**' \
  -not -path '**/.git/**' \
  -not -path '**/vendor/**' \
  -not -path '**/dist/**' \
  | sort
```

**Step 2: Identify the primary language ecosystem.**

Look for ecosystem marker files at the project root:

| Marker File                                      | Ecosystem                    |
| ------------------------------------------------ | ---------------------------- |
| `package.json`                                   | JavaScript/TypeScript (Node) |
| `pyproject.toml`, `setup.py`, `requirements.txt` | Python                       |
| `go.mod`                                         | Go                           |
| `Cargo.toml`                                     | Rust                         |
| `pom.xml`, `build.gradle`, `build.gradle.kts`    | Java/Kotlin (JVM)            |
| `Gemfile`                                        | Ruby                         |
| `composer.json`                                  | PHP                          |
| `*.csproj`, `*.sln`                              | C# (.NET)                    |
| `mix.exs`                                        | Elixir                       |
| `pubspec.yaml`                                   | Dart/Flutter                 |

If multiple markers exist at root, this is a polyglot project — note each ecosystem
and scan each independently. For monorepos, identify sub-projects by looking for
nested ecosystem markers.

**Step 3: Detect monorepo structure.**

Signs of monorepo: `packages/`, `apps/`, `services/`, `libs/` directories at root;
or a workspace config (`pnpm-workspace.yaml`, `lerna.json`, `turbo.json`,
Cargo workspace in `Cargo.toml`, Go workspace `go.work`). If monorepo detected,
list each workspace member and treat the largest or most representative as primary
scan target. Note the monorepo tooling in the profile.

---

### Phase 2 — High-Signal File Reading (tiered, budget-aware)

Now read files. There are three tiers ordered by information density.
Read all of Tier 1 (cheap). Read Tier 2 selectively. Read Tier 3 only if budget remains.

**Total token budget for Phase 2: ~20,000 input tokens.**
Track approximate consumption. If approaching budget, skip remaining Tier 3 files.

#### Tier 1 — Project Metadata (~3,000 tokens)

Always read these. They are small and extremely information-dense.

- **Package manifest**: `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, etc.
  → Extract: dependencies, scripts/commands, project name, version.
- **Language config**: `tsconfig.json`, `rustfmt.toml`, `.editorconfig`, `setup.cfg`, etc.
  → Extract: strictness level, path aliases, target version.
- **Linter/formatter config**: `.eslintrc*`, `.prettierrc*`, `ruff.toml`, `.rubocop.yml`, etc.
  → Extract: enforced style rules, disabled rules (reveals intentional deviations).
- **README.md** (first 200 lines only): → Extract: project description, setup instructions, architectural overview if present.
- **.gitignore**: → Extract: what's generated vs. authored, environment patterns.

#### Tier 2 — Architecture Signals (~10,000 tokens)

Read selectively based on Phase 1 findings. Goal: understand the structural patterns.

**Entry points** (read 1-2):
Find `main.*`, `app.*`, `index.*`, `server.*` at the project or `src/` root.
These reveal: bootstrap sequence, middleware chain, dependency wiring, top-level error handling.

**Type definitions / Domain models** (read 2-3 representative files):
Find files in `types/`, `models/`, `entities/`, `schemas/`, `domain/` or files named
`*.types.*`, `*.model.*`, `*.entity.*`, `*.dto.*`.
These reveal: business terminology (the Nomenclature/Glossary), data shapes, validation approach.

**Error handling** (read 1-2):
Find files with `error`, `exception`, `fault`, `failure` in the name.
These reveal: error strategy (Result objects, custom exceptions, error codes, error envelopes).

**Shared infrastructure** (read 2-3):
Look in `utils/`, `common/`, `shared/`, `lib/`, `infrastructure/`, `core/`.
Prioritize: logger setup, HTTP client wrapper, auth utilities, database connection setup.
These reveal: observability patterns, cross-cutting conventions.

**API layer** (read 1-2 complete endpoints):
Find route definitions, controllers, or handler files. Read one complete request path
from route → handler → service → data access if that layering exists.
These reveal: API style (REST/GraphQL/RPC), request/response envelope, validation flow,
middleware chain, auth pattern.

**Database layer** (read 1-2):
Migration files (latest 1-2), schema definitions, ORM config.
These reveal: data model, naming conventions for DB objects, migration tooling.

#### Tier 3 — Representative Samples (~7,000 tokens)

Only read if token budget remains. Goal: see a complete feature implementation.

**One complete feature module**: Pick a module/feature that appears well-established
(not the simplest CRUD, not the most complex — something mid-complexity).
Read: the main source file + its test file.

**Test file**: Read 1 test file that corresponds to a Tier 2 source file.
These reveal: test framework, mocking strategy, test naming conventions, assertion style,
fixture patterns.

**CI/CD config** (read 1):
`.github/workflows/*.yml`, `.gitlab-ci.yml`, `Jenkinsfile`, `Dockerfile`.
These reveal: build process, deployment target, environment management, quality gates.

---

### Phase 3 — Synthesis

From everything read in Phase 2, produce the DNA Profile. Follow the output template
below exactly. Every field must be filled or explicitly marked `[Not detected]`.
Do not invent information — only report what the code evidence supports.

**Critical rules for synthesis:**

1. **Be specific, not generic.** "Uses error handling" is worthless. "Custom AppException
   with errorCode enum, caught by global ExceptionFilter, returned as
   `{ error: { code, message, details } }`" is useful.

2. **Include concrete examples.** For naming conventions, show actual names from the code.
   For patterns, reference actual file paths.

3. **Flag uncertainty.** If a pattern was observed in only 1 file, note it:
   "(observed in `user.service.ts`, may not be universal)".

4. **Detect legacy vs. current patterns.** If you see two conflicting patterns
   (e.g., callbacks AND async/await), check which appears in newer files.
   Heuristics for "newer":
   - Files in directories that appear actively developed (more files, recent naming patterns)
   - Patterns used in the entry point or bootstrap code (usually kept current)
   - Patterns matching the linter/formatter config (the config represents the target state)
   - If available, `git log --oneline -1 <file>` on conflicting files to compare recency

   Report the current pattern as primary and note the legacy pattern as a warning:
   "⚠ Legacy: some older files use callbacks (e.g., `legacy/mailer.js`). Follow async/await."

5. **Stay under 2,000 tokens.** This profile will be injected into a system prompt.
   Every token over budget steals from the coding agent's working memory.
   Be terse. Use sentence fragments. Skip obvious things (don't say "uses npm" if
   package.json already implies it).

---

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

- [Rule 1]
- [Rule 2]
- ...

## ⚠ Legacy Warnings

[Patterns observed in older code that should NOT be followed]

- [Legacy pattern]: [what to do instead] (seen in: [file paths])
```

---

## Edge Cases

### Monorepo with multiple apps

Scan the shared/common packages first (they define cross-cutting conventions),
then scan the most representative app. Produce one profile per distinct app type
if they differ significantly (e.g., a Go backend + React frontend in the same repo).

### Minimal or new project

If the project has < 20 source files, read all of them (skip tiering).
If config files are mostly defaults, note this — the project may not have established
conventions yet. Say so in the profile rather than inventing patterns.

### No tests found

Report `[No tests detected]` — do not assume a testing pattern. This is important
information for the coding agent (it may need to set up testing infrastructure).

### Conflicting patterns (ongoing refactor)

If linter config enforces rules that existing code violates, the config represents
the target state. Report the config's rules as primary conventions and the violations
as legacy warnings.

### Very large codebase (>1000 files)

Stick strictly to the token budget. Focus Tier 2 reading on `src/` or the primary
source directory. Skip test files in Tier 2 and rely on Tier 3 for test pattern detection.
If the directory tree alone exceeds 300 lines, summarize it rather than including it
in your working context.

---

## What NOT to Include in the Profile

- **Obvious defaults.** Don't say "uses npm" for a Node project, "uses pip" for Python.
- **Dependency lists.** The full list is in the manifest. Only mention libraries that
  affect coding patterns (e.g., "uses Zod for validation" changes how you write schemas).
- **File-by-file descriptions.** The profile is about patterns, not inventory.
- **Aspirational statements.** Only report what the code currently does, not what
  READMEs say it "should" do (unless code matches).
- **Anything that inflates token count without being actionable** for a coding agent.

---

### Phase 4 — Handoff

From the output of Phase 3, save the DNA profile to `.agent-kit/project.md` and output:

```
✅ DNA profile saved to .agent-kit/project.md.
```
