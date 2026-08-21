import { embed, loadModel, unloadModel } from '@qvac/sdk';
import * as qvacModels from '@qvac/sdk';
import type { MainModule } from '../main.module.js';
import { LLM_MODEL_ID, EMBEDDING_MODEL_ID } from '../../constants.js';
import SettingsEntity from '../server/entities/settings.entity.js';

const REVIEW_TIMEOUT_MS = 600_000; // 10 min for CPU inference

export abstract class BaseAgent {
  /** Cache loaded model IDs to avoid re-loading on every request */
  private static cachedModelIds: { llmId: string; embeddingId: string } | null = null;
  protected static currentDevice: string | null = null;

  constructor(protected mainModule: MainModule) {}

  protected async ensureModelsLoaded(): Promise<{ llmId: string; embeddingId: string }> {
    // Return cached IDs if available - loading models is expensive
    if (BaseAgent.cachedModelIds) {
      return BaseAgent.cachedModelIds;
    }

    const settingsRepo = this.mainModule.database.appDataSource.getRepository(SettingsEntity);
    let settings = await settingsRepo.findOneBy({ id: 1 });
    if (!settings) {
      settings = settingsRepo.create({ id: 1, useExperimentalGpu: false });
      await settingsRepo.save(settings);
    }
    const useGpu = Boolean(settings.useExperimentalGpu);
    const deviceConfig = useGpu ? undefined : 'cpu';
    BaseAgent.currentDevice = useGpu ? 'GPU' : 'CPU';

    const LLM_CTX_SIZE = 128000;
    let llmId: string = (qvacModels as any)[LLM_MODEL_ID]?.modelId ?? LLM_MODEL_ID;
    let embeddingId: string =
      (qvacModels as any)[EMBEDDING_MODEL_ID]?.modelId ?? EMBEDDING_MODEL_ID;

    const qvacLlm = (qvacModels as any)[LLM_MODEL_ID];
    const qvacEmbedding = (qvacModels as any)[EMBEDDING_MODEL_ID];

    if (qvacLlm) {
      try {
        llmId = await loadModel({
          modelSrc: qvacLlm,
          modelConfig: {
            ctx_size: LLM_CTX_SIZE,
            ...(deviceConfig ? { device: deviceConfig } : {}),
          },
        });
      } catch (e: any) {
        if (e?.code !== 52200) throw e; // 52200 = already loaded
        const info = await qvacModels.getModelInfo(qvacLlm);
        if (info.loadedInstances && info.loadedInstances.length > 0) {
          llmId = info.loadedInstances[0].registryId;
        } else if (qvacLlm.modelId) {
          llmId = qvacLlm.modelId;
        }
      }
    }

    if (qvacEmbedding) {
      try {
        embeddingId = await loadModel({
          modelSrc: qvacEmbedding,
          modelConfig: { ...(deviceConfig ? { device: deviceConfig } : {}) },
        });
      } catch (e: any) {
        if (e?.code !== 52200) throw e;
        const info = await qvacModels.getModelInfo(qvacEmbedding);
        if (info.loadedInstances && info.loadedInstances.length > 0) {
          embeddingId = info.loadedInstances[0].registryId;
        } else if (qvacEmbedding.modelId) {
          embeddingId = qvacEmbedding.modelId;
        }
      }
    }

    BaseAgent.cachedModelIds = { llmId, embeddingId };
    return BaseAgent.cachedModelIds;
  }

  protected awaitCompletion(run: { requestId: string; final: Promise<any> }): Promise<any> {
    console.log(
      `[LLM] Executing completion call on device: ${BaseAgent.currentDevice || 'unknown'}`,
    );
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`LLM timed out after ${REVIEW_TIMEOUT_MS / 1000}s`)),
        REVIEW_TIMEOUT_MS,
      ),
    );
    return Promise.race([run.final, timeout]);
  }

  protected emitProgress(projectId: string, message: string) {
    if (this.mainModule.socket) {
      this.mainModule.socket.emitReviewProgress({ projectId, status: 'running', message });
    }
  }

  /** Retrieve relevant project facts from the vector DB using semantic search. */
  protected async getRelevantContext(
    projectId: string,
    gteId: string,
    query: string,
  ): Promise<string> {
    try {
      const embedResult = await embed({ modelId: gteId, text: query.substring(0, 1500) });
      const facts = await this.mainModule.database.vectorDatabase.searchFacts(
        projectId,
        embedResult.embedding as number[],
        5,
      );
      if (!facts.length) return '';
      return facts.map((f: any) => f.content).join('\n\n---\n\n');
    } catch {
      return '';
    }
  }

  async loadModels(): Promise<void> {
    await this.ensureModelsLoaded();
  }

  async loadModelsWithIds(): Promise<{ llmId: string; embeddingId: string }> {
    return this.ensureModelsLoaded();
  }

  async unloadModels(): Promise<void> {
    const llmId: string = (qvacModels as any)[LLM_MODEL_ID]?.modelId ?? LLM_MODEL_ID;
    const embeddingId: string =
      (qvacModels as any)[EMBEDDING_MODEL_ID]?.modelId ?? EMBEDDING_MODEL_ID;

    try {
      await unloadModel({ modelId: llmId });
    } catch (e) {
      console.warn(`Failed to unload LLM model:`, e);
    }

    try {
      await unloadModel({ modelId: embeddingId });
    } catch (e) {
      console.warn(`Failed to unload embedding model:`, e);
    }

    // Clear the cache so models get re-loaded next time
    BaseAgent.cachedModelIds = null;
  }
}
