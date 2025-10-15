# MCP Session Management Fix

## Problem Summary

The MCP server was returning `HTTP 400: Bad Request: Server not initialized` errors when client agents attempted to connect and use the weather tools.

## Root Cause Analysis

### 1. **Server-Side Issue: Global Transport Instance**

The original server implementation created a single global `StreamableHTTPServerTransport` instance at startup:

```typescript
// ❌ INCORRECT - Single global transport
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined, // stateless mode
});

// Server connected once at startup
await server.connect(transport);

// All requests tried to use the same transport
app.post("/mcp", async (req, res) => {
  await transport.handleRequest(req, res, req.body);
});
```

**Problems:**
- The transport was configured as stateless (`sessionIdGenerator: undefined`)
- All client requests were routed to the same transport instance
- No session tracking or management was implemented
- The MCP protocol requires proper session initialization before handling requests

### 2. **Client-Side Issue: Pre-Generated Session IDs**

Client scripts were providing their own session IDs when connecting:

```javascript
// ❌ INCORRECT - Client provides session ID
const mcpServer = new MCPServerStreamableHttp({
  url: 'http://localhost:3000/mcp',
  sessionId: `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
});
```

**Problems:**
- The client-provided session ID didn't exist on the server
- The client assumed the session was already initialized
- The client skipped sending the `initialize` request
- First request was `tools/list` instead of `initialize`, causing the error

### 3. **MCP Protocol Flow Violation**

The proper MCP Streamable HTTP protocol flow is:

1. **Client** → `initialize` request (no session ID header)
2. **Server** → Creates new session, assigns session ID, returns it in response
3. **Client** → `notifications/initialized` (with session ID header)
4. **Client** → Subsequent requests (with session ID header)

Our implementation was skipping step 1 and trying to start at step 4.

## The Solution

### Server Changes (`src/index.ts`)

Implemented proper per-session transport management:

```typescript
// ✅ CORRECT - Store transports by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing session
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New session initialization
    const newSessionId = randomUUID();
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
    });

    // Store transport immediately
    transports[newSessionId] = transport;

    // Set up cleanup handler
    transport.onclose = async () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };

    // Connect server to this transport
    const { server } = createServer();
    await server.connect(transport);
  } else {
    // Invalid request
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: Server not initialized",
      },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});
```

**Key improvements:**
- Each session gets its own transport instance
- Transports are stored in a map keyed by session ID
- Session ID is pre-generated and stored before handling the initialize request
- Proper cleanup when sessions close
- Support for GET/DELETE methods for streaming and cleanup

### Client Changes (All Agent Scripts)

Removed client-provided session IDs to let the server assign them:

```javascript
// ✅ CORRECT - Let server assign session ID
const mcpServer = new MCPServerStreamableHttp({
  url: 'http://localhost:3000/mcp',
  // No sessionId parameter
});

// Or for Vercel AI SDK:
const mcpClient = await createMCPClient({
  transport: new StreamableHTTPClientTransport(new URL(url)),
  // No sessionId in options
});
```

**Files updated:**
- `scripts/agent.mjs` - Single OpenAI agent
- `scripts/multi-agent.mjs` - Multiple concurrent agents
- `scripts/vercel-ai-agent.mjs` - Vercel AI SDK client

## How to Avoid This in the Future

### 1. **Follow MCP Protocol Documentation**

Always refer to the official MCP SDK examples for Streamable HTTP transport:
- [TypeScript SDK Examples](https://github.com/modelcontextprotocol/typescript-sdk/tree/main/src/examples)
- Review session management patterns before implementation

### 2. **Understand Session vs Stateless Modes**

**Stateless Mode** (`sessionIdGenerator: undefined`):
- Create a new transport for EACH request
- No session persistence between requests
- Suitable for simple request/response scenarios
- Example:
  ```typescript
  app.post('/mcp', async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on('close', () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  ```

**Session Mode** (with `sessionIdGenerator`):
- Store transports by session ID
- Reuse transports across multiple requests
- Required for stateful interactions
- Better for agent workflows with multiple tool calls

### 3. **Let the Server Control Session IDs**

**Rule:** Never provide a `sessionId` when creating MCP clients unless you're explicitly reconnecting to an existing session.

```javascript
// ✅ Good - New connection
const client = new MCPServerStreamableHttp({ url });

// ❌ Bad - Pre-generated session ID
const client = new MCPServerStreamableHttp({ 
  url, 
  sessionId: 'my-custom-id' 
});

// ✅ Good - Reconnecting to existing session (advanced use case)
const client = new MCPServerStreamableHttp({ 
  url, 
  sessionId: existingSessionIdFromServer 
});
```

### 4. **Implement Proper Error Handling**

Add logging to understand the request flow:

```typescript
app.post("/mcp", async (req, res) => {
  console.log("Received MCP POST request:", req.body);
  const sessionId = req.headers["mcp-session-id"];
  console.log("Session ID:", sessionId || "none");
  
  // ... handle request
});
```

### 5. **Test Session Lifecycle**

Verify these scenarios work:
- ✅ New session initialization
- ✅ Reusing existing session across multiple requests
- ✅ Multiple concurrent sessions (multi-agent)
- ✅ Session cleanup on client disconnect
- ✅ Proper error responses for invalid sessions

### 6. **Check for Initialize Requests**

Always use the SDK helper to detect initialize requests:

```typescript
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

if (isInitializeRequest(req.body)) {
  // Handle new session
}
```

### 7. **Pre-Store Session IDs**

When creating a new session, store the transport BEFORE handling the initialize request:

```typescript
// ✅ Good - Pre-store
const newSessionId = randomUUID();
transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => newSessionId,
});
transports[newSessionId] = transport; // Store immediately
await server.connect(transport);

// ❌ Bad - Store after
await transport.handleRequest(req, res, req.body);
if (transport.sessionId) {
  transports[transport.sessionId] = transport; // Too late!
}
```

This ensures the `notifications/initialized` message (sent immediately after `initialize`) can find the transport.

## Verification

After implementing the fix, all three agent scripts work correctly:

```bash
# Single agent
pnpm agent
# Output: Successfully retrieves weather alerts for CA

# Multiple concurrent agents
pnpm agents:multi
# Output: Both agents execute in parallel with separate sessions

# Vercel AI SDK integration
pnpm vercel:agent
# Output: Discovers and lists available MCP tools
```

Server logs show proper session management:
```
Initializing new session
Session pre-stored: 6d5ce797-433e-4aa5-9099-b080d483ea9a
Reusing session: 6d5ce797-433e-4aa5-9099-b080d483ea9a
```

## Additional Resources

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Streamable HTTP Transport Documentation](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/src/examples/README.md)
