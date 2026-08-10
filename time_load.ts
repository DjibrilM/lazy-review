import { loadModel } from '@qvac/sdk';
import * as qvacModels from '@qvac/sdk';

async function test() {
  console.log('Loading model first time...');
  let start = Date.now();
  try {
    const llmId = await loadModel({
      modelSrc: (qvacModels as any).GEMMA4_4B_MULTIMODAL_Q6_K,
      modelConfig: { ctx_size: 1024 },
    });
    console.log(`Loaded llmId first time: ${llmId} in ${Date.now() - start}ms`);
  } catch (e: any) {
    console.log(`Load error first time: ${e?.code} ${e?.message} in ${Date.now() - start}ms`);
  }

  console.log('Loading model second time...');
  start = Date.now();
  try {
    const llmId2 = await loadModel({
      modelSrc: (qvacModels as any).GEMMA4_4B_MULTIMODAL_Q6_K,
      modelConfig: { ctx_size: 1024 },
    });
    console.log(`Loaded llmId second time: ${llmId2} in ${Date.now() - start}ms`);
  } catch (e: any) {
    console.log(`Load error second time: ${e?.code} ${e?.message} in ${Date.now() - start}ms`);
  }
}
test()
  .catch(console.error)
  .finally(() => process.exit(0));
