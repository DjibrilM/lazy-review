import { loadModel, getModelInfo } from '@qvac/sdk';
import * as qvacModels from '@qvac/sdk';

async function test() {
  console.log('Loading model first time...');
  try {
    const llmId = await loadModel({
      modelSrc: (qvacModels as any).GEMMA4_4B_MULTIMODAL_Q6_K,
      modelConfig: { ctx_size: 1024 },
    });
    console.log('Loaded llmId first time:', llmId);
  } catch (e: any) {
    console.log('Load error first time:', e?.code, e?.message);
  }

  console.log('Loading model second time...');
  try {
    const llmId2 = await loadModel({
      modelSrc: (qvacModels as any).GEMMA4_4B_MULTIMODAL_Q6_K,
      modelConfig: { ctx_size: 1024 },
    });
    console.log('Loaded llmId second time:', llmId2);
  } catch (e: any) {
    console.log('Load error second time:', e?.code, e?.message);
  }
}
test()
  .catch(console.error)
  .finally(() => process.exit(0));
