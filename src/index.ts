/**
  * Express + MCP Streamable HTTP Server
  *
  * Purpose
  * - HTTP entrypoint that exposes the MCP server created in `src/create-server.ts`.
  * - Wraps the MCP transport in an Express app and manages per-client sessions via the `mcp-session-id` header.
  *
  * Responsibilities
  * - Environment/bootstrap: load dotenv, configure CORS/static hosting, start the server.
  * - Session registry: track active `StreamableHTTPServerTransport` instances keyed by `mcp-session-id`.
  * - Request routing: forward POST/GET/DELETE requests to the correct transport for streaming or cleanup.
  * - Graceful shutdown: close all transports on SIGINT to avoid dangling sessions.
  *
  * Request flow
  * - POST /mcp
  *   - If body is an InitializeRequest and no `mcp-session-id` is provided, create a new session and connect the MCP server.
  *   - If `mcp-session-id` is provided and known, reuse that session to handle JSON-RPC requests.
  * - GET /mcp
  *   - Requires `mcp-session-id`. Streams response chunks for the identified session.
  * - DELETE /mcp
  *   - Requires `mcp-session-id`. Forwards cleanup semantics to the session transport.
  *
  * Session lifecycle
  * - New sessions are created when an InitializeRequest is received without an `mcp-session-id`.
  * - Sessions are stored in memory and keyed by `mcp-session-id`.
  * - Sessions are closed when the client sends a DELETE request with the `mcp-session-id`.
  * - Sessions are also closed during server shutdown (SIGINT) to avoid dangling sessions.
  *
  * Client integration
  * - Persist the `mcp-session-id` returned during initialization and include it on subsequent requests to reuse the same stream/session.
  * - Use POST for JSON-RPC requests, GET to consume streaming output, and DELETE to signal session cleanup.
  *
  * Endpoints
  * - POST /mcp: Initialize a session (when request is an InitializeRequest) or handle JSON-RPC requests for an existing session.
  * - GET /mcp: Stream responses for an existing session (requires `mcp-session-id`).
  * - DELETE /mcp: Forward session cleanup to the transport (requires `mcp-session-id`).
  *
  * Startup
  * - Loads dotenv, serves static assets from `public/`, enables CORS, and starts listening on `PORT`.
  * - Graceful shutdown closes all active transports on SIGINT.
  */
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./create-server.js";

// Environment setup
dotenv.config();
const PORT = process.env.PORT || 3000;

// Initialize Express app
const app = express();

// Middleware setup
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));
app.use(
  cors({
    origin: true,
    methods: "*",
    allowedHeaders: "Authorization, Origin, Content-Type, Accept, *",
  })
);
app.options("*", cors());

// Store active transports by session ID
/**
 * In-memory session registry for active Streamable MCP transports.
 *
 * Key: `mcp-session-id` header value provided by the client.
 * Value: A `StreamableHTTPServerTransport` that multiplexes streaming chunks
 *        across HTTP requests for that session.
 */
const transports: Record<string, StreamableHTTPServerTransport> = {};

// MCP endpoint - POST for requests
/**
 * MCP endpoint - POST for requests
 *
 * Behavior
 * - If `mcp-session-id` is present and known, reuse existing transport to handle the request.
 * - If no `mcp-session-id` is provided, create a new session and connect the MCP server.
 * - If an unknown `mcp-session-id` is provided, respond 400.
 *
 * Headers
 * - `mcp-session-id`: Optional on first initialize; required for subsequent requests to the same session.
 */
app.post("/mcp", async (req: Request, res: Response) => {
  console.log("Received MCP POST request:", req.body);
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;
  const initRequest = isInitializeRequest(req.body);

  try {
    if (sessionId && transports[sessionId]) {
      // Reuse existing session
      console.log(`Reusing session: ${sessionId}`);
      transport = transports[sessionId];
    } else if (initRequest) {
      // Initialize a new session; adopt provided sessionId if present
      const newSessionId = sessionId ?? randomUUID();
      console.log(
        `Initializing new session (adopt header: ${sessionId ? "yes" : "no"}): ${newSessionId}`
      );
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
      });

      // Store transport immediately with the session ID
      transports[newSessionId] = transport;
      console.log(`Session pre-stored: ${newSessionId}`);

      // Set up session lifecycle handlers
      const originalOnClose = transport.onclose;
      transport.onclose = async () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
          console.log(`Session closed: ${transport.sessionId}`);
        }
        if (originalOnClose) {
          await originalOnClose.call(transport);
        }
      };

      const { server } = createServer();
      await server.connect(transport);
    } else {
      console.error("Invalid session or request");
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: Invalid session",
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

/**
 * MCP endpoint - GET for streaming responses
 *
 * Behavior
 * - For an existing session, forwards the request to the session's transport to emit
 *   streaming chunks.
 * - Returns 400 if the `mcp-session-id` is missing or unknown.
 *
 * Headers
 * - `mcp-session-id`: Required. Identifies which session's stream to consume.
 */
app.get("/mcp", async (req: Request, res: Response) => {
  console.log("Received MCP GET request");
  const sessionId = req.headers["mcp-session-id"] as string;
  const transport = transports[sessionId];

  if (transport) {
    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling MCP GET request:", error);
      if (!res.headersSent) {
        res.status(500).send("Internal server error");
      }
    }
  } else {
    res.status(400).send("Invalid session");
  }
});

/**
 * MCP endpoint - DELETE for session cleanup
 *
 * Behavior
 * - Forwards cleanup to the session's transport.
 * - Returns 400 if the `mcp-session-id` is missing or unknown.
 *
 * Headers
 * - `mcp-session-id`: Required. Identifies which session to clean up.
 */
app.delete("/mcp", async (req: Request, res: Response) => {
  console.log("Received MCP DELETE request");
  const sessionId = req.headers["mcp-session-id"] as string;
  const transport = transports[sessionId];

  if (transport) {
    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling MCP DELETE request:", error);
      if (!res.headersSent) {
        res.status(500).send("Internal server error");
      }
    }
  } else {
    res.status(400).send("Invalid session");
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`MCP Streamable HTTP Server listening on port ${PORT}`);
});

/**
 * Handle server shutdown (SIGINT)
 *
 * Ensures all active transports are gracefully closed before process exit,
 * avoiding dangling sessions or open sockets.
 */
process.on("SIGINT", async () => {
  console.log("Shutting down server...");
  
  // Close all active transports
  for (const [sessionId, transport] of Object.entries(transports)) {
    try {
      console.log(`Closing transport for session: ${sessionId}`);
      await transport.close();
    } catch (error) {
      console.error(`Error closing transport ${sessionId}:`, error);
    }
  }

  console.log("Server shutdown complete");
  process.exit(0);
});
