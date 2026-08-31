# On-demand rule routing

> Injected into all agent system prompts. Pointers only — full rule text loads on demand.

- Database schema / SQL migration tasks → **MUST** route to `@dba` (its prompt carries `sql-migration.md`).
- SDD workflows (`/prd` `/adr` `/plan` `/impl` `/sdd`) → load the `sdd-workflow` skill first; never improvise the lifecycle.
- Coding-quality rules (`coding-principles`, `comment-strategy`, `edit-protocol`, `test-scope`) are attached to coding/review agent prompts — dispatch coding tasks to a coding agent instead of implementing inline.
