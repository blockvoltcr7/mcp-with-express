# Persistent MCP Sessions on Vercel with Vercel KV (Redis)

This guide explains how to implement a persistent session store for MCP Streamable HTTP on Vercel using Vercel KV (Redis-backed). It’s tailored to this repo’s structure.

References (via Context7):
- Vercel Storage / KV docs: client creation and env configuration
- MCP TypeScript SDK examples: persistent Streamable HTTP sessions using `sessionIdGenerator` + `eventStore`

---

## Why KV is needed on Vercel
- Vercel Serverless instances are stateless and can scale horizontally.
- In-memory session maps (per-process) are not shared across instances.
- MCP Streamable HTTP requires a session to be resumed across requests (initialize → notifications → tools/list → tools/call → delete).
- A persistent event store (KV/Redis) lets any instance load/append session state by `sessionId`.

---

## Prerequisites
- Vercel project with KV enabled/bound.
- Package: `@vercel/kv`.

```bash
pnpm add @vercel/kv
```

Environment variables (Vercel will provide these on the deployment):
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- Optionally `KV_URL` (for direct redis client use cases)

Local dev: if you run outside Vercel, you can set these in `.env` and/or use `vercel env pull`.

---

## Files to add
- `src/session-store.ts` (KV-backed MCP event store adapter)

---

## session-store.ts (example adapter)

This adapter illustrates the minimal interface you need for the MCP Streamable HTTP server transport to persist and resume sessions. It stores per-session metadata and an append-only list of “events” (transport frames / messages) so any instance can continue processing.

```ts
// src/session-store.ts
import { kv, createClient } from "@vercel/kv";

// If you prefer explicit client creation (not required when running on Vercel):
// const kv = createClient({
//   url: process.env.KV_REST_API_URL!,
//   token: process.env.KV_REST_API_TOKEN!,
// });

// Keys
const metaKey = (sid: string) => `mcp:sessions:${sid}:meta`;
const eventsKey = (sid: string) => `mcp:sessions:${sid}:events`;

// TTL in seconds for automatic cleanup (tune as needed)
const SESSION_TTL = 60 * 60; // 1 hour

export type StoredEvent = {
  t: number;        // timestamp ms
  d: unknown;       // event payload
};

export type SessionMeta = {
  createdAt: number; // timestamp ms
  status: "active" | "closed";
};

export const sessionStore = {
  // Create or touch metadata and ensure lists/keys get a TTL
  async init(sessionId: string) {
    const now = Date.now();
    const meta: SessionMeta = { createdAt: now, status: "active" };
    await kv.set(metaKey(sessionId), meta);
    await kv.expire(metaKey(sessionId), SESSION_TTL);
    // Create an empty list if not exists by pushing a marker then trimming
    await kv.lpush(eventsKey(sessionId), JSON.stringify({ t: now, d: { type: "init" } }));
    await kv.ltrim(eventsKey(sessionId), 0, -1);
    await kv.expire(eventsKey(sessionId), SESSION_TTL);
  },

  // Append a transport event/frame
  async appendEvent(sessionId: string, event: StoredEvent) {
    await kv.lpush(eventsKey(sessionId), JSON.stringify(event));
    await kv.expire(eventsKey(sessionId), SESSION_TTL);
  },

  // Read all events in chronological order
  async readEvents(sessionId: string): Promise<StoredEvent[]> {
    const raw = await kv.lrange(eventsKey(sessionId), 0, -1);
    const list = (raw ?? []).map((s: string) => JSON.parse(s) as StoredEvent);
    // lpush prepends; reverse to chronological
    return list.reverse();
  },

  // Load metadata
  async getMeta(sessionId: string): Promise<SessionMeta | null> {
    const v = await kv.get<SessionMeta>(metaKey(sessionId));
    return v ?? null;
  },

  // Mark closed and set a shorter TTL for cleanup
  async close(sessionId: string) {
    const meta = await sessionStore.getMeta(sessionId);
    if (meta) {
      await kv.set(metaKey(sessionId), { ...meta, status: "closed" });
      await kv.expire(metaKey(sessionId), Math.min(SESSION_TTL, 300)); // 5 min
    }
    await kv.expire(eventsKey(sessionId), Math.min(SESSION_TTL, 300));
  },

  // Optional hard delete
  async purge(sessionId: string) {
    await kv.del(metaKey(sessionId));
    await kv.del(eventsKey(sessionId));
  },
};
```

