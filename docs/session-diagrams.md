# MCP Streamable HTTP Sessions: Visual Guide

This document complements `docs/session-persistence-on-vercel.md` with visual diagrams that explain the session problem, the production failure mode on Vercel, and the recommended solution using a persistent event store.

---

## 1) Sequence: Localhost (single process) — Works

```mermaid
sequenceDiagram
    autonumber
    participant C as MCP Client (Agent/AI SDK)
    participant S as Express Server (single instance)
    participant T as Streamable HTTP Transport (in-memory)

    C->>S: POST /mcp { initialize }
    S->>T: create transport + connect(server)
    T-->>C: initialized + sessionId (header)

    C->>S: POST /mcp { notifications/initialized } (with sessionId)
    S->>T: find transport in memory (by sessionId)
    T-->>C: 200 OK

    C->>S: POST /mcp { tools/list } (with sessionId)
    S->>T: reuse same transport
    T-->>C: list of tools

    C->>S: POST /mcp { tools/call } (with sessionId)
    S->>T: reuse same transport
    T-->>C: tool result

    C->>S: DELETE /mcp (with sessionId)
    S->>T: close transport (cleanup)
```

---

## 2) Sequence: Vercel (serverless, multi-instance) — Fails without persistence

```mermaid
sequenceDiagram
    autonumber
    participant C as MCP Client (Agent/AI SDK)
    participant S1 as Server Instance A
    participant S2 as Server Instance B
    participant T1 as Transport (memory on A)

    Note over S1,S2: Requests may land on different instances

    C->>S1: POST /mcp { initialize }
    S1->>T1: create transport + connect(server)
    T1-->>C: initialized + sessionId

    C->>S2: POST /mcp { notifications/initialized } (with sessionId)
    S2->>S2: looks up transport in memory
    S2-->>C: 400 Bad Request (Invalid session)
```

---

## 3) Architecture: With Persistent Event Store — Recommended

```mermaid
flowchart LR
    subgraph Client
      C[Agent / AI SDK]
    end

    subgraph Vercel
      S1[Serverless Instance A]
      S2[Serverless Instance B]
    end

    subgraph Storage
      KV[(Vercel KV / Redis)]
    end

    C -- HTTP /mcp --> S1
    C -- HTTP /mcp --> S2

    S1 -- read/write session --> KV
    S2 -- read/write session --> KV

    %% Either instance can resume a session using the event store
```

---

## 4) Sequence: Vercel with Persistent Event Store — Works

```mermaid
sequenceDiagram
    autonumber
    participant C as MCP Client (Agent/AI SDK)
    participant S1 as Server Instance A
    participant S2 as Server Instance B
    participant ES as Event Store (KV/Redis)

    C->>S1: POST /mcp { initialize }
    S1->>S1: generate sessionId
    S1->>ES: create session state (event store)
    S1-->>C: initialized + sessionId

    C->>S2: POST /mcp { notifications/initialized } (with sessionId)
    S2->>ES: load session state
    S2-->>C: 200 OK

    C->>S2: POST /mcp { tools/list } (with sessionId)
    S2->>ES: append request event
    S2->>S2: process request using session state
    S2-->>C: list of tools

    C->>S1: DELETE /mcp (with sessionId)
    S1->>ES: mark session closed
    S1->>ES: cleanup session resources
    S1-->>C: 200 OK
```

---

## 5) State Diagram: Session Lifecycle (Serverless-safe)

```mermaid
stateDiagram-v2
    [*] --> Initializing
    Initializing --> Active: initialize OK (session persisted)
    Initializing --> [*]: initialize fails

    Active --> Active: notifications/initialized
    Active --> Active: tools/list, tools/call
    Active --> Closing: delete

    Closing --> [*]: cleanup done (session removed/expired)
```

---

## 6) Migration Workflow (from in-memory to persistent)

```mermaid
flowchart TD
    A[Choose Storage\nVercel KV or Redis] --> B[Add Dependency & Env\n@vercel/kv or ioredis + REDIS_URL]
    B --> C[Implement eventStore Adapter\ncreate src/session-store.ts]
    C --> D[Wire Transport\nuse sessionIdGenerator + eventStore in src/index.ts]
    D --> E[Local Validation\npnpm build/start · run agent/multi/vercel]
    E --> F[Deploy to Vercel\nset env vars · redeploy]
    F --> G[Prod Verification\npnpm vercel:agent:prod · agent:prod · agents:multi:prod]
    G --> H[Observe & Monitor\nlogs for initialize/notifications/tools · handle errors]
    H --> I{OK?}
    I -- yes --> J[Rollout Complete]
    I -- no --> K[Rollback/Hotfix\nrevert or patch · re-run validation]
```

---

## 7) Key Implementation Points

- **Server assigns session IDs** on initialize; clients must not pre-generate them.
- **Persistent `eventStore`** is required for serverless: either Vercel KV or Redis.
- **Transport wiring**: `new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), eventStore })`.
- **Do not rely on in-memory session maps** in serverless production; they are instance-local and ephemeral.

---

## 8) Pointers to Code

- Server entry: `src/index.ts`
- Weather MCP tools: `src/create-server.ts`
- Local agent scripts:
  - Single: `scripts/agent.mjs`
  - Multi: `scripts/multi-agent.mjs`
  - Vercel AI SDK: `scripts/vercel-ai-agent.mjs`
- Reference docs:
  - `docs/session-management-fix.md`
  - `docs/session-persistence-on-vercel.md`
```
