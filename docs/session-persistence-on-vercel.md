# MCP Streamable HTTP on Vercel: Session Persistence Guide

## Summary
- Symptom: `HTTP 400 { code: -32000, message: "Bad Request: Server not initialized" }` when using production endpoint on Vercel.
- Cause: In-memory session state is lost across serverless instances. Subsequent MCP requests (e.g., `GET /mcp`, `tools/*`) land on different instances which do not have the session in memory.
- Fix: Use a persistent session/event store with the MCP Streamable HTTP transport (e.g., Vercel KV or Redis) so any instance can resume an MCP session.

## Why this happens on Vercel
- Vercel Serverless Functions are stateless and can scale horizontally. Two consecutive HTTP requests for the same client session may hit different instances.
- Our server originally tracked sessions in an in-memory map (per process). That works locally (single process) but fails in production when a different instance handles the next request.

## What the docs say
- Vercel docs (serverless model) recommend using managed storage (KV/Redis) for state that must persist across instances and cold starts. See Vercel Storage products (KV, Postgres, Blob) and examples showing how to wire persistent storage in serverless contexts.
- MCP TypeScript SDK examples show two relevant modes:
  - Stateless mode: `sessionIdGenerator: undefined` for one-off, per-request handling (not ideal for agent flows that require an MCP session).
  - Persistent session mode: provide both `sessionIdGenerator` and an `eventStore` backed by a database so sessions can be resumed on any node.

References (summarized from docs accessed via Context7):
- Vercel docs: Use storage products (e.g., KV/Redis) for persistent state across serverless instances.
- MCP TypeScript SDK examples: `sessionIdGenerator: () => randomUUID(), eventStore: databaseEventStore` for persistent Streamable HTTP sessions.

## Solution options
- Option A (recommended): Add a persistent session store.
  - Use Vercel KV (`@vercel/kv`) or Redis (`ioredis` with `REDIS_URL`).
  - Implement an MCP `eventStore` that saves and reads session data by `sessionId`.
  - Pass both `sessionIdGenerator` and `eventStore` to `new StreamableHTTPServerTransport(...)`.
- Option B: Run a stateful, long-lived server (VM/container) where in-memory sessions are valid.
- Option C: Pure stateless mode (unsupported for most MCP clients that require sessions).

## Implementation outline for this repo
1. Pick a store
   - Vercel KV: `@vercel/kv` and Vercel project KV binding.
   - Redis: `ioredis` and `REDIS_URL` (e.g., Upstash Redis).
2. Add dependencies and env
   - Example (Redis): `pnpm add ioredis`
   - `.env`/Vercel env: `REDIS_URL=...`
3. Create `src/session-store.ts`
   - Export a small adapter that implements the event store required by the MCP Streamable HTTP transport.
   - Persist session metadata and events by `sessionId` in KV/Redis.
4. Wire it in `src/index.ts`
   - On `initialize`:
     - Generate `const sessionId = randomUUID()`.
     - Create transport: `new StreamableHTTPServerTransport({ sessionIdGenerator: () => sessionId, eventStore })`.
     - `await server.connect(transport)` and handle the request.
   - For subsequent requests, the transport will load from `eventStore` so any instance can serve the session.
5. Remove reliance on the in-memory `transports` map for production paths.

## Testing checklist
- Local: `pnpm agent`, `pnpm agents:multi`, `pnpm vercel:agent` should work as before.
- Production: `pnpm vercel:agent:prod`, `pnpm agent:prod`, `pnpm agents:multi:prod` should succeed.
- Logs should show successful initialize, notifications, `tools/list`, and `tools/call` without “Invalid session”.

## FAQ
- Why did localhost work? Because all requests hit one process where in-memory sessions were available.
- Can we avoid sessions entirely? Not if you want to support MCP clients (OpenAI Agents SDK, Vercel AI SDK) that rely on session semantics.
- Is KV/Redis required? In serverless production, yes—unless you run in a single long-lived process.

## Next steps
- Choose your store (Vercel KV or Redis) and I will implement `src/session-store.ts` and wire it in `src/index.ts`.
- After deploying, re-test the production scripts to confirm persistent session behavior.
