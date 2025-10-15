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
const transports: Record<string, StreamableHTTPServerTransport> = {};

// MCP endpoint - POST for requests
app.post("/mcp", async (req: Request, res: Response) => {
  console.log("Received MCP POST request:", req.body);
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  try {
    if (sessionId && transports[sessionId]) {
      // Reuse existing session
      console.log(`Reusing session: ${sessionId}`);
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New session initialization
      console.log("Initializing new session");
      const newSessionId = randomUUID();
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
          message: "Bad Request: Server not initialized",
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

// MCP endpoint - GET for streaming responses
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

// MCP endpoint - DELETE for session cleanup
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

// Handle server shutdown
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
