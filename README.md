# Express MCP Server (Weather) on Vercel

Model Context Protocol (MCP) server built with Express that exposes weather tools backed by the US National Weather Service (NWS) API. Ships with a Streamable HTTP transport and example agent scripts to test locally or against a deployment.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel-labs/express-mcp&project-name=express-mcp&repository-name=express-mcp)

---

## What this app does

- **Exposes MCP tools** via HTTP at `POST /mcp` for AI agents/clients.
- **Tools available** (defined in `src/create-server.ts`):
  - **get-alerts**: Get active weather alerts for a US state. Input: `{ state: "CA" }` (2‑letter code).
  - **get-forecast**: Get forecast for a latitude/longitude. Input: `{ latitude: 37.7749, longitude: -122.4194 }`.
- **Uses NWS API** (`api.weather.gov`) with a configurable `User-Agent`.

---

## Architecture overview

- **`src/index.ts`**: Express bootstrap, CORS, static files, MCP routes (`POST /mcp`, `GET /mcp`, `DELETE /mcp`). Implements per-session Streamable HTTP transports: new sessions are created and stored on `initialize`; subsequent requests reuse the stored transport by `mcp-session-id`.
- **`src/create-server.ts`**: Creates `McpServer`, registers `get-alerts` and `get-forecast`, validates inputs with Zod, calls NWS, and formats results.
- **`public/`**: Static assets.
- **`build/`**: Compiled JS output (never edit directly).
- **`scripts/agent.mjs`**: Minimal agent that connects to `/mcp` and runs a prompt (server assigns the session ID).
- **`scripts/multi-agent.mjs`**: Runs two agents concurrently; each gets its own MCP HTTP session (assigned by server).
- **`scripts/vercel-ai-agent.mjs`**: Uses the Vercel AI SDK’s MCP client to discover tools from this server.

Transport: **Streamable HTTP** from `@modelcontextprotocol/sdk`, which requires an MCP `initialize` handshake before calling tools. The server assigns session IDs; clients must not hardcode or pre-generate them.

---

## Prerequisites

- Node 18+ (Node 20 recommended)
- pnpm (preferred)

---

## Install & run locally

```bash
pnpm install
pnpm dev
# Server listens on http://localhost:3000
```

Build & run the compiled bundle:
```bash
pnpm build
pnpm start
```

Environment variables (loaded via `dotenv` in `src/index.ts` and `scripts/*.mjs`):

- `PORT` (optional): defaults to `3000`.
- `OPENAI_API_KEY` (required to run the example agent scripts using OpenAI models).
- `MCP_URL` (optional for scripts): e.g. `http://localhost:3000/mcp` or your deployed `/mcp` URL.
- `AGENT_PROMPT`, `AGENT_A_PROMPT`, `AGENT_B_PROMPT` (optional): customize script prompts.

Create a `.env` in the repo root as needed:
```ini
OPENAI_API_KEY=sk-...
MCP_URL=http://localhost:3000/mcp
```

---

## Testing with MCP Inspector (GUI)

- Install/run the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector).
- Connect using:
  - **Transport**: HTTP
  - **URL**: `http://localhost:3000/mcp` (or your deployed `/mcp`)
- Inspector handles the MCP handshake and headers, and lets you call tools interactively.

---

## Testing with the provided agent scripts

These scripts use the OpenAI Agents SDK and the Vercel AI SDK to connect to the MCP server and run prompts. The server assigns session IDs during the MCP handshake.

1) Single agent (default prompt asks for CA alerts):
```bash
pnpm agent
# or override the prompt
AGENT_PROMPT="Forecast for 37.7749,-122.4194" pnpm agent
```
- Script: `scripts/agent.mjs`

2) Multi-agent (two agents, separate sessions, concurrent):
```bash
pnpm agents:multi
# with prompt overrides
AGENT_A_PROMPT="List tools with schemas" \
AGENT_B_PROMPT="Forecast for 40.7128,-74.0060" \
pnpm agents:multi
```
- Script: `scripts/multi-agent.mjs`

3) Vercel AI SDK MCP client (tool discovery):
```bash
pnpm vercel:agent
```
- Script: `scripts/vercel-ai-agent.mjs`

---

## Testing with curl (advanced)

The Streamable HTTP transport requires both:
- `Accept: application/json, text/event-stream`
- An MCP `initialize` handshake before any `tools/*` calls

Because managing the session/handshake with curl is error‑prone, prefer Inspector or the scripts. If you still want to try curl, ensure:

- Include the Accept header.
- Perform `initialize` first and reuse the same session for subsequent calls.

List tools (will fail if not initialized):
```bash
curl -s http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## Deployment (Vercel)

- Deploy via the Vercel button or your workflow. Ensure the `/mcp` route is reachable.
- Use your deployment URL in clients: `https://<your-deployment>.vercel.app/mcp`.
- Cold starts: this server now awaits initialization before serving `/mcp`, reducing “Server not initialized” responses.

NWS notes:
- `USER_AGENT` in `src/create-server.ts` should be updated to an identifier you own if you publish this.

---

## Troubleshooting

- **Not Acceptable: Client must accept both application/json and text/event-stream**
  - Add header: `-H 'Accept: application/json, text/event-stream'`

- **Bad Request: Server not initialized**
  - Your client must perform the MCP `initialize` handshake first. The server will assign a session ID; clients should reuse it for subsequent requests. Inspector and the provided scripts handle this automatically.

- **Invalid Request: Server already initialized**
  - You attempted to re‑initialize an existing Streamable HTTP session. Do not send a second `initialize` for the same session; instead, reuse the session ID returned by the server.

- **Client-provided session ID fails**
  - Do not pre-generate `sessionId` client-side. Let the server assign it during `initialize`, then include it in subsequent requests via the `mcp-session-id` header (the SDKs handle this for you).

- **Port 3000 in use**
  - Kill the process using it, or set `PORT` in `.env` and restart.

- **Peer dependency warnings for zod**
  - You can align versions, e.g. `pnpm add zod@^3.25.40`, but it’s non‑blocking for local testing.

---

## Project scripts

- `pnpm dev` – TypeScript watch + nodemon on `build/index.js`.
- `pnpm build` – Compile to `build/`.
- `pnpm start` – Run compiled server.
- `pnpm agent` – Single agent example using MCP over HTTP.
- `pnpm agents:multi` – Two agents concurrently with separate sessions.
- `pnpm vercel:agent` – Vercel AI SDK client that connects to the MCP server and discovers tools.

---

## API endpoints

- `POST /mcp` – Streamable HTTP MCP endpoint. Used for initialize and JSON-RPC method calls.
- `GET /mcp` – Stream responses for the active session.
- `DELETE /mcp` – Close the active session.

---

## Repo guidelines

TypeScript sources under `src/`. Don’t edit `build/`. Use pnpm for installs. Environment via `dotenv`. See `AGENTS.md` for repository conventions and notes.

For a deep dive into the session-management changes and how to avoid common pitfalls, see `docs/session-management-fix.md`.
