# Repository Guidelines

## Project Structure & Module Organization
TypeScript sources live in `src/`. `src/index.ts` bootstraps the Express server, wires the Streamable MCP transport, and registers HTTP middleware. `src/create-server.ts` defines the weather-focused MCP tools and shared helpers. Static assets and any public-facing files belong in `public/`. The TypeScript compiler emits runnable JavaScript to `build/`; never edit that directory by hand. Shared configuration lives at the repo root (`tsconfig.json`, `.env.example` if added) to keep tooling consistent.

## Build, Test, and Development Commands
- `pnpm install` resolves dependencies; prefer pnpm to npm for lockfile consistency.
- `pnpm build` runs `tsc`, placing compiled output in `build/` and ensuring binaries are executable.
- `pnpm dev` launches the TypeScript watcher and `nodemon` so the Express server restarts when `build/index.js` changes.
- `pnpm watch` runs `tsc --watch` alone when you only need incremental type-checking.
- `pnpm start` serves the already-built bundle from `build/index.js`; run `pnpm build` first.
- `pnpm agent` spins up a single OpenAI Agent client that connects to the MCP server and prints the response.
- `pnpm agents:multi` runs two agents concurrently to exercise parallel MCP sessions.
The placeholder `pnpm test` script exits immediately; replace it when unit tests land.

## Coding Style & Naming Conventions
Follow the existing 2-space indentation and double-quoted imports. Keep modules ESNext-compatible (`type: "module"` and `NodeNext` resolution). Use `const` for immutable bindings, `camelCase` for functions and variables, and reserve `PascalCase` for types/interfaces. Centralize side-effectful setup (environment loading, transport wiring) at module tops, and export factory functions (for example, `createServer`) for composability. Document non-obvious logic with brief comments rather than inline narration.

## Testing Guidelines
No automated tests ship yet; when adding them, colocate specs under `src/__tests__` or `src/**/__tests__` with `.spec.ts` suffixes. Adopt a TypeScript-friendly runner such as Vitest or Jest and update `pnpm test` accordingly. Aim for coverage on server setup paths, MCP tool handlers, and error branches (e.g., network fallbacks). Include fixtures for National Weather Service responses so tests avoid real API calls. Until automated tests exist, treat `pnpm agent` and `pnpm agents:multi` as smoke checks that verify tool registration, transport connectivity, and response formatting.

## Agent Integration Workflow
1. Build and start the MCP server (`pnpm build && pnpm start`) or run it in watch mode (`pnpm dev`) so `/mcp` responds locally on `http://localhost:3000/mcp`.
2. Configure environment overrides in a local `.env`: `MCP_URL` for non-default hosts, `AGENT_PROMPT` or `AGENT_A_PROMPT`/`AGENT_B_PROMPT` for tailored requests, and optional `MCP_SESSION_ID` when you need deterministic session reuse.
3. Execute `pnpm agent` for a single-agent run, or `pnpm agents:multi` to observe concurrent interactions; both scripts auto-connect via `MCPServerStreamableHttp` and log the agent’s final output.
4. Review console output for transport warnings or error stacks, and capture the prompts/responses in pull requests whenever behavior changes.

## Commit & Pull Request Guidelines
History is minimal (`Initial commit`), so start establishing Conventional Commit prefixes (`feat:`, `fix:`, `chore:`) with imperative summaries under 72 characters. Keep PRs focused on one concern, link any tracking tickets, and describe observable behavior changes plus manual test steps. Add before/after samples for MCP payloads or HTTP responses when relevant, and mention configuration updates that reviewers must replicate.

## Environment & Security Notes
Configuration relies on `dotenv`; define `.env` with `PORT` (defaults to 3000) and any future secrets. Do not commit dotenv files containing credentials. The National Weather Service requires an identifying `User-Agent`; update `USER_AGENT` in `src/create-server.ts` only when you own the published contact. Validate inbound MCP requests before expanding tool access, and keep transport logging free of sensitive payloads.
