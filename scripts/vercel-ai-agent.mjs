/**
 * Vercel AI SDK + MCP Demo
 *
 * Connects to MCP server via Streamable HTTP and uses Vercel AI SDK
 * with OpenAI for tool-augmented text generation.
 */
import 'dotenv/config';
import { experimental_createMCPClient as createMCPClient, generateText, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
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
    // Note: tools handle is passed directly to generateText; not enumerable with Object.keys

    // Initialize OpenAI provider (uses OPENAI_API_KEY from env by default)
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY');
    }

    // Configure user instruction (can be overridden via AGENT_PROMPT env var)
    const userInstruction = process.env.AGENT_PROMPT ||
      'Get active weather alerts for CA, then the forecast for 37.7749,-122.4194. After calling tools, produce a concise final summary. Do not end with a tool call.';

    // Generate text with tool calling enabled (cookbook pattern uses messages)
    const result = await generateText({
      model: openai('gpt-4o'),
      tools,
      messages: [
        { role: 'system', content: 'You can call MCP tools. Always provide a final concise summary.' },
        { role: 'user', content: userInstruction },
      ],
      toolChoice: 'auto',
      maxToolRoundtrips: 1,
      temperature: 0.2,
      stopWhen: stepCountIs(2),
    });

    console.log(`Prompt: ${userInstruction}\n`);
    console.log(`Response: ${result.text || '(empty text)'}\n`);
    
    if (result.toolResults && result.toolResults.length) {
      console.log('--- Tool call trace ---');
      for (const tr of result.toolResults) {
        console.log(`[${tr.toolName}] state=${tr.state}`);
        if (tr.result) console.log(tr.result);
        if (tr.error) console.error(tr.error);
      }
      console.log('-----------------------');
    }
  } finally {
    await mcpClient.close();
  }
 }

 main().catch((err) => {
   console.error(err);
   process.exit(1);
 });
