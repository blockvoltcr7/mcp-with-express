import 'dotenv/config';
import { Agent, run, MCPServerStreamableHttp } from '@openai/agents';

async function main() {
  const url = process.env.MCP_URL || 'http://localhost:3000/mcp';
  const prompt = process.env.AGENT_PROMPT || 'What are the current weather alerts in CA?';

  // Don't provide sessionId - let the server assign one during initialization
  let mcpServer = new MCPServerStreamableHttp({
    url,
    name: 'Weather MCP Server',
    // cacheToolsList: true, // Optional: reduce tool discovery latency when tool list is stable
  });

  const agent = new Agent({
    name: 'Weather Assistant',
    instructions: 'Use the available MCP tools to answer weather questions.',
    mcpServers: [mcpServer],
  });

  try {
    try {
      await mcpServer.connect();
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('Server already initialized')) {
        // Create a fresh session and reconnect
        await mcpServer.close().catch(() => {});
        mcpServer = new MCPServerStreamableHttp({ url, name: 'Weather MCP Server' });
        // Rebind server to agent
        agent.mcpServers = [mcpServer];
        await mcpServer.connect();
      } else {
        throw e;
      }
    }
    const result = await run(agent, prompt);
    console.log(result.finalOutput);
  } finally {
    await mcpServer.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
