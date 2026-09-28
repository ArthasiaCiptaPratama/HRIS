# Analyzer Agent

## Purpose
The Analyzer Agent is the first stage in the HRIS multi-agent pipeline. It interprets natural language user input (triggered by `"Claude Mission:"`) and produces a structured **Analysis Document**.

## Role
- **Input**: Raw user text prefixed with `"Claude Mission:"`
- **Output**: `AnalysisDocument` — a structured JSON document containing:
  - Interpreted intent
  - Primary and secondary HRIS domains
  - Entities with attributes
  - Requirements with priorities and acceptance criteria
  - Identified skills from the registry
  - Ambiguities (if any) with clarifying questions
  - Confidence score (0.0–1.0)

## How It Works
1. Receives the user input from `ContextStore`
2. Applies HRIS domain knowledge to interpret the request
3. Maps requirements to the skill registry
4. Validates output against the `AnalysisDocument` schema
5. Writes result back to `ContextStore.analysis`
6. Emits `ANALYSIS_COMPLETE` event via `EventBus`

## HRIS Domains Covered
- Employee Management
- Attendance Tracking
- Leave Management
- Payroll Processing
- Recruitment & Onboarding
- Performance Management
- Benefits Administration
- Training & Development
- Organizational Structure
- Compliance & Reporting
- Self-Service Portal
- System Configuration
- Integration

## Key Principles
- Set `confidence < 0.6` if interpretation is uncertain, and list ambiguities
- Always produce at least one requirement with acceptance criteria
- Flag non-HRIS requests under `system_configuration` domain
- Match entities to skill registry whenever possible

## Files
- `agents/analyzer/system.md` — System prompt template
- `agents/analyzer/schema.md` — Input/output JSON schema
- `shared/schemas/analysis.schema.json` — Zod/JSON schema definition
