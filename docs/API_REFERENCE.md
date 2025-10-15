# API Reference & Integration Guide

## MCP Endpoint

**Base URL:** `http://localhost:3000/mcp` (local) or `https://your-deployment.vercel.app/mcp` (production)

**Protocol:** JSON-RPC 2.0 over HTTP

**Transport:** Streamable HTTP (MCP SDK)

---

## HTTP Requirements

### Required Headers

```http
POST /mcp HTTP/1.1
Content-Type: application/json
Accept: application/json, text/event-stream
```

**Critical:** The `Accept` header MUST include both `application/json` and `text/event-stream` for the Streamable HTTP transport to work.

### Supported Methods

| Method | Endpoint | Status | Description |
|--------|----------|--------|-------------|
| **POST** | `/mcp` | ✅ 200 | MCP protocol requests |
| **GET** | `/mcp` | ❌ 405 | Method not allowed |
| **DELETE** | `/mcp` | ❌ 405 | Method not allowed |
| **GET** | `/` | ✅ 200 | Static HTML page |

---

## MCP Protocol Flow

### 1. Initialize Connection

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "my-client",
      "version": "1.0.0"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {}
    },
    "serverInfo": {
      "name": "weather",
      "version": "1.0.0"
    }
  }
}
```

---

### 2. List Available Tools

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "get-alerts",
        "description": "Get weather alerts for a state",
        "inputSchema": {
          "type": "object",
          "properties": {
            "state": {
              "type": "string",
              "description": "Two-letter state code (e.g. CA, NY)"
            }
          },
          "required": ["state"]
        }
      },
      {
        "name": "get-forecast",
        "description": "Get weather forecast for a location",
        "inputSchema": {
          "type": "object",
          "properties": {
            "latitude": {
              "type": "number",
              "description": "Latitude of the location",
              "minimum": -90,
              "maximum": 90
            },
            "longitude": {
              "type": "number",
              "description": "Longitude of the location",
              "minimum": -180,
              "maximum": 180
            }
          },
          "required": ["latitude", "longitude"]
        }
      }
    ]
  }
}
```

---

## Tool Reference

### Tool: get-alerts

**Description:** Retrieve active weather alerts for a US state

**Input Schema:**
```typescript
{
  state: string // 2-letter state code (e.g., "CA", "NY", "TX")
}
```

**Validation Rules:**
- Must be exactly 2 characters
- Automatically converted to uppercase
- US state codes only (NWS API limitation)

**Request Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get-alerts",
    "arguments": {
      "state": "CA"
    }
  }
}
```

**Success Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Active alerts for CA:\n\nEvent: Heat Advisory\nArea: San Francisco Bay Area\nSeverity: Moderate\nStatus: Actual\nHeadline: Heat Advisory until 8 PM PDT\n---\n\nEvent: Red Flag Warning\nArea: North Bay Mountains\nSeverity: Severe\nStatus: Actual\nHeadline: Red Flag Warning until 5 PM PDT\n---"
      }
    ]
  }
}
```

**No Alerts Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "No active alerts for CA"
      }
    ]
  }
}
```

**Error Response (API Failure):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Failed to retrieve alerts data"
      }
    ]
  }
}
```

---

### Tool: get-forecast

**Description:** Retrieve weather forecast for geographic coordinates (US locations only)

**Input Schema:**
```typescript
{
  latitude: number,  // -90 to 90
  longitude: number  // -180 to 180
}
```

**Validation Rules:**
- Latitude: -90 to 90 (inclusive)
- Longitude: -180 to 180 (inclusive)
- Coordinates rounded to 4 decimal places
- Only US locations supported by NWS API

**Request Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "get-forecast",
    "arguments": {
      "latitude": 37.7749,
      "longitude": -122.4194
    }
  }
}
```

**Success Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Forecast for 37.7749, -122.4194:\n\nTonight:\nTemperature: 55°F\nWind: 10 mph W\nPartly cloudy\n---\n\nTomorrow:\nTemperature: 68°F\nWind: 5 mph NW\nSunny\n---\n\nTomorrow Night:\nTemperature: 52°F\nWind: 8 mph W\nMostly clear\n---"
      }
    ]
  }
}
```