Notes:
- The exact event format the MCP transport expects may vary; adapt `appendEvent` / `readEvents` to the SDK’s eventStore API you use.
- Keep payloads reasonably small; KV has value size limits.

---

## Wiring in src/index.ts

At session initialization, generate a session ID and construct the Streamable HTTP transport with both `sessionIdGenerator` and your KV-backed event store. For subsequent requests, the transport can load from KV so any instance can resume the session.

```ts
// src/index.ts (excerpt)
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./create-server.js";
import { sessionStore } from "./session-store.js";

// ...express app setup...

app.post("/mcp", async (req, res) => {
  const sessionIdHeader = req.headers["mcp-session-id"] as string | undefined;

  try {
    // New session initialize
    if (!sessionIdHeader && isInitializeRequest(req.body)) {
      const sid = randomUUID();

      // Initialize metadata in KV immediately so races can resolve properly
      await sessionStore.init(sid);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sid,
        // IMPORTANT: this is illustrative. Map transport hooks to sessionStore
        // according to the SDK version you use (e.g., onsessioninitialized,
        // onsessionclosed, persist/load events, etc.).
        onsessioninitialized: async (id) => {
          // Already initialized in KV; can log or touch TTLs
        },
        onsessionclosed: async (id) => {
          await sessionStore.close(id);
        },
      });

      const { server } = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // Existing session requests (notifications, tools/*, streaming, delete)
    // The transport should be able to load state from KV using the session ID.
    // Depending on SDK version, you may re-create a transport object per request
    // that knows how to read/write events via the store for this session.

    if (sessionIdHeader) {
      const sid = sessionIdHeader;
      const transport = new StreamableHTTPServerTransport({
        // No generator on subsequent requests; it’s an existing session
        sessionIdGenerator: undefined,
        onsessionclosed: async (id) => {
          await sessionStore.close(id);
        },
      });

      // Example: refresh TTLs when a request arrives
      await sessionStore.init(sid);

      const { server } = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // If we get here, request was invalid for Streamable HTTP
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: Server not initialized" },
      id: null,
    });
  } catch (err) {
    console.error("/mcp error", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});
```

Important:
- The exact persistent event store hooks in `StreamableHTTPServerTransport` may differ across SDK versions. Use the latest examples in the MCP TS SDK to connect your store (e.g., `eventStore` option if available).
- If your SDK exposes `eventStore`, pass an object that maps to `append`/`read`/`close` operations and use `sid` as the key.

---

## Testing

- Local (no KV dependency):
  - `pnpm agent`, `pnpm agents:multi`, `pnpm vercel:agent`
- Production (Vercel KV active):
  - `pnpm vercel:agent:prod`
  - `pnpm agent:prod`
  - `pnpm agents:multi:prod`
- Inspect logs:
  - Should no longer see “Invalid session” / “Server not initialized” between initialize and subsequent requests.

---

## Operational notes
- **TTL/cleanup**: set TTLs on keys; shorten when closing sessions.
- **Size limits**: KV has value-size limits; keep events compact, consider chunking.
- **Durations**: Long `GET /mcp` streams can hit function `maxDuration`; consider tuning and ensure proper streaming semantics.
- **Security**: Do not log sensitive payloads; don’t expose KV credentials.

---

## Alternative: Upstash Redis
- Replace `@vercel/kv` with `ioredis` and `REDIS_URL`.
- The adapter API is the same (append/read/close using `sessionId` as key).
- Useful if you deploy outside Vercel or want centralized Redis across multiple apps.
