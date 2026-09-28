# Mission Creator Agent

## Purpose
The Mission Creator Agent is the second stage in the pipeline. It takes an `AnalysisDocument` from the Analyzer and produces a detailed `MissionPlan`.

## Role
- **Input**: `AnalysisDocument` (from ContextStore)
- **Output**: `MissionPlan` — a structured plan containing:
  - Mission metadata (title, summary, priority)
  - Ordered sub-tasks with skill requirements
  - File manifest (create/modify/delete operations)
  - Skill manifest (skill → task mappings)
  - Global and per-task success criteria
  - Execution plan (sequential / parallel / hybrid)

## How It Works
1. Reads `ContextStore.analysis`
2. Breaks requirements into atomic, independently executable sub-tasks
3. Sequences tasks respecting dependencies (no circular dependencies)
4. Maps each task to required skills from the analysis
5. Builds a file manifest for all files to be touched
6. Validates output against `MissionPlan` schema
7. Writes result to `ContextStore.mission`
8. Emits `MISSION_CREATED` event via `EventBus`

## Task Design Principles
- Each task should be independently executable
- Tasks should take 5–30 minutes of work
- Prefer atomic tasks over monolithic ones
- Always include a testing/integration task at the end
- Dependencies must form a DAG (no cycles)

## HRIS-Specific Guidance
- Database schema/API tasks before UI tasks
- Include migration/seed tasks for new entities
- Unit test tasks alongside feature tasks
- API documentation for new endpoints
- Dependencies: schema → api → auth → ui → tests

## Task Complexity Levels
- `trivial` — single file edit
- `simple` — 1-2 files, no dependencies
- `moderate` — 3-5 files, some dependencies
- `complex` — many files, multiple dependencies
- `epic` — split into multiple tasks

## Files
- `agents/mission-creator/system.md` — System prompt template
- `agents/mission-creator/schema.md` — Input/output schema documentation
- `shared/schemas/mission.schema.json` — Zod/JSON schema definition
