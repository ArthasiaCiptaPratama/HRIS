# HRIS Multi-Agent System

This is a multi-agent HRIS (Human Resource Information System) project powered by Claude Code. The system uses three specialized agents that work in a pipeline.

## Pipeline Triggers

Every mission starts with: **`Claude Mission:`**

There are two types of prompts:

### 1. New Mission (full pipeline)
```
Claude Mission: Create an employee leave request system
```
→ Runs the full pipeline: Analyzer → Mission Creator → Worker

### 2. Run Mission (execute only)
```
Claude Mission: Run Mission leave-management-system
```
→ Skips analysis and planning. Finds the existing mission and executes it with the Worker.

The identifier can be: mission ID, session ID, title keyword, or natural description.

Example:
```
Claude Mission: Run Mission the employee attendance mission
```

## Agent Pipeline

```
User Input → Analyzer → Mission Creator → Worker → Code
            ("Claude          (Plan)        (Execute)
             Mission:")
```

### 1. Analyzer Agent (`agents/analyzer/`)
- **Role**: Interprets user intent and produces a structured `AnalysisDocument`
- **Input**: Natural language from "Claude Mission:"
- **Output**: Entities, requirements, identified skills, HRIS domains
- **Documentation**: `agents/analyzer/README.md`
- **System Prompt**: `agents/analyzer/system.md`
- **Schema**: `shared/schemas/analysis.schema.json`

### 2. Mission Creator Agent (`agents/mission-creator/`)
- **Role**: Transforms analysis into an executable `MissionPlan`
- **Input**: `AnalysisDocument` from Analyzer
- **Output**: Ordered sub-tasks, file manifest, skill mappings
- **Documentation**: `agents/mission-creator/README.md`
- **System Prompt**: `agents/mission-creator/system.md`
- **Schema**: `shared/schemas/mission.schema.json`

### 3. Worker Agent (`agents/worker/`)
- **Role**: Executes tasks from the mission, producing actual code
- **Input**: `MissionPlan` + skills from registry
- **Output**: Created/modified files, `ExecutionResult`
- **Documentation**: `agents/worker/README.md`
- **System Prompt**: `agents/worker/system.md` (pipeline mode), `agents/worker/system-run.md` (run mode)
- **Schema**: `shared/schemas/execution.schema.json`

## Skill System (`skills/`)

Skills provide specialized guidance for different types of work. Available skills:

| Skill | Purpose |
|-------|---------|
| `database-schema` | Database models with Zod validation |
| `api-endpoint` | REST API routes and handlers |
| `react-component` | React functional components |
| `hr-employee-entity` | Employee profiles and org structure |
| `hr-leave-management` | Leave requests and approvals |
| `hr-payroll-entity` | Salary and payroll processing |
| `hr-attendance` | Clock-in/out and schedules |
| `testing` | Unit tests with Vitest |
| `auth-guards` | Authentication middleware |
| `typescript-backend` | General backend patterns |

Each skill is defined in `skills/registry/{skillId}.json`.

## Directory Structure

```
HRIS/
├── CLAUDE.md                  ← You are here (entry point)
│
├── agents/                    ← Agent definitions (self-documenting)
│   ├── analyzer/
│   │   ├── README.md         # What it does
│   │   ├── system.md         # System prompt
│   │   └── schema.md         # I/O schemas
│   ├── mission-creator/
│   │   ├── README.md
│   │   ├── system.md
│   │   └── schema.md
│   └── worker/
│       ├── README.md
│       ├── system.md          # Pipeline mode prompt
│       ├── system-run.md      # Run Mission mode prompt
│       └── schema.md
│
├── skills/                    ← Skill registry
│   ├── README.md             # Overview
│   └── registry/             # Individual skill definitions
│       ├── database-schema.json
│       ├── api-endpoint.json
│       ├── react-component.json
│       ├── hr-employee-entity.json
│       ├── hr-leave-management.json
│       ├── hr-payroll-entity.json
│       ├── hr-attendance.json
│       ├── testing.json
│       ├── auth-guards.json
│       └── typescript-backend.json
│
├── missions/                  ← Generated missions (workspace)
│   └── {sessionId}/
│       ├── analysis.json
│       ├── mission.json
│       ├── execution.json
│       └── events.json
│
└── shared/                    ← Shared schemas
    └── schemas/
        ├── analysis.schema.json
        ├── mission.schema.json
        └── execution.schema.json
```

## HRIS Domains

When analyzing requests, the system recognizes these HRIS domains:
- `employee_management` — profiles, contracts, termination
- `attendance_tracking` — clock-in/out, schedules, overtime
- `leave_management` — PTO, sick leave, approvals
- `payroll_processing` — salary, deductions, payslips
- `recruitment_onboarding` — job postings, applications
- `performance_management` — KPIs, reviews
- `benefits_administration` — insurance, retirement
- `training_development` — courses, certifications
- `org_structure` — departments, reporting lines
- `compliance_reporting` — regulatory reports, audits
- `self_service_portal` — employee dashboards
- `system_configuration` — settings, integrations
- `integration` — API sync, webhooks

## How to Use

### New Mission (full pipeline)
```
Claude Mission: Build a system for tracking employee attendance
```
1. Analyzer interprets the request
2. Mission Creator builds the task plan
3. Worker executes each task

### Run Mission (execute existing)
```
Claude Mission: Run Mission attendance-tracking-system
```
1. Finds the matching mission in `missions/`
2. Loads the mission plan
3. Worker executes tasks (resumes from pending/failed)

Example session:
```
Claude Mission: Build a system for tracking employee attendance with clock-in and clock-out functionality
```
