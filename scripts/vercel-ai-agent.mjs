/**
 * Vercel AI SDK + MCP Demo
 *
 * Connects to MCP server via Streamable HTTP and uses Vercel AI SDK
 * with OpenAI for tool-augmented text generation.
 */
import 'dotenv/config';
import { experimental_createMCPClient as createMCPClient, generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function main() {
  const url = process.env.MCP_URL || 'http://localhost:3000/mcp';

  console.log(`[Vercel AI SDK] Connecting to MCP server: ${url}`);

  // Create MCP client with Streamable HTTP transport
  const mcpClient = await createMCPClient({
    transport: new StreamableHTTPClientTransport(new URL(url)),
  });

  try {
    // Discover available tools from MCP server
    const tools = await mcpClient.tools();

    const toolNames = Object.keys(tools || {});
    console.log('Discovered MCP tools:');

    if (!toolNames.length) {
      console.log('No tools discovered. Ensure the MCP server is running.');
      return;
    }

    console.log('Discovered MCP tools:');
    toolNames.forEach(name => console.log(`- ${name}`));

    // Initialize OpenAI provider
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Configure prompt (can be overridden via AGENT_PROMPT env var)
    const prompt = process.env.AGENT_PROMPT ||
      'Get active weather alerts for CA, then the forecast for 37.7749,-122.4194.';

    // Generate text with tool calling enabled
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      tools,
      prompt,
    });

    console.log(`Prompt: ${prompt}\n`);
    console.log(`Response: ${text}`);
  } finally {
    await mcpClient.close();
  }
 }

 main().catch((err) => {
   console.error(err);
   process.exit(1);
 });
