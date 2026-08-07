# Project Rules

Production-running application.

Preserve stability and backward compatibility.

## Core Principles

- Follow the existing application flow
- Respect the current backend, frontend, and database architecture
- Preserve existing business logic and integration flow
- Reuse existing patterns before introducing new ones
- When multiple patterns exist, prefer the most commonly used existing pattern in the codebase

AI may suggest improvements or optimizations when beneficial, but must:
- preserve existing behavior
- avoid breaking changes
- avoid unnecessary rewrites
- keep modifications scoped and incremental

## Architecture

- Existing architecture is authoritative
- Maintain current module boundaries
- Preserve dependency flow
- Reuse existing utilities
- Keep code modular and scoped
- Preserve separation of concerns

## Modular Code Rules

Prefer:
- localized changes
- focused services/functions
- reusable utilities
- scoped modularization

Avoid:
- duplicated logic
- hidden dependencies
- cross-module side effects
- unnecessary abstractions
- over-engineering

Do not:
- split stable files unnecessarily
- create duplicate utility systems
- bypass existing service boundaries
- introduce inconsistent architecture patterns

## Safe Modification Rules

Prefer minimal patches over rewrites.

Do not:
- rename exports
- change API responses
- move files/folders
- rewrite stable modules
- modify unrelated files

## Security

Apply OWASP-aware secure coding only within modified scope.

Do not:
- redesign auth flow
- apply mass security rewrites
- introduce breaking validation

## Anti-Hallucination

Do not invent:
- APIs
- env variables
- database fields
- helper functions

Verify implementation exists before use.

Do not replace existing implementations unless necessary.

## Workflow

Before coding:
1. analyze affected scope
2. identify impacted modules
3. preserve current flow
4. apply minimal diff
5. preserve compatibility

## Golden Rule

Working code is more important than clever code.

Stable systems should evolve incrementally, not through unnecessary rewrites.
