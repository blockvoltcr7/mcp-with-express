import 'dotenv/config';
import { experimental_createMCPClient as createMCPClient } from 'ai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function main() {
  const url = process.env.MCP_URL || 'http://localhost:3000/mcp';
  const sessionId = process.env.MCP_SESSION_ID || `vercel-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  console.log(`[Vercel AI SDK] Connecting to MCP server: ${url}`);

  const mcpClient = await createMCPClient({
    transport: new StreamableHTTPClientTransport(new URL(url), { sessionId }),
  });

  try {
    // Auto-discover tools from the MCP server
    const tools = await mcpClient.tools();

    // tools is a registry compatible with the AI SDK; list keys for visibility
    const names = Object.keys(tools || {});
    if (!names.length) {
      console.log('No tools discovered. Ensure the MCP server is running and reachable.');
      return;
    }

    console.log('Discovered MCP tools via Vercel AI SDK:');
    for (const name of names) {
      console.log(`- ${name}`);
    }

    // Optionally, you could pass these tools into generateText/streamText
    // from the Vercel AI SDK to run a model that can call them.
  } finally {
    await mcpClient.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
