import 'dotenv/config';
import { Agent, run, MCPServerStreamableHttp } from '@openai/agents';

async function main() {
  const url = process.env.MCP_URL || 'http://localhost:3000/mcp';
  const prompt = process.env.AGENT_PROMPT || 'What are the current weather alerts in CA?';

  // Generate a unique session for each run unless explicitly provided via env
  const makeSessionId = () => process.env.MCP_SESSION_ID || `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let mcpServer = new MCPServerStreamableHttp({
    url,
    name: 'Weather MCP Server',
    sessionId: makeSessionId(),
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
        mcpServer = new MCPServerStreamableHttp({ url, name: 'Weather MCP Server', sessionId: makeSessionId() });
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
