import { completion, loadModel, startQVACProvider } from '@qvac/sdk';
import * as qvacModels from '@qvac/sdk';
import { QWEN_MODEL_ID } from './src/constants.js';

async function run() {
  await startQVACProvider();

  const qvacQwen = (qvacModels as any)[QWEN_MODEL_ID];
  let qwenLoadedId = QWEN_MODEL_ID;

  try {
    const loadPromise = loadModel({
      modelSrc: qvacQwen,
      modelConfig: { ctx_size: 4096 },
    });
    qwenLoadedId = await loadPromise;
    console.log('Model loaded:', qwenLoadedId);
  } catch (e) {
    console.log('Error or already loaded:', e?.code);
  }

  const systemPrompt = `You are an expert AI software architect.
Your research workflow:
1. Call list_dir on core directories.
2. Call read_file on the entry point.

IMPORTANT TOOL USAGE INSTRUCTIONS:
To use a tool, you MUST format your output exactly like this XML block:
<tool_call>
{"name": "list_dir", "arguments": {"dir_path": "src"}}
</tool_call>
Only make ONE tool call per response.`;

  const runCall = completion({
    modelId: qwenLoadedId,
    history: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '/no_think\nExplore the codebase. Do a deep dive.' },
    ],
    toolDialect: 'hermes',
    tools: [
      {
        name: 'list_dir',
        description: 'Lists the contents of a directory',
        parameters: {
          type: 'object',
          properties: { dir_path: { type: 'string' } },
          required: ['dir_path'],
        },
      },
    ],
    stream: false,
  });

  const res = await Promise.race([
    runCall.final,
    new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 30000)),
  ]);

  console.log('RESULT:', res);
  console.log('RAW:', res.raw?.fullText);
  console.log('TOOL CALLS:', res.toolCalls);
  process.exit(0);
}

run().catch(console.error);
