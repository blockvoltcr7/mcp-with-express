import 'dotenv/config';
import { Agent, run, MCPServerStreamableHttp } from '@openai/agents';

/**
 * Multi-Agent Runner Script
 *
 * Demonstrates running two OpenAI Agents concurrently, each with their own
 * MCP server connection. Shows how to handle parallel MCP sessions.
 */
async function main() {
  const url = process.env.MCP_URL || 'http://localhost:3000/mcp';

  // Create two independent MCP server sessions
  const mcpA = new MCPServerStreamableHttp({
    url,
    name: 'Weather MCP Server (A)',
  });
  const mcpB = new MCPServerStreamableHttp({
    url,
    name: 'Weather MCP Server (B)',
  });

  const agentAPrompt = 'List the available MCP tools and their input parameters.';

  // Create agents with different instructions
  const agentA = new Agent({
    name: 'Agent A',
    instructions: 'You can use the MCP tools to list capabilities and describe their inputs.',
    mcpServers: [mcpA],
  });

  const agentBPrompt = 'What is the forecast for 37.7749, -122.4194?';

  const agentB = new Agent({
    name: 'Agent B',
    instructions: 'Use the MCP tools to answer weather questions precisely.',
    mcpServers: [mcpB],
  });

  // Connect both MCP servers concurrently
  await Promise.all([mcpA.connect(), mcpB.connect()]);

  try {
    // Run both agents concurrently and collect results
    const [resA, resB] = await Promise.all([
      run(agentA, agentAPrompt),
      run(agentB, agentBPrompt),
    ]);

    console.log('[Agent A]');
    console.log(`Prompt: ${agentAPrompt}`);
    console.log(`Response: ${resA.finalOutput}\n`);

    console.log('[Agent B]');
    console.log(`Prompt: ${agentBPrompt}`);
    console.log(`Response: ${resB.finalOutput}\n`);
  } finally {
    // Clean up both connections
    await Promise.all([mcpA.close(), mcpB.close()]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
