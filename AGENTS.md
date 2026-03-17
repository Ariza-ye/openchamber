# OpenChamber Agent Guide

## Purpose
- OpenChamber is a Bun monorepo with web, shared UI, desktop, and VS Code runtimes.
- The product is a UI shell around an OpenCode server; UI talks to the server over HTTP + SSE.
- Desktop is a thin Tauri host; keep core product logic in web/UI unless native integration truly requires Rust.

## Runtime Architecture
- Web client entry: `packages/web/src/main.tsx`.
- Shared UI entry: `packages/ui/src/main.tsx`; most shared state lives under `packages/ui/src/stores/`.
- Web server entry: `packages/web/server/index.js`.
- CLI entry: `packages/web/bin/cli.js`.
- Desktop native entry: `packages/desktop/src-tauri/src/main.rs`.
- VS Code extension entry: `packages/vscode/src/extension.ts`.

## Before Editing
- Keep diffs tight; do not do drive-by refactors.
- Check nearby files first and follow the local pattern before inventing a new one.
- Do not modify `../opencode`; it is a separate repo.
- Do not run git or GitHub commands unless the user explicitly asks.
- Never add secrets, tokens, `.env` values, or verbose sensitive logs.

## Documentation Map
- Read module docs before touching mapped server modules.
- Core backend docs: `packages/web/server/lib/git/DOCUMENTATION.md`, `packages/web/server/lib/github/DOCUMENTATION.md`, `packages/web/server/lib/opencode/DOCUMENTATION.md`.
- Runtime service docs: `packages/web/server/lib/notifications/DOCUMENTATION.md`, `packages/web/server/lib/quota/DOCUMENTATION.md`, `packages/web/server/lib/tts/DOCUMENTATION.md`.
- Integration docs: `packages/web/server/lib/skills-catalog/DOCUMENTATION.md`, `packages/web/server/lib/terminal/DOCUMENTATION.md`.

## Install / Environment
- Package manager: `bun@1.3.5`.
- Node requirement: `>=20`.
- Install dependencies with `bun install`.
- Desktop work also needs Rust stable, Xcode Command Line Tools, and Tauri CLI.

## Common Commands
- Dev all: `bun run dev`.
- Dev web full stack: `bun run dev:web:full`.
- Dev web watchers: `bun run dev:web`, `bun run dev:web:server`.
- Dev desktop: `bun run desktop:dev`.
- Dev VS Code extension: `bun run vscode:dev`.

## Build Commands
- Build everything: `bun run build`.
- Build web/UI packages: `bun run build:web`, `bun run build:ui`.
- Build desktop app: `bun run desktop:build`.
- Build desktop dev variant: `bun run desktop:build:dev`.
- Build/package VS Code extension: `bun run vscode:build`, `bun run vscode:package`.
- Release smoke build: `bun run release:test`.

## Lint / Type-Check Commands
- Monorepo checks: `bun run type-check`, `bun run lint`.
- Web only type-check: `bun run type-check:web`.
- UI only type-check: `bun run type-check:ui`.
- Desktop only type-check: `bun run desktop:type-check`.
- VS Code only type-check: `bun run vscode:type-check`.
- Web/UI lint: `bun run lint:web`, `bun run lint:ui`.
- Desktop native lint/checks: `bun run desktop:lint`.

## Test Commands
- There is no root `test` script today.
- JS tests use Bun's built-in runner and currently live under `packages/web`.
- Run all discovered tests: `bun test`.
- Run one file: `bun test packages/web/bin/cli.test.js`.
- Run another single file: `bun test packages/web/server/lib/notifications/message.test.js`.
- Run a single test by name: `bun test packages/web/bin/cli.test.js --test-name-pattern "symlinked entry paths"`.
- If you add tests for a server module, prefer colocated `*.test.js` files beside the implementation.

## Validation Expectations
- Minimum baseline before handing off code: `bun run type-check`, `bun run lint`, `bun run build`.
- If you only changed one package, run targeted checks first, then the full baseline if the change is user-facing or cross-package.
- For CLI work, test TTY and non-TTY behavior when possible.
- For desktop-impacting work, make sure the web app still works; desktop is a shell over the web runtime.

## Cursor / Copilot Rules
- No `.cursorrules` file was found.
- No `.cursor/rules/` directory was found.
- No `.github/copilot-instructions.md` file was found.
- Do not invent extra editor-specific rules; rely on repository source, docs, and this file.

