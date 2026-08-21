import { getModelInfo, loadModel } from '@qvac/sdk';
import * as qvacModels from '@qvac/sdk';
import { LLM_MODEL_ID, EMBEDDING_MODEL_ID } from '../../constants.js';
import SettingsEntity from '../server/entities/settings.entity.js';
import type { MainModule } from '../main.module.js';

/** Cache loaded model IDs to avoid re-loading on every indexing run */
let cachedModelIds: { llmModelId: string; embeddingModelId: string } | null = null;
export let currentDeviceConfig: string | null = null;

export async function loadAIModels(mainModule: MainModule, activeRequestIds: Set<string>) {
  // Return cached IDs if available - loading models is expensive
  if (cachedModelIds) {
    return cachedModelIds;
  }

  const LLM_CTX_SIZE = 128000;
  let llmLoadedId: string = (qvacModels as any)[LLM_MODEL_ID]?.modelId ?? LLM_MODEL_ID;
  let embeddingLoadedId: string =
    (qvacModels as any)[EMBEDDING_MODEL_ID]?.modelId ?? EMBEDDING_MODEL_ID;

  const qvacLlm = (qvacModels as any)[LLM_MODEL_ID];
  const qvacEmbedding = (qvacModels as any)[EMBEDDING_MODEL_ID];

  const settingsRepo = mainModule.database.appDataSource.getRepository(SettingsEntity);
  let settings = await settingsRepo.findOneBy({ id: 1 });
  if (!settings) {
    settings = settingsRepo.create({ id: 1, useExperimentalGpu: false });
    await settingsRepo.save(settings);
  }

  const useGpu = Boolean(settings.useExperimentalGpu);
  const deviceConfig = useGpu ? undefined : 'cpu';
  currentDeviceConfig = useGpu ? 'GPU' : 'CPU';

  console.log(
    `Using device: ${useGpu ? 'gpu (Metal/CUDA)' : 'cpu'} (useExperimentalGpu=${useGpu})`,
  );

  const loadGemma4 = async () => {
    if (qvacLlm) {
      let loadPromise;
      try {
        loadPromise = loadModel({
          modelSrc: qvacLlm,
          modelConfig: {
            ctx_size: LLM_CTX_SIZE,
            ...(deviceConfig ? { device: deviceConfig } : {}),
          },
        });
        activeRequestIds.add(loadPromise.requestId);
        llmLoadedId = await loadPromise;
      } catch (e: any) {
        if (e?.code !== 52200) throw e;
        const info = await getModelInfo(qvacLlm);
        if (info.loadedInstances && info.loadedInstances.length > 0) {
          llmLoadedId = info.loadedInstances[0].registryId;
        } else {
          llmLoadedId = qvacLlm.modelId;
        }
      } finally {
        if (loadPromise) activeRequestIds.delete(loadPromise.requestId);
      }
    }
  };

  const loadGte = async () => {
    if (qvacEmbedding) {
      let loadPromise;
      try {
        loadPromise = loadModel({
          modelSrc: qvacEmbedding,
          modelConfig: { ...(deviceConfig ? { device: deviceConfig } : {}) },
        });
        activeRequestIds.add(loadPromise.requestId);
        embeddingLoadedId = await loadPromise;
      } catch (e: any) {
        if (e?.code !== 52200) throw e;
        const info = await getModelInfo(qvacEmbedding);
        if (info.loadedInstances && info.loadedInstances.length > 0) {
          embeddingLoadedId = info.loadedInstances[0].registryId;
        } else {
          embeddingLoadedId = qvacEmbedding.modelId;
        }
      } finally {
        if (loadPromise) activeRequestIds.delete(loadPromise.requestId);
      }
    }
  };

  await Promise.all([loadGemma4(), loadGte()]);

  cachedModelIds = { llmModelId: llmLoadedId, embeddingModelId: embeddingLoadedId };
  return cachedModelIds;
}
