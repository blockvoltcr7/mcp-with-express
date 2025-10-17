#!/usr/bin/env node

/**
 * Run All Agents Script
 *
 * Executes all three agent implementations in sequence:
 * 1. Single OpenAI Agent
 * 2. Multi-Agent (concurrent agents)
 * 3. Vercel AI SDK Agent
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scripts = [
  { name: 'Single Agent', file: 'agent.mjs' },
  { name: 'Multi-Agent', file: 'multi-agent.mjs' },
  { name: 'Vercel AI Agent', file: 'vercel-ai-agent.mjs' }
];

async function runScript(scriptPath, scriptName) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 Running ${scriptName}...`);
    console.log('='.repeat(50));

    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${scriptName} completed successfully\n`);
        resolve();
      } else {
        console.log(`❌ ${scriptName} failed with code ${code}\n`);
        reject(new Error(`${scriptName} failed with code ${code}`));
      }
    });

    child.on('error', (error) => {
      console.error(`❌ Error running ${scriptName}:`, error.message);
      reject(error);
    });
  });
}

async function main() {
  console.log('🎯 Running All Agent Scripts');
  console.log('This will execute all three agent implementations sequentially.\n');

  for (const script of scripts) {
    const scriptPath = join(__dirname, script.file);

    try {
      await runScript(scriptPath, script.name);
    } catch (error) {
      console.error(`Failed to run ${script.name}:`, error.message);
      process.exit(1);
    }
  }

  console.log('🎉 All agent scripts completed successfully!');
}

main().catch((error) => {
  console.error('Script execution failed:', error.message);
  process.exit(1);
});
