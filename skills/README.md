# Skill Registry

Skills are the atomic units of work guidance used by the Worker Agent. Each skill is a JSON file that describes:
- What triggers this skill
- What files it operates on
- How to format output
- Domain-specific best practices

## Skill Schema

```json
{
  "skillId": "unique-skill-identifier",
  "name": "Human-Readable Skill Name",
  "description": "What this skill does and when to use it",
  "triggers": ["keyword", "another-trigger"],
  "domains": ["frontend", "backend", "database", "hr-core", "hr-leave", "etc"],
  "requiredFiles": {
    "create": ["path/to/file.ts"],
    "modify": ["existing/path.ts"]
  },
  "outputPattern": "Description of what the output looks like",
  "systemPromptAddition": "Additional instructions prepended to Worker prompt",
  "capabilities": ["hook-usage", "zod-validation", "rest-api"],
  "version": "1.0.0"
}
```

## Available Skills

| Skill ID | Name | Triggers | Domains |
|---|---|---|---|
| `react-component` | React Component Development | component, ui, form, button, modal | frontend, ui |
| `typescript-backend` | TypeScript Backend Development | api, endpoint, route, handler, service | backend, api |
| `database-schema` | Database Schema Design | schema, model, table, entity, relation | database |
| `api-endpoint` | REST API Endpoint | rest, crud, resource, /api | backend, api |
| `hr-employee-entity` | Employee Entity Management | employee, staff, worker, personnel | hr-core |
| `hr-leave-management` | Leave Management Feature | leave, absence, pto, vacation, sick | hr-leave |
| `hr-payroll-entity` | Payroll Processing | salary, payroll, payslip, deduction | hr-payroll |
| `hr-attendance` | Attendance Tracking | attendance, clock, check-in, schedule | hr-attendance |
| `testing` | Testing & QA | test, spec, unit, coverage | quality |
| `auth-guards` | Authentication & Authorization | auth, login, permission, role, guard | security |
| `migrations` | Database Migrations | migration, seed, populate, initial | database |

## Skill Files

Each skill is defined in `skills/registry/{skillId}.json`.
