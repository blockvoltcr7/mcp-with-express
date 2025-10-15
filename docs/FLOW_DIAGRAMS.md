# Flow Diagrams & Execution Sequences

## Server Startup Sequence

```
┌─────────────────────────────────────────────────────────────────┐
│                    APPLICATION BOOTSTRAP                         │
└─────────────────────────────────────────────────────────────────┘

1. Load environment variables
   └─ dotenv.config()
   └─ Read PORT (default: 3000)

2. Initialize Express app
   └─ const app = express()

3. Configure middleware
   ├─ app.use(express.json())
   ├─ app.use(express.static("public"))
   └─ app.use(cors({ origin: true, ... }))

4. Create transport
   └─ new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

5. Register routes
   ├─ app.post("/mcp", async handler)
   ├─ app.get("/mcp", methodNotAllowed)
   └─ app.delete("/mcp", methodNotAllowed)

6. Create MCP server
   └─ const { server } = createServer()
      ├─ new McpServer({ name: "weather", version: "1.0.0" })
      ├─ server.tool("get-alerts", ...)
      └─ server.tool("get-forecast", ...)

7. Connect server to transport
   └─ setupPromise = setupServer()
      └─ await server.connect(transport)

8. Start HTTP server
   └─ app.listen(PORT)
   └─ Log: "MCP Streamable HTTP Server listening on port 3000"

9. Register shutdown handler
   └─ process.on("SIGINT", cleanup)
```

---

## Client Connection & Tool Discovery

```
CLIENT                          SERVER
  │                               │
  │  POST /mcp                    │
  │  { method: "initialize" }     │
  ├──────────────────────────────>│
  │                               │
  │                               ├─ Validate Accept headers
  │                               ├─ Create/retrieve session
  │                               └─ Return server capabilities
  │                               │
  │  { capabilities: {...} }      │
  │<──────────────────────────────┤
  │                               │
  │  POST /mcp                    │
  │  { method: "tools/list" }     │
  ├──────────────────────────────>│
  │                               │
  │                               ├─ Query registered tools
  │                               └─ Return tool schemas
  │                               │
  │  { tools: [                   │
  │    { name: "get-alerts",      │
  │      inputSchema: {...} },    │
  │    { name: "get-forecast",    │
  │      inputSchema: {...} }     │
  │  ]}                           │
  │<──────────────────────────────┤
  │                               │
```

---

## Tool Execution: get-alerts

```
CLIENT                          SERVER                      NWS API
  │                               │                            │
  │  POST /mcp                    │                            │
  │  { method: "tools/call",      │                            │
  │    params: {                  │                            │
  │      name: "get-alerts",      │                            │
  │      arguments: {             │                            │
  │        state: "CA"            │                            │
  │      }                        │                            │
  │    }                          │                            │
  │  }                            │                            │
  ├──────────────────────────────>│                            │
  │                               │                            │
  │                               ├─ Validate input with Zod   │
  │                               │  (state must be 2 chars)   │
  │                               │                            │
  │                               ├─ stateCode = "CA"          │
  │                               │                            │
  │                               │  GET /alerts?area=CA       │
  │                               ├───────────────────────────>│
  │                               │                            │
  │                               │                            ├─ Query alerts
  │                               │                            │  for California
  │                               │                            │
  │                               │  { features: [...] }       │
  │                               │<───────────────────────────┤
  │                               │                            │
  │                               ├─ formatAlert() for each    │
  │                               ├─ Build response text       │
  │                               │                            │
  │  { content: [                 │                            │
  │    { type: "text",            │                            │
  │      text: "Active alerts..." │                            │
  │    }                          │                            │
  │  ]}                           │                            │
  │<──────────────────────────────┤                            │
  │                               │                            │
```

---

## Tool Execution: get-forecast

```
CLIENT                          SERVER                      NWS API
  │                               │                            │
  │  POST /mcp                    │                            │
  │  { method: "tools/call",      │                            │
  │    params: {                  │                            │
  │      name: "get-forecast",    │                            │
  │      arguments: {             │                            │
  │        latitude: 37.7749,     │                            │
  │        longitude: -122.4194   │                            │
  │      }                        │                            │
  │    }                          │                            │
  │  }                            │                            │
  ├──────────────────────────────>│                            │
  │                               │                            │
  │                               ├─ Validate input with Zod   │
  │                               │  (lat: -90 to 90)          │
  │                               │  (lon: -180 to 180)        │
  │                               │                            │
  │                               │  GET /points/37.7749,-122.4194
  │                               ├───────────────────────────>│
  │                               │                            │
  │                               │                            ├─ Determine grid
  │                               │                            │  point for coords
  │                               │                            │
  │                               │  { properties: {           │
  │                               │    forecast: "https://..." │
  │                               │  }}                        │
  │                               │<───────────────────────────┤
  │                               │                            │
  │                               │  GET /gridpoints/...       │
  │                               ├───────────────────────────>│
  │                               │                            │
  │                               │                            ├─ Retrieve forecast
  │                               │                            │  periods
  │                               │                            │
  │                               │  { properties: {           │
  │                               │    periods: [...]          │
  │                               │  }}                        │
  │                               │<───────────────────────────┤
  │                               │                            │
  │                               ├─ Format each period        │
  │                               ├─ Build response text       │
  │                               │                            │
  │  { content: [                 │                            │
  │    { type: "text",            │                            │
  │      text: "Forecast for..." │                            │
  │    }                          │                            │
  │  ]}                           │                            │
  │<──────────────────────────────┤                            │
  │                               │                            │
```

