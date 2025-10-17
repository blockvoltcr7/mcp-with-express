import 'dotenv/config';
import { Agent, run, MCPServerStreamableHttp } from '@openai/agents';

/**
 * Weather Agent Runner Script
 *
 * Initializes an OpenAI Agent that connects to an MCP server for weather data.
 * Uses streaming HTTP transport for real-time communication with weather tools.
 */
async function main() {
  // Load MCP server URL from environment or default to localhost
  const url = process.env.MCP_URL || 'http://localhost:3000/mcp';

  // Load agent prompt from environment or use default weather query
  const prompt = process.env.AGENT_PROMPT || 'What are the current weather alerts in CA?';

  // Initialize MCP server with Streamable HTTP transport
  // MCP enables agents to access external tools; Streamable HTTP provides bidirectional streaming
  let mcpServer = new MCPServerStreamableHttp({
    url,  // Server endpoint URL
    name: 'Weather MCP Server',  // Human-readable identifier for this MCP connection
    // cacheToolsList: true, // Optional: reduce tool discovery latency when tool list is stable
  });

  // Initialize OpenAI Agent with MCP server access
  // Agent automatically discovers and uses weather tools from the connected MCP server
  const agent = new Agent({
    name: 'Weather Assistant',
    instructions: 'Use the available MCP tools to answer weather questions.',
    mcpServers: [mcpServer],
  });

  try {
    // Connect to MCP server
    await mcpServer.connect();

    // Run agent with prompt - streams tool calls/responses via MCP connection
    console.log(`Prompt: ${prompt}\n`);
    const result = await run(agent, prompt);
    console.log(`Response: ${result.finalOutput}`);
  } finally {
    // Ensure MCP connection is always closed
    await mcpServer.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
