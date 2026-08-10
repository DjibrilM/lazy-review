import { completion, loadModel, GEMMA4_4B_MULTIMODAL_Q6_K } from '@qvac/sdk';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

const MODEL_ID = 'GEMMA4_4B_MULTIMODAL_Q6_K';

// ----------------------------------------------------------------------
// Tool Implementations
// ----------------------------------------------------------------------

export function readFile({ file_path }: { file_path: string }) {
  const absolutePath = path.resolve(process.cwd(), file_path);
  const content = fs.readFileSync(absolutePath, 'utf-8');
  return content;
}

export function writeFile({ content, file_path }: { file_path: string; content: string }) {
  const absolutePath = path.resolve(process.cwd(), file_path);
  fs.writeFileSync(absolutePath, content, 'utf-8');
  return content;
}

export function runBashCommand({ command }: { command: string }) {
  console.log('🤖 [Executing Bash] ', command);
  try {
    const output = execSync(command, {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });
    return output || 'Command executed successfully with no output.';
  } catch (error: any) {
    return `Error: ${error.message}\n${error.stdout || ''}\n${error.stderr || ''}`;
  }
}

const toolImplementations: Record<string, Function> = {
  Read: readFile,
  Write: writeFile,
  Bash: runBashCommand,
};

// ----------------------------------------------------------------------
// Main Agentic Loop
// ----------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const promptIndex = args.indexOf('-p');
  if (promptIndex === -1 || !args[promptIndex + 1]) {
    console.error('Error: -p <prompt> flag is required');
    process.exit(1);
  }
  const userPrompt = args[promptIndex + 1];

  let qwenLoadedId = MODEL_ID;
  try {
    console.log(`⏳ Loading model ${MODEL_ID}...`);
    qwenLoadedId = await loadModel({
      modelSrc: GEMMA4_4B_MULTIMODAL_Q6_K,
      modelConfig: {
        device: 'cpu',
        ctx_size: 128000,
      },
    });
    console.log(`✅ Model loaded: ${qwenLoadedId}`);
  } catch (e: any) {
    if (e?.code === 52200) {
      console.log(`✅ Model was already loaded.`);
      qwenLoadedId = GEMMA4_4B_MULTIMODAL_Q6_K.modelId;
    } else {
      console.error(`⚠️ Error loading model:`, e);
      process.exit(1);
    }
  }

  // Define the system prompt with strict rules and few-shot examples
  const systemPrompt = `You are an autonomous AI agent with access to the following tools:
1. Read: Read and returns file's contents. Arguments: {"file_path": "string"}
2. Write: Writes content to a file. Arguments: {"file_path": "string", "content": "string"}
3. Bash: Execute bash command. Arguments: {"command": "string"}

STRICT RULE: DO NOT output any <think> tags or thoughts. If you want to use a tool, output ONLY a JSON object with "name" and "arguments" keys. If you want to respond to the user without using a tool, output plain text.

Example Tool Call:
{"name": "Bash", "arguments": {"command": "ls -la"}}

Example Final Answer:
The task is complete.`;

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let keepLooping = true;
  let iteration = 0;
  const MAX_ITERATIONS = 10;

  console.log(`\n🚀 Starting Agent Loop with prompt: "${userPrompt}"\n`);

  while (keepLooping && iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n--- Iteration ${iteration} ---`);
    console.log('🤖 Agent is thinking...');

    const runCall = completion({
      modelId: qwenLoadedId,
      history: messages,
      stream: true,
      toolDialect: 'json',
      tools: [
        {
          name: 'Read',
          description: "Read and returns file's contents",
          parameters: z.object({
            file_path: z.string().describe('Path to the file to read'),
          }),
        },
        {
          name: 'Write',
          description: 'Writes content to a file',
          parameters: z.object({
            file_path: z.string().describe('Path to the file to write'),
            content: z.string().describe('Content to write to the file'),
          }),
        },
        {
          name: 'Bash',
          description: 'Execute bash command',
          parameters: z.object({
            command: z.string().describe('The bash command to execute'),
          }),
        },
      ],
    });

    if (runCall.events) {
      for await (const chunk of runCall.events as any) {
        if (chunk.type === 'contentDelta') {
          process.stdout.write(chunk.text);
        }
      }
    }

    const response = await runCall.final;
    const rawText = response.raw?.fullText || response.contentText || '';
    console.log(`\n\n`);

    messages.push({ role: 'assistant', content: rawText });

    const toolCalls = await response.toolCalls;
    let parsedToolCalls: any[] = [];

    console.log(toolCalls);

    if (toolCalls && toolCalls.length > 0) {
      // The qvac SDK parsed them successfully
      parsedToolCalls = toolCalls.map((tc: any) => ({
        name: tc.name || tc.function?.name,
        arguments: tc.arguments || tc.function?.arguments || tc.args,
      }));
    } else {
      // Fallback JSON Parser to detect tool calls (handling concatenated outputs or wrapped text)
      try {
        const jsonMatch = rawText.match(/{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.name && toolImplementations[parsed.name]) {
            parsedToolCalls.push({
              name: parsed.name,
              arguments: parsed.arguments || parsed.args,
            });
          } else if (parsed.command && toolImplementations[parsed.command]) {
            parsedToolCalls.push({
              name: parsed.command,
              arguments: parsed.args,
            });
          }
        }
      } catch (e) {
        // Not a valid JSON, meaning the agent is likely just talking
      }
    }

    if (parsedToolCalls.length > 0) {
      for (const parsedToolCall of parsedToolCalls) {
        console.log(`🔧 Executing Tool: ${parsedToolCall.name}`);
        try {
          const args =
            typeof parsedToolCall.arguments === 'string'
              ? JSON.parse(parsedToolCall.arguments)
              : parsedToolCall.arguments;

          const toolFn = toolImplementations[parsedToolCall.name];
          const result = toolFn(args);
          console.log(
            `✅ Tool Result: ${result.substring(0, 200)}${result.length > 200 ? '...' : ''}`,
          );

          // Feed the result back to the agent
          messages.push({
            role: 'user',
            content: `Tool Execution Result:\n${result}\n\nWhat is the next step? (Or provide the final answer)`,
          });
        } catch (err: any) {
          console.error(`❌ Tool Execution Failed: ${err.message}`);
          messages.push({
            role: 'user',
            content: `Tool Execution Failed:\n${err.message}\n\nPlease try again or use a different tool.`,
          });
        }
      } // End of for loop
    } else {
      // No tool call detected, assume it's a final conversational answer
      console.log('🎯 Agent has finished the task (no tool calls detected).');
      keepLooping = false;
    }
  }

  if (iteration >= MAX_ITERATIONS) {
    console.log('⚠️ Max iterations reached. Stopping loop to prevent infinite execution.');
  }
}

main().catch(console.error);
