import { startQVACProvider, stopQVACProvider, loadModel, completion } from '@qvac/sdk';
import * as qvacModels from '@qvac/sdk';
import { QWEN_MODEL_ID } from '../src/constants.js';

process.env.QVAC_LOG = '1';
process.env.LLAMA_LOG = '1';
process.env.GGML_LOG_LEVEL = 'debug';
process.env.DEBUG = '*';
process.env.QVAC_LOG_LEVEL = 'debug';

async function main() {
  console.log('--- STARTING QVAC PROVIDER (ENV INJECTED) ---');
  await startQVACProvider();
  
  const obj = (qvacModels as any)[QWEN_MODEL_ID];
  let loadedId = '';
  try {
    loadedId = await loadModel({
      modelSrc: obj,
      modelConfig: { ctx_size: 1024, device: 'gpu', gpu_layers: -1 } as any,
    });
  } catch (e: any) {}

  const run = completion({ modelId: loadedId, history: [{ role: 'user', content: 'Say hello' }], stream: false });
  await new Promise(r => setTimeout(r, 10000));
  await stopQVACProvider();
  process.exit(0);
}

main().catch(console.error);
