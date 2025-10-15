# Component Reference & Function Documentation

## Module Overview

### `src/index.ts` - Express Server Bootstrap

**Purpose:** Initialize and configure the Express HTTP server, wire MCP transport, and handle lifecycle management.

**Key Responsibilities:**
- Load environment configuration
- Configure Express middleware (JSON parsing, CORS, static files)
- Register HTTP routes
- Connect MCP server to transport
- Handle graceful shutdown

#### Functions

##### Main Bootstrap (Module Level)

**Operations:**
1. Load environment variables via `dotenv.config()`
2. Create Express app instance
3. Apply middleware stack
4. Initialize `StreamableHTTPServerTransport`
5. Register route handlers
6. Create MCP server via `createServer()`
7. Execute async setup and start listening

**Code Location:** Lines 1-96

---

##### `POST /mcp` Handler

**Signature:** `async (req: Request, res: Response) => void`

**Purpose:** Handle all MCP protocol requests via HTTP POST

**Flow:**
1. Log incoming request body
2. Await `setupPromise` to ensure server is initialized
3. Delegate request to `transport.handleRequest(req, res, req.body)`
4. Catch errors and return JSON-RPC error response

**Error Handling:**
- Returns 500 status with JSON-RPC error format
- Only sends error if headers not already sent
- Logs error to console

**Code Location:** Lines 33-52

---

##### `methodNotAllowed()`

**Signature:** `(req: Request, res: Response) => void`

**Purpose:** Reject non-POST requests to `/mcp` endpoint

