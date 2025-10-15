# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Express.js-based Model Context Protocol (MCP) server that provides weather data tools via the National Weather Service API. It uses Streamable HTTP Transport from the MCP SDK and is designed to be deployed on Vercel.

## Build and Development Commands

- `pnpm install` - Install dependencies (prefer pnpm for lockfile consistency)
- `pnpm build` - Compile TypeScript to `build/` directory and make binaries executable
- `pnpm dev` - Run development mode with TypeScript watch + nodemon hot reload
- `pnpm watch` - Run TypeScript compiler in watch mode only
- `pnpm start` - Start the production server (must run `pnpm build` first)
- `pnpm agent` - Run single agent test against the MCP server (uses OpenAI Agents SDK)
- `pnpm agents:multi` - Run two agents concurrently to test parallel MCP connections

Note: No automated tests are configured yet. The `pnpm test` script is a placeholder.

## Architecture

### Core Module Separation

The application is split into two main TypeScript modules:

1. **src/index.ts** - Bootstrap and transport layer
   - Initializes Express app and middleware (CORS, JSON parsing, static files)
   - Creates `StreamableHTTPServerTransport` configured for stateless operation
   - Exposes `POST /mcp` endpoint that delegates to transport's `handleRequest`
   - **Critical**: Uses `setupPromise` pattern (line 84) to ensure server initialization completes before handling requests
   - MCP endpoint awaits `setupPromise` (line 37) to prevent race conditions on startup
   - Handles server lifecycle (startup, shutdown via SIGINT)
   - Connects the MCP server instance to the transport

2. **src/create-server.ts** - MCP tool definitions and business logic
   - Exports `createServer()` factory that instantiates `McpServer` from SDK
   - Registers weather tools: `get-alerts` and `get-forecast`
   - Contains NWS API integration logic with error handling
   - Defines TypeScript interfaces for API responses and formatting helpers

### MCP Protocol Integration

The server uses the `@modelcontextprotocol/sdk` package with Streamable HTTP transport. The transport is stateless (`sessionIdGenerator: undefined`), meaning each request is independent. The MCP endpoint at `/mcp` accepts only POST requests and returns JSON-RPC 2.0 formatted responses.

### Weather Tools

Two tools are exposed via the MCP protocol:

- **get-alerts**: Requires 2-letter US state code, queries `/alerts?area={STATE}`
- **get-forecast**: Requires latitude/longitude, makes two-step API call:
  1. GET `/points/{lat},{lon}` to retrieve grid point data
  2. GET forecast URL from grid point response

All NWS requests include `User-Agent: weather-app/1.0` header and accept `application/geo+json`.

## Configuration

Environment variables are loaded via `dotenv`:
- `PORT` - Server port (defaults to 3000)
- `MCP_URL` - MCP server URL for agent scripts (defaults to `http://localhost:3000/mcp`)
- `AGENT_PROMPT` - Custom prompt for single agent test (scripts/agent.mjs)
- `AGENT_A_PROMPT` - Custom prompt for Agent A in multi-agent test
- `AGENT_B_PROMPT` - Custom prompt for Agent B in multi-agent test
- `MCP_SESSION_ID` - Override session ID for agent connections (auto-generated if not provided)

The NWS API requires a valid User-Agent. The current value is `weather-app/1.0` defined in `src/create-server.ts:5`. Update this if deploying under a different identity.

## Testing the MCP Server

### Option 1: OpenAI Agents SDK (Recommended)

The repository includes agent test scripts using `@openai/agents`:

1. **Single Agent Test** (`scripts/agent.mjs`):
   - Connects one agent to the MCP server with session management
   - Includes reconnection logic for "Server already initialized" errors
   - Run: `pnpm agent` or `AGENT_PROMPT="your prompt" pnpm agent`

2. **Multi-Agent Test** (`scripts/multi-agent.mjs`):
   - Runs two agents concurrently with independent sessions
   - Demonstrates parallel MCP connections and session isolation
   - Run: `pnpm agents:multi`

**Agent Architecture**: Both scripts use `MCPServerStreamableHttp` from `@openai/agents` to connect to the MCP server. Each agent gets a unique `sessionId` to maintain isolated contexts. The single-agent script implements retry logic that handles session conflicts by creating fresh connections.

### Option 2: MCP Inspector

Connect to the server using [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector). Always include the `/mcp` path in the connection URL (e.g., `http://localhost:3000/mcp` or `https://your-deployment.vercel.app/mcp`).

## TypeScript Configuration

- Target: ES2022 with NodeNext module resolution
- Source: `src/` directory
- Output: `build/` directory (never edit manually)
- Strict mode enabled with all type-checking flags
- Source maps and declarations are generated

## Coding Conventions

- Use 2-space indentation and double quotes for strings
- ESM modules with `.js` extension in imports (e.g., `./create-server.js`)
- `camelCase` for functions/variables, `PascalCase` for types/interfaces
- Centralize side effects at module top (environment loading, transport wiring)
- Export factory functions for composability
- Document non-obvious logic with brief comments
