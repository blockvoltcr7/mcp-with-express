# System Architecture Documentation

## Executive Summary

This system is a **Model Context Protocol (MCP) server** built with Express.js that exposes weather data tools to AI agents. It acts as a bridge between AI systems (like OpenAI agents) and the US National Weather Service API, allowing AI agents to retrieve real-time weather alerts and forecasts through a standardized protocol.

**Key Capabilities:**
- ✅ Provides weather alerts by US state (2-letter code)
- ✅ Provides weather forecasts by latitude/longitude coordinates
- ✅ Supports multiple concurrent AI agent sessions
- ✅ Deployable to Vercel with zero-config
- ✅ Fully typed with TypeScript and validated with Zod schemas

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ OpenAI Agent │  │ Multi-Agent  │  │ Vercel AI    │          │
│  │  (single)    │  │  (parallel)  │  │  SDK Client  │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
│         └──────────────────┴──────────────────┘                  │
│                            │                                      │
│                   HTTP POST /mcp                                 │
│                            │                                      │
└────────────────────────────┼──────────────────────────────────────┘
                             │
┌────────────────────────────┼──────────────────────────────────────┐
│                    TRANSPORT LAYER                                │
│                            │                                      │
│         ┌──────────────────▼───────────────────┐                 │
│         │ StreamableHTTPServerTransport        │                 │
│         │ (MCP Protocol Handler)               │                 │
│         │ - Session management                 │                 │
│         │ - JSON-RPC 2.0 protocol              │                 │
│         │ - SSE streaming support              │                 │
│         └──────────────────┬───────────────────┘                 │
│                            │                                      │
└────────────────────────────┼──────────────────────────────────────┘
                             │
┌────────────────────────────┼──────────────────────────────────────┐
│                      SERVER LAYER                                 │
│                            │                                      │
│         ┌──────────────────▼───────────────────┐                 │
│         │         McpServer                    │                 │
│         │  (Tool Registry & Execution)         │                 │
│         │                                      │                 │
│         │  ┌────────────────────────────────┐  │                 │
│         │  │  Tool: get-alerts              │  │                 │
│         │  │  Input: { state: "CA" }        │  │                 │
│         │  │  Validation: Zod schema        │  │                 │
│         │  └────────────────────────────────┘  │                 │
│         │                                      │                 │
│         │  ┌────────────────────────────────┐  │                 │
│         │  │  Tool: get-forecast            │  │                 │
│         │  │  Input: { lat, lon }           │  │                 │
│         │  │  Validation: Zod schema        │  │                 │
│         │  └────────────────────────────────┘  │                 │
│         └──────────────────┬───────────────────┘                 │
│                            │                                      │
└────────────────────────────┼──────────────────────────────────────┘
                             │
┌────────────────────────────┼──────────────────────────────────────┐
│                     DATA LAYER                                    │
│                            │                                      │
│         ┌──────────────────▼───────────────────┐                 │
│         │  National Weather Service API        │                 │
│         │  https://api.weather.gov             │                 │
│         │                                      │                 │
│         │  Endpoints:                          │                 │
│         │  • /alerts?area={STATE}              │                 │
│         │  • /points/{lat},{lon}               │                 │
│         │  • /gridpoints/{office}/{x},{y}      │                 │
│         └──────────────────────────────────────┘                 │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| **@modelcontextprotocol/sdk** | ^1.10.0 | MCP protocol implementation |
| **@openai/agents** | ^0.1.9 | OpenAI Agents SDK for agent scripts |
| **@ai-sdk/openai** | ^2.0.52 | Vercel AI SDK OpenAI provider |
| **ai** | ^5.0.68 | Vercel AI SDK for tool-augmented generation |
| **express** | ^4.21.2 | HTTP server framework |
| **cors** | ^2.8.5 | Cross-origin middleware |
| **dotenv** | ^16.4.7 | Environment variables |
| **zod** | ^3.25.76 | Schema validation |
| **node-fetch** | ^3.3.2 | HTTP client |

### Development Tools

- **TypeScript** ^5.7.3 - Type safety
- **nodemon** ^3.1.9 - Auto-restart
- **concurrently** ^8.2.2 - Parallel commands

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| **PORT** | No | 3000 | HTTP server port |
| **OPENAI_API_KEY** | Yes* | - | OpenAI API key (*for agent scripts) |
| **MCP_URL** | No | http://localhost:3000/mcp | MCP endpoint |
| **AGENT_PROMPT** | No | - | Custom agent prompt (single agent) |
| **AGENT_A_PROMPT** | No | - | Custom prompt for Agent A (multi-agent) |
| **AGENT_B_PROMPT** | No | - | Custom prompt for Agent B (multi-agent) |

### TypeScript Configuration

- **Target:** ES2022
- **Module:** NodeNext
- **Output:** `build/` directory
- **Strict mode:** Enabled

---

## Agent Scripts

The project includes three demonstration scripts showing different ways to integrate with the MCP server:

### 1. Single Agent (`scripts/agent.mjs`)

**Purpose:** Demonstrates basic OpenAI Agent integration with MCP tools.

**Usage:**
```bash
pnpm agent:local   # Connect to localhost
pnpm agent:prod    # Connect to production
```

**Features:**
- Uses `@openai/agents` SDK
- Single agent with MCP server connection
- Simplified error handling for demos
- Displays prompt and response in console

### 2. Multi-Agent (`scripts/multi-agent.mjs`)

**Purpose:** Demonstrates concurrent execution of multiple agents with separate MCP sessions.

**Usage:**
```bash
pnpm agents:multi:local   # Connect to localhost
pnpm agents:multi:prod    # Connect to production
```

**Features:**
- Two agents running in parallel
- Independent MCP server connections
- Different prompts for each agent
- Demonstrates session isolation

### 3. Vercel AI SDK Agent (`scripts/vercel-ai-agent.mjs`)

**Purpose:** Demonstrates integration using Vercel AI SDK instead of OpenAI Agents.

**Usage:**
```bash
pnpm vercel:agent:local   # Connect to localhost
pnpm vercel:agent:prod    # Connect to production
```

**Features:**
- Uses `ai` and `@ai-sdk/openai` packages
- Tool discovery via `mcpClient.tools()`
- `generateText()` with tool calling
- Alternative approach to OpenAI Agents

### 4. Run All Agents (`scripts/run-all-agents.mjs`)

**Purpose:** Executes all three agent scripts sequentially for comprehensive testing.

**Usage:**
```bash
pnpm agents:all:local   # Test all agents against localhost
pnpm agents:all:prod    # Test all agents against production
```

**Features:**
- Sequential execution to avoid conflicts
- Visual progress indicators
- Stops on first failure
- Comprehensive integration testing
