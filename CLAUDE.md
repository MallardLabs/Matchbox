# CLAUDE.md - Agent Instructions

- ALWAYS run linting after changes.
- ALWAYS check CLAUDE.md and linked files after a set of changes to make sure
  all instructions have been followed.

## Commands

- Website build: `pnpm build`
- Website dev: `pnpm dev`
- Website test: `pnpm test` (single test: `cd [app/package] && pnpm test [testname]`)
- Extension build: `pnpm run extension/build`
- Extension dev: `pnpm run extension/dev`
- Lint: `pnpm lint` (fix automatically: `pnpm lint:fix`)
- Format config files: `pnpm lint:config` (fix: `pnpm lint:config:fix`)
- Trellium release boundary check: `pnpm check:trellium`

## Code Layout

- Shared utility code should go in `packages/shared/src/`, and be imported elsewhere via the `@repo/shared` module.
- This repository uses `turbo` to manage cross-package building and dependencies.

## Code Style

- Don't use semicolons
- Follow the workspace biome rules via @repo/biome-config .
- For filetypes that aren't supported by biome, use prettier instead
- Use default exports for single exports

## Additional Details

ALWAYS RESPECT the more detailed information in:

- MatchBox repo roles and release promotion: ./agent-instructions/matchbox-repo-roles.md
- TypeScript and JavaScript: ./agent-instructions/typescript.md
- Financial Precision: ./agent-instructions/financial-precision.md
- Git commits and messages: ./agent-instructions/git.md
- Cloudflare workers and server scripts: ./agent-instructions/server.md
- UI packages and React: ./agent-instructions/ui-and-react.md
- Supabase migrations and database changes: ./agent-instructions/supabase-migrations.md