## Tech Stack
- UI: React 19, TypeScript, Vite, Tailwind v4.
- State: Zustand.
- UI primitives: Radix UI, HeroUI, Remixicon.
- Server: Express 5, Bun runtime, some Node APIs.
- Desktop: Tauri v2 + Rust.
- VS Code: extension host + webview.

## General Code Style
- Follow existing file-local formatting. This repo is not fully normalized, so do not reformat unrelated lines.
- ESLint is the enforced baseline; there is no repo-wide Prettier config in root.
- Use ASCII by default unless the file already requires Unicode.
- Prefer small helpers and early returns over deep nesting.
- Avoid adding comments unless a block is genuinely non-obvious.
- Keep functions focused; if a branchy block keeps growing, extract a helper.

## Imports
- Use ESM imports everywhere in JS/TS code.
- Prefer `import type` for type-only imports.
- In UI packages, prefer the `@/` alias for shared local imports from `packages/ui/src`.
- In cross-package TS imports, use workspace aliases such as `@openchamber/ui/...` when already established.
- Keep imports grouped logically: external packages, type imports, internal aliases, then relative imports.
- Match the surrounding file's quote and semicolon style instead of mass-normalizing old files.

## Types And Data Modeling
- TypeScript runs in strict mode; keep new code strict-friendly.
- Avoid `any`; use `unknown`, discriminated unions, generics, or narrow casts.
- Validate untrusted external data at boundaries; `zod` is already available when schema validation is warranted.
- Prefer explicit return types for exported helpers if inference is not obvious.
- Reuse shared types from `packages/ui/src/types/` and store type files before introducing duplicates.
- Keep transport shapes simple and serializable; do not leak UI-only state into server payloads.

## Naming
- React components: PascalCase file and symbol names, usually one main component per file.
- Hooks: `useXxx` in `hooks/` or adjacent component folders.
- Stores: `useXxxStore` and colocated store helpers/types.
- Constants: UPPER_SNAKE_CASE only for true constants or protocol-level values.
- Prefer full words over cryptic abbreviations unless the surrounding module already uses the shorter form.

## React / UI Conventions
- Prefer function components and hooks; class components are rare and mainly for boundaries.
- Keep side effects inside hooks or clearly named event handlers, not during render.
- Use the shared toast wrapper from `@/components/ui`; do not import `sonner` directly in feature code.
- For settings-related UI, study existing patterns in `packages/ui/src/components/views/SettingsView.tsx` and `packages/ui/src/components/sections/`.
- Preserve mobile behavior; many screens have dedicated responsive logic and should not regress on small widths.

## Theme And Styling Rules
- Before any UI styling work, load the `theme-system` skill.
- All colors must come from theme tokens or existing semantic CSS vars; never introduce raw Tailwind color classes for new UI.
- Prefer existing surface, interactive, and status tokens like `--surface-elevated`, `--interactive-hover`, and `--status-warning`.
- Use typography helpers from `packages/ui/src/lib/typography.ts` when the surrounding code does.
- Preserve the existing visual language for a screen instead of redesigning it opportunistically.

## CLI Rules
- Before terminal CLI work, load the `clack-cli-patterns` skill.
- Enforce validation in command logic, not only in prompts.
- `--quiet`, `--json`, non-interactive, and fully specified flag modes must keep the same safety behavior.
- Invalid operations must fail deterministically with non-zero exit codes.
- Test both human output and machine-oriented output when changing CLI behavior.

## Error Handling
- Fail fast on invalid inputs and impossible states.
- Use `try/catch` at I/O, network, storage, and SDK boundaries; avoid wrapping pure logic unless needed.
- On recoverable failures, log or toast something actionable and keep the app usable.
- Do not swallow errors silently unless the surrounding pattern is clearly best-effort and documented by code.
- When catching `unknown`, narrow before reading `.message`.

## Testing And Change Scope
- Add or update tests when changing protocol logic, CLI behavior, pure helpers, or bug-prone regressions.
- Keep tests close to the touched module when Bun tests are involved.
- Avoid snapshot-heavy tests unless the output is stable and materially valuable.
- Do not fix unrelated lint/style issues just because you saw them.

## Cross-Runtime Notes
- Backend behavior belongs in `packages/web/server/*`; desktop Rust should stay a thin integration layer.
- If a change affects runtime APIs, consider web, desktop, and VS Code consistency together.
- Recent release context lives in `CHANGELOG.md`.