---

## Complete Data Flow

```
[1] Agent Request
    │
    ├─ User prompt: "What are the weather alerts in CA?"
    │
    ▼
[2] MCP Client (OpenAI Agents SDK)
    │
    ├─ Analyze prompt
    ├─ Identify relevant tool: "get-alerts"
    ├─ Extract parameters: { state: "CA" }
    │
    ▼
[3] HTTP POST /mcp
    │
    ├─ Headers:
    │  ├─ Content-Type: application/json
    │  └─ Accept: application/json, text/event-stream
    │
    ├─ Body (JSON-RPC 2.0):
    │  {
    │    "jsonrpc": "2.0",
    │    "id": 1,
    │    "method": "tools/call",
    │    "params": {
    │      "name": "get-alerts",
    │      "arguments": { "state": "CA" }
    │    }
    │  }
    │
    ▼
[4] Express Middleware Chain
    │
    ├─ express.json() → Parse body
    ├─ cors() → Validate origin
    │
    ▼
[5] POST /mcp Handler
    │
    ├─ await setupPromise (ensure server ready)
    ├─ Log request body
    │
    ▼
[6] StreamableHTTPServerTransport
    │
    ├─ Validate session
    ├─ Parse JSON-RPC request
    ├─ Route to appropriate handler
    │
    ▼
[7] McpServer Tool Registry
    │
    ├─ Lookup tool: "get-alerts"
    ├─ Validate arguments with Zod schema
    │  └─ z.string().length(2) ✓
    │
    ▼
[8] Tool Handler Execution
    │
    ├─ stateCode = "CA"
    ├─ alertsUrl = "https://api.weather.gov/alerts?area=CA"
    │
    ▼
[9] makeNWSRequest()
    │
    ├─ Headers:
    │  ├─ User-Agent: "weather-app/1.0"
    │  └─ Accept: "application/geo+json"
    │
    ├─ fetch(alertsUrl)
    │
    ▼
[10] National Weather Service API
     │
     ├─ Query alerts database for California
     ├─ Return GeoJSON response
     │
     ▼
[11] Response Processing
     │
     ├─ Parse JSON
     ├─ Extract features array
     ├─ Map each feature through formatAlert()
     │
     ▼
[12] Format Alert Data
     │
     ├─ Extract: event, areaDesc, severity, status, headline
     ├─ Build multi-line string
     │
     ▼
[13] MCP Response Construction
     │
     ├─ Wrap in MCP content format:
     │  {
     │    "content": [
     │      {
     │        "type": "text",
     │        "text": "Active alerts for CA:\n\n..."
     │      }
     │    ]
     │  }
     │
     ▼
[14] JSON-RPC Response
     │
     ├─ Wrap in JSON-RPC envelope:
     │  {
     │    "jsonrpc": "2.0",
     │    "id": 1,
     │    "result": { ... }
     │  }
     │
     ▼
[15] HTTP Response
     │
     ├─ Status: 200 OK
     ├─ Content-Type: application/json
     │
     ▼
[16] MCP Client Processing
     │
     ├─ Parse JSON-RPC response
     ├─ Extract tool result
     ├─ Pass to agent for synthesis
     │
     ▼
[17] Agent Response
     │
     └─ Generate natural language response:
        "There are currently 3 active weather alerts in California..."
```

---

## Multi-Agent Parallel Execution

```
┌─────────────────────────────────────────────────────────────────┐
│                    PARALLEL AGENT EXECUTION                      │
└─────────────────────────────────────────────────────────────────┘

Time │ Agent A                      │ Agent B
─────┼──────────────────────────────┼──────────────────────────────
  0  │ Create MCP client (sessionA) │ Create MCP client (sessionB)
     │                              │
  1  │ Connect to /mcp              │ Connect to /mcp
     │ (initialize handshake)       │ (initialize handshake)
     │                              │
  2  │ List tools                   │ List tools
     │                              │
  3  │ Run prompt:                  │ Run prompt:
     │ "List available tools"       │ "Forecast for 37.7749,-122.4194"
     │                              │
  4  │ Call tools/list              │ Call get-forecast tool
     │                              │   ├─ /points/37.7749,-122.4194
     │                              │   └─ /gridpoints/...
     │                              │
  5  │ Receive tool schemas         │ Receive forecast data
     │                              │
  6  │ Generate response            │ Generate response
     │                              │
  7  │ Close connection             │ Close connection
     │                              │
  8  │ [Agent A] Output:            │ [Agent B] Output:
     │ "Available tools: ..."       │ "Forecast: Tonight 55°F..."
```
