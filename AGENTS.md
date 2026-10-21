# SlotSure agent instructions

- Read `PROJECT_SPEC.md` completely and read `context.md` before changing code.
- Inspect relevant existing code and `docs/DECISIONS.md`; preserve useful work.
- Implement at most one explicitly authorized milestone per execution. Stop after verification and reporting. Do not start Milestone 1 without the developer's instruction.
- Keep the MVP to one consultant, customers, one consultation type, fixed 30-minute appointments, and a 14-day booking window. Follow the specification's exclusions.
- Use JavaScript, React/Vite, Express, PostgreSQL and parameterized SQL. Follow recorded architectural decisions.
- Prefer focused functions, minimal dependencies, and concrete reuse; avoid speculative abstractions or empty scaffolding.
- Verify important behavior with appropriate tests. Database/concurrency tests require real PostgreSQL. Never report unexecuted checks as passed.
- Keep secrets in ignored environment files. Never print connection strings or passwords in logs.
- Update `context.md` with actual implementation progress, commands, results, remaining issues, and the immediate next step. Record significant decisions in `docs/DECISIONS.md`.
- Never commit or push without explicit user authorization.
