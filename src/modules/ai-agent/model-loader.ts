import { getModelInfo, loadModel } from '@qvac/sdk';
import * as qvacModels from '@qvac/sdk';
import { LLM_MODEL_ID, EMBEDDING_MODEL_ID } from '../../constants.js';
import SettingsEntity from '../server/entities/settings.entity.js';
import type { MainModule } from '../main.module.js';

/** Cache loaded model IDs to avoid re-loading on every indexing run */
let cachedModelIds: { llmModelId: string; embeddingModelId: string } | null = null;

/**
 * In-flight load promise. When boot preload, indexing, and a review page race
 * on their first request, they share ONE load instead of each issuing a
 * redundant `loadModel` for the same 6GB+ model (which would double the wait
 * and the GPU/memory pressure).
 */
let inFlightLoadPromise: Promise<{ llmModelId: string; embeddingModelId: string }> | null = null;
export let currentDeviceConfig: string | null = null;

/**
 * Forwards QVAC model-load progress (weights → memory) to the socket so the
 * review/chat pages can show a live message instead of an eternal spinner.
 * Tolerates missing sockets and unknown progress shapes.
 */
function emitModelLoadProgress(
  mainModule: MainModule,
  label: string,
  progress?: { percentage?: number; progress?: number; phase?: string; message?: string },
) {
  if (!mainModule.socket) return;

  const pct =
    progress?.percentage ??
    (progress?.progress != null ? Math.round(progress.progress * 100) : undefined);

  const message =
    progress?.message ||
    (pct != null ? `Loading ${label}… ${pct}%` : `Loading ${label} into memory…`);

  try {
    mainModule.socket.emitModelProgress({ message });
  } catch {
    // Never let progress reporting break the load itself.
  }
}

export async function loadAIModels(mainModule: MainModule, activeRequestIds: Set<string>) {
  // Return cached IDs if available - loading models is expensive
  if (cachedModelIds) {
    return cachedModelIds;
  }

  // Dedupe concurrent first loads (boot preload + indexing + review page).
  if (inFlightLoadPromise) {
    return inFlightLoadPromise;
  }

  inFlightLoadPromise = doLoadAIModels(mainModule, activeRequestIds).finally(() => {
    inFlightLoadPromise = null;
  });

  return inFlightLoadPromise;
}

async function doLoadAIModels(mainModule: MainModule, activeRequestIds: Set<string>) {

  const LLM_CTX_SIZE = 128000;
  let llmLoadedId: string = (qvacModels as any)[LLM_MODEL_ID]?.modelId ?? LLM_MODEL_ID;
  let embeddingLoadedId: string =
    (qvacModels as any)[EMBEDDING_MODEL_ID]?.modelId ?? EMBEDDING_MODEL_ID;

  const qvacLlm = (qvacModels as any)[LLM_MODEL_ID];
  const qvacEmbedding = (qvacModels as any)[EMBEDDING_MODEL_ID];

  const settingsRepo = mainModule.database.appDataSource.getRepository(SettingsEntity);
  let settings = await settingsRepo.findOneBy({ id: 1 });
  if (!settings) {
    settings = settingsRepo.create({ id: 1, useExperimentalGpu: true });
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
          onProgress: (progress: any) => emitModelLoadProgress(mainModule, 'Gemma', progress),
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
          onProgress: (progress: any) => emitModelLoadProgress(mainModule, 'Embedding model', progress),
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