**Error Response (Invalid Location):**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Failed to retrieve grid point data for coordinates: 37.7749, -122.4194. This location may not be supported by the NWS API (only US locations are supported)."
      }
    ]
  }
}
```

**Error Response (No Forecast URL):**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Failed to get forecast URL from grid point data"
      }
    ]
  }
}
```

---

## Common Locations for Testing

| Location | Latitude | Longitude | Description |
|----------|----------|-----------|-------------|
| San Francisco, CA | 37.7749 | -122.4194 | West Coast |
| New York, NY | 40.7128 | -74.0060 | East Coast |
| Chicago, IL | 41.8781 | -87.6298 | Midwest |
| Miami, FL | 25.7617 | -80.1918 | Southeast |
| Seattle, WA | 47.6062 | -122.3321 | Pacific Northwest |
| Denver, CO | 39.7392 | -104.9903 | Mountain |

---

## Error Codes

### JSON-RPC Errors

| Code | Message | Cause |
|------|---------|-------|
| **-32700** | Parse error | Invalid JSON |
| **-32600** | Invalid Request | Malformed JSON-RPC |
| **-32601** | Method not found | Unknown method |
| **-32602** | Invalid params | Schema validation failed |
| **-32603** | Internal error | Server error |
| **-32000** | Method not allowed | GET/DELETE on /mcp |

### MCP-Specific Errors

| Error | Cause | Solution |
|-------|-------|----------|
| **Not Acceptable** | Missing Accept header | Add `Accept: application/json, text/event-stream` |
| **Server not initialized** | No initialize call | Call `initialize` method first |
| **Server already initialized** | Duplicate initialize | Use unique session ID or reconnect |

---

## Integration Examples

### cURL

**Initialize:**
```bash
curl -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "curl-client", "version": "1.0.0"}
    }
  }'
```

**Get Alerts:**
```bash
curl -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get-alerts",
      "arguments": {"state": "CA"}
    }
  }'
```

---

### JavaScript (Node.js)

```javascript
import { MCPServerStreamableHttp } from '@openai/agents';

const mcpServer = new MCPServerStreamableHttp({
  url: 'http://localhost:3000/mcp',
  name: 'Weather MCP Server',
  sessionId: `session-${Date.now()}`,
});

await mcpServer.connect();

// Server is now initialized and ready for tool calls
```

---

### Python

```python
import requests
import json

url = "http://localhost:3000/mcp"
headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream"
}

# Initialize
init_payload = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "python-client", "version": "1.0.0"}
    }
}

response = requests.post(url, headers=headers, json=init_payload)
print(response.json())

# Get alerts
alerts_payload = {
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
        "name": "get-alerts",
        "arguments": {"state": "CA"}
    }
}

response = requests.post(url, headers=headers, json=alerts_payload)
print(response.json())
```

---

## Rate Limiting & Best Practices

### National Weather Service API

- **No API key required**
- **Rate limit:** Not officially documented, but be respectful
- **User-Agent required:** Must identify your application
- **Caching recommended:** Forecast data changes slowly (hourly)
- **US locations only:** API does not support international coordinates

### Best Practices

1. **Session Management:** Use unique session IDs for each client
2. **Error Handling:** Always check for null/error responses
3. **Caching:** Cache forecast data for 30-60 minutes
4. **Retry Logic:** Implement exponential backoff for API failures
5. **Validation:** Validate coordinates before calling API
6. **User-Agent:** Update to your own identifier in production

---

## Deployment Considerations

### Vercel Deployment

- **Cold starts:** Server initialization happens on first request
- **Timeout:** 10 seconds for Hobby plan, 60s for Pro
- **Regions:** Deploy close to your users
- **Environment:** Set `PORT` is not needed (Vercel handles this)

### Security

- **CORS:** Currently allows all origins (`origin: true`)
- **Rate limiting:** Not implemented (consider adding for production)
- **Authentication:** Not implemented (MCP protocol supports auth)
- **HTTPS:** Required for production deployments

### Monitoring

**Key Metrics:**
- Request latency to NWS API
- Tool execution success rate
- Session initialization failures
- Error rate by tool

**Logging:**
- All requests logged to console
- Errors logged with stack traces
- Consider structured logging for production
