import { loadModel } from '@qvac/sdk';
import * as qvacModels from '@qvac/sdk';
import { GTE_MODEL_ID } from './src/constants.js';

async function main() {
  const qvacGte = (qvacModels as any)[GTE_MODEL_ID];
  console.log('qvacGte definition:', qvacGte);

  const res = await loadModel({ modelSrc: qvacGte, modelConfig: {} });
  console.log('loadModel returned:', res);
}

main().catch(console.error);
