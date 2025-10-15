import 'dotenv/config';
import { Agent, run, MCPServerStreamableHttp } from '@openai/agents';

async function main() {
  const url = process.env.MCP_URL || 'http://localhost:3000/mcp';

  // Optional prompt overrides via env
  const promptA = process.env.AGENT_A_PROMPT || 'List the available MCP tools and their input parameters.';
  const promptB = process.env.AGENT_B_PROMPT || 'What is the forecast for 37.7749, -122.4194?';

  // Create two independent MCP HTTP sessions (unique sessionIds are helpful for logs)
  const mcpA = new MCPServerStreamableHttp({
    url,
    name: 'Weather MCP Server (A)',
    sessionId: `agentA-${Date.now()}`,
  });
  const mcpB = new MCPServerStreamableHttp({
    url,
    name: 'Weather MCP Server (B)',
    sessionId: `agentB-${Date.now()}`,
  });

  const agentA = new Agent({
    name: 'Agent A',
    instructions: 'You can use the MCP tools to list capabilities and describe their inputs.',
    mcpServers: [mcpA],
  });

  const agentB = new Agent({
    name: 'Agent B',
    instructions: 'Use the MCP tools to answer weather questions precisely.',
    mcpServers: [mcpB],
  });

  // Connect both sessions
  await Promise.all([mcpA.connect(), mcpB.connect()]);

  try {
    // Run both agents concurrently
    const [resA, resB] = await Promise.all([
      run(agentA, promptA),
      run(agentB, promptB),
    ]);

    console.log('[Agent A]\n' + resA.finalOutput + '\n');
    console.log('[Agent B]\n' + resB.finalOutput + '\n');
  } finally {
    await Promise.all([mcpA.close(), mcpB.close()]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
