# Project Instructions

This document defines the workflow for working on this project. **Read this file first** when starting or resuming work.

---

## Workflow Overview

**ALWAYS follow this sequence when starting work:**

1. **Start here** — Read this file (`instructions.md`)
2. **Check progress** — Open [progress.md](progress.md) to see:
   - Current phase and status
   - Last completed task
   - Any blockers or decisions made
3. **Consult the plan** — Open [plan.md](plan.md) to understand:
   - Next incomplete task in current phase
   - Task dependencies and requirements
4. **Do the work** — Implement the next incomplete task
5. **Reflect and Review** — Step back, reassess the high-level view:
   - Ensure the high-level requirements are met
   - Fix any gaps or issues
6. **Update progress** — Mark completed items in [progress.md](progress.md) with:
   - Status change (🔴→🟡→🟢)
   - Timestamp and notes
   - Any decisions or deviations
7. **Update documentation** — Update [CLAUDE.md](CLAUDE.md) and other md files as needed
   - Major changes should be reviewed with the user

---

## Parallel Agent Strategy (PREFERRED)

- **Default to parallel execution** — When multiple tasks exist, ALWAYS launch agents in parallel
- **Use single message** — Send one message with multiple Task tool calls for maximum efficiency
- **Cost is not a concern** — Prioritize speed and throughput over token usage
- **Examples of parallel work**:
  - Exploring different parts of codebase simultaneously
  - Implementing multiple independent features
  - Running tests while generating documentation
  - Researching multiple technical questions
- **Only serialize** — When tasks have hard dependencies (Task B needs Task A's output)

---

## File Roles

| File | Purpose |
|------|---------|
| [specs.md](specs.md) | **Source of truth** for requirements. Do not modify unless requirements change. |
| [plan.md](plan.md) | **Implementation plan** derived from specs. Update when approach changes. |
| [progress.md](progress.md) | **Execution tracker**. Update after every work session. |
| `instructions.md` | **This file**. Workflow guide for agents/contributors. |

---

## Rules

### When Starting Work
- Always read `instructions.md` first
- Check `progress.md` for the last completed task and any blockers
- Identify the next incomplete task from `plan.md`

### When Completing Work
- Mark the task as complete in `progress.md` with a timestamp
- Add any relevant notes (decisions made, blockers encountered, deviations from plan)
- If work is partially complete, note what remains
- Find all related md files and update them as needed

### When Plans Change
- Update the relevant section in `plan.md`
- Add a changelog entry in `progress.md` under "Plan Changes"
- Note the reason for the change

### Handling Blockers
- Document the blocker in `progress.md` under "Current Blockers"
- If a workaround is found, document it
- If the blocker requires a plan change, update `plan.md`

### Working with Multiple Agents
- **Default to parallel** — ALWAYS consider launching multiple agents for independent work
- **Launch in parallel** — Use single message with multiple Task calls for all independent tasks
- **Maximize throughput** — More agents = faster completion (cost is not a limiting factor)
- **Coordinate updates** — When multiple agents complete work, consolidate progress.md updates
- **Avoid conflicts** — Agents should work on different phases, files, or independent tasks
- **When to parallelize**:
  - Different phases of the plan (e.g., Phase 5.1 + 5.2 simultaneously)
  - Exploration + implementation
  - Multiple feature additions
  - Research + coding
  - Testing + documentation
  - Code review + next feature planning

---

## Quick Reference Commands

```bash
# View current status
cat progress.md

# View next tasks
cat plan.md
```

---

## Contact / Escalation

If requirements are unclear, refer to [specs.md](specs.md). If specs.md doesn't answer the question, flag it as an open question in `progress.md`.