**Response:**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Method not allowed."
  },
  "id": null
}
```

**Code Location:** Lines 55-65

---

##### `setupServer()`

**Signature:** `async () => Promise<void>`

**Purpose:** Connect MCP server to transport layer

**Flow:**
1. Call `await server.connect(transport)`
2. Log success message
3. Throw error on failure

**Code Location:** Lines 73-81

---

##### SIGINT Handler

**Purpose:** Graceful shutdown on Ctrl+C or process termination

**Flow:**
1. Log shutdown message
2. Close transport connection
3. Close MCP server
4. Exit process with code 0

**Error Handling:** Logs errors but continues shutdown sequence

**Code Location:** Lines 99-115

---

## `src/create-server.ts` - MCP Server Factory

**Purpose:** Create and configure the MCP server with weather tools

**Exports:** `createServer()` function

---

### Functions

#### `createServer()`

**Signature:** `() => { server: McpServer }`

**Purpose:** Factory function that creates and configures MCP server instance

**Flow:**
1. Instantiate `McpServer` with name "weather" and version "1.0.0"
2. Register `get-alerts` tool with Zod schema and handler
3. Register `get-forecast` tool with Zod schema and handler
4. Return server object

**Code Location:** Lines 74-236

---

#### `makeNWSRequest<T>()`

**Signature:** `async <T>(url: string): Promise<T | null>`

**Purpose:** Generic HTTP client for National Weather Service API

**Parameters:**
- `url` - Full URL to NWS API endpoint

**Headers:**
- `User-Agent: weather-app/1.0`
- `Accept: application/geo+json`

**Return:**
- Typed data `T` on success
- `null` on error

**Error Handling:**
- Catches fetch errors
- Checks `response.ok` status
- Logs errors to console
- Returns null instead of throwing

**Code Location:** Lines 8-24

---

#### `formatAlert()`

**Signature:** `(feature: AlertFeature) => string`

**Purpose:** Transform NWS alert feature into human-readable text

**Input:**
```typescript
interface AlertFeature {
  properties: {
    event?: string;
    areaDesc?: string;
    severity?: string;
    status?: string;
    headline?: string;
  };
}
```

**Output Format:**
```
Event: Heat Advisory
Area: San Francisco Bay Area
Severity: Moderate
Status: Actual
Headline: Heat Advisory until 8 PM PDT
---
```

**Code Location:** Lines 37-47

---

### Tool: get-alerts

**Registration:** `server.tool("get-alerts", ...)`

**Description:** "Get weather alerts for a state"

**Input Schema:**
```typescript
{
  state: z.string()
    .length(2)
    .describe("Two-letter state code (e.g. CA, NY)")
}
```

**Handler Flow:**
1. Convert state to uppercase
2. Build URL: `${NWS_API_BASE}/alerts?area=${stateCode}`
3. Call `makeNWSRequest<AlertsResponse>(alertsUrl)`
4. Handle null response (API failure)
5. Check if features array is empty
6. Map features through `formatAlert()`
7. Build formatted text response
8. Return MCP content response

**Response Format:**
```typescript
{
  content: [
    {
      type: "text",
      text: "Active alerts for CA:\n\n[formatted alerts]"
    }
  ]
}
```

**Code Location:** Lines 82-133

---

### Tool: get-forecast

**Registration:** `server.tool("get-forecast", ...)`

**Description:** "Get weather forecast for a location"

**Input Schema:**
```typescript
{
  latitude: z.number()
    .min(-90)
    .max(90)
    .describe("Latitude of the location"),
  longitude: z.number()
    .min(-180)
    .max(180)
    .describe("Longitude of the location")
}
```

**Handler Flow:**
1. Format coordinates to 4 decimal places
2. Build points URL: `${NWS_API_BASE}/points/${lat},${lon}`
3. Call `makeNWSRequest<PointsResponse>(pointsUrl)`
4. Handle null response (location not supported)
5. Extract forecast URL from points response
6. Call `makeNWSRequest<ForecastResponse>(forecastUrl)`
7. Handle null response (forecast unavailable)
8. Extract periods array
9. Format each period with temperature, wind, and description
10. Build formatted text response
11. Return MCP content response

**Response Format:**
```typescript
{
  content: [
    {
      type: "text",
      text: "Forecast for 37.7749, -122.4194:\n\n[formatted periods]"
    }
  ]
}
```

**Period Format:**
```
Tonight:
Temperature: 55°F
Wind: 10 mph W
Partly cloudy
---
```

**Code Location:** Lines 135-233

---

## Client Scripts

### `scripts/agent.mjs` - Single Agent

**Purpose:** Run a single OpenAI agent connected to MCP server

**Configuration:**
- `MCP_URL` - Server endpoint (default: http://localhost:3000/mcp)
- `AGENT_PROMPT` - Custom prompt (default: "What are the current weather alerts in CA?")
- `MCP_SESSION_ID` - Override session ID (optional)

**Flow:**
1. Generate unique session ID
2. Create `MCPServerStreamableHttp` client
3. Create `Agent` with instructions
4. Connect to MCP server
5. Handle "already initialized" errors by reconnecting
6. Run agent with prompt
7. Output result
8. Close connection

**Error Recovery:** Automatically creates new session if initialization conflict detected

**Code Location:** Lines 1-51

---

### `scripts/multi-agent.mjs` - Parallel Agents

**Purpose:** Run two agents concurrently with separate MCP sessions

**Configuration:**
- `MCP_URL` - Server endpoint
- `AGENT_A_PROMPT` - Agent A prompt (default: list tools)
- `AGENT_B_PROMPT` - Agent B prompt (default: forecast query)

**Flow:**
1. Create two MCP clients with unique session IDs
2. Create two agents with different instructions
3. Connect both clients in parallel
4. Run both agents concurrently with `Promise.all`
5. Output both results
6. Close both connections

**Concurrency:** Uses `Promise.all` for true parallel execution

**Code Location:** Lines 1-56

---

### `scripts/vercel-ai-agent.mjs` - Vercel AI SDK

**Purpose:** Demonstrate Vercel AI SDK integration with MCP

**Configuration:**
- `MCP_URL` - Server endpoint
- `MCP_SESSION_ID` - Session ID (optional)

**Flow:**
1. Create MCP client via `experimental_createMCPClient`
2. Use `StreamableHTTPClientTransport`
3. Discover tools via `mcpClient.tools()`
4. List discovered tool names
5. Close connection

**Note:** This is a discovery demo; full agent execution would require passing tools to `generateText` or `streamText`

**Code Location:** Lines 1-42

---

## Type Definitions

### Alert Types

```typescript
interface AlertFeature {
  properties: {
    event?: string;
    areaDesc?: string;
    severity?: string;
    status?: string;
    headline?: string;
  };
}

interface AlertsResponse {
  features: AlertFeature[];
}
```

### Forecast Types

```typescript
interface ForecastPeriod {
  name?: string;
  temperature?: number;
  temperatureUnit?: string;
  windSpeed?: string;
  windDirection?: string;
  shortForecast?: string;
}

interface PointsResponse {
  properties: {
    forecast?: string;
  };
}

interface ForecastResponse {
  properties: {
    periods: ForecastPeriod[];
  };
}
```

---

## Constants

### NWS API Configuration

```typescript
const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";
```

**Note:** Update `USER_AGENT` to your own identifier if publishing this service.

---

## Error Handling Patterns

### Transport Layer Errors

**JSON-RPC Format:**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32603,
    "message": "Internal server error"
  },
  "id": null
}
```

### Tool Execution Errors

**Graceful Degradation:**
- API failures return descriptive error messages
- No exceptions thrown to client
- Null checks at each step
- User-friendly error text in MCP response

**Example:**
```typescript
{
  content: [
    {
      type: "text",
      text: "Failed to retrieve alerts data"
    }
  ]
}
```
