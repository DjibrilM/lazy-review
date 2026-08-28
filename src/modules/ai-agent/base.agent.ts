import { embed, unloadModel } from '@qvac/sdk';
import * as qvacModels from '@qvac/sdk';
import type { MainModule } from '../main.module.js';
import { LLM_MODEL_ID, EMBEDDING_MODEL_ID } from '../../constants.js';
import { loadAIModels } from './model-loader.js';

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

    // Delegate to the shared loader used by the indexer and the boot-time
    // preload. That loader caches the resolved registry IDs process-wide and
    // reads the device setting once, so review/chat reuse the SAME already
    // loaded instances instead of issuing a redundant loadModel round-trip.
    const { llmModelId, embeddingModelId } = await loadAIModels(
      this.mainModule,
      new Set<string>(),
    );

    BaseAgent.cachedModelIds = {
      llmId: llmModelId,
      embeddingId: embeddingModelId,
    };

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
      const queryText = query.substring(0, 800);
      let embedResult;

      // GTE-Large rejects inputs that tokenize beyond its 512-token context
      // window. Shrink the query defensively if the runtime reports overflow.
      for (let attempt = queryText, i = 0; i < 5; i++) {
        try {
          embedResult = await embed({ modelId: gteId, text: attempt });
          break;
        } catch (error: any) {
          const message = String(error?.message || error || '');
          if (!/context\s?overflow|tokenizeInput|effective context size/i.test(message)) {
            throw error;
          }
          const shrunkLength = Math.max(64, Math.floor(attempt.length * 0.6));
          if (shrunkLength >= attempt.length) throw error;
          console.warn(
            `[Embedding] Semantic-search query overflow detected (${message}), ` +
              `shrinking input ${attempt.length} → ${shrunkLength} chars and retrying (attempt ${i + 1})`,
          );
          attempt = attempt.substring(0, shrunkLength);
        }
      }

      if (!embedResult) return '';

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
