import type { MainModule } from '../main.module.js';
import ProjectEntity from '../server/entities/project.entity.js';

import { cancel as qvacCancel, embed } from '@qvac/sdk';

import { LLM_MODEL_ID, EMBEDDING_MODEL_ID } from '../../constants.js';

import { executeGitPull } from './tools/git-tools.js';
import { preLoadOrientationFiles } from './orientation-loader.js';
import { loadAIModels, currentDeviceConfig } from './model-loader.js';
import { runResearchAgentLoop } from './research-loop.js';
import { scanCodebase } from './codebase-scanner.js';

import { chunkText, createProjectManifestSummary, purgeQvacKvCache } from './ai-agent.utils.js';

interface FactDraft {
  content: string;

  /**
   * Text used to generate the embedding.
   *
   * This may intentionally be smaller than content for large symbols.
   * The full content can still be persisted while the embedding model
   * receives a bounded semantic representation.
   */
  embeddingText?: string;

  metadata: Record<string, unknown>;
}

interface StoredFact {
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

/**
 * GTE-Large has a 512-token embedding context window (`bert.context_length`
 * in its GGUF metadata). The QVAC embed runtime hard-errors whenever an input
 * tokenizes to more tokens than the model's effective context size.
 *
 * We bound embedding text by characters as a first, cheap approximation, but
 * character counts do NOT guarantee token counts: ~1200 characters of dense
 * code/JSON/minified content can tokenize to 565+ tokens, which is exactly
 * why we previously saw:
 *
 *   tokenizeInput: context overflow: number of tokens in prompt 0 (565)
 *     exceeds effective context size (512)
 *
 * `runEmbed` therefore additionally retries with a shrinking input whenever
 * the QVAC runtime reports a context overflow, guaranteeing safe tokenization
 * without shipping a local Gemma/GTE tokenizer just for indexing.
 */
const MAX_EMBED_INPUT_CHARS = 1000;

const CONTEXT_OVERFLOW_RE = /context\s?overflow|tokenizeInput|effective context size/i;

class IndexingCancelledError extends Error {
  constructor() {
    super('Indexing was cancelled by the user.');
    this.name = 'IndexingCancelledError';
  }
}

function getEmbeddingVector(response: any): number[] {
  const value = response?.embedding;

  if (!value) {
    throw new Error('Embedding model returned no embedding.');
  }

  return (Array.isArray(value[0]) ? value[0] : value) as number[];
}

export class CodeBaseIndexerAgent {
  mainModule: MainModule;

  /**
   * Active indexing jobs keyed by project id.
   */
  private indexingControllers = new Map<string, AbortController>();

  constructor(mainModule: MainModule) {
    this.mainModule = mainModule;
  }

  cancelIndexing(projectId: string): boolean {
    const controller = this.indexingControllers.get(projectId);

    if (!controller) {
      return false;
    }

    controller.abort();

    return true;
  }

  async analyzeAndIndexProject(projectId: string) {
    if (this.indexingControllers.has(projectId)) {
      throw new Error('Project is already being indexed.');
    }

    const controller = new AbortController();
    const { signal } = controller;

    this.indexingControllers.set(projectId, controller);

    const activeRequestIds = new Set<string>();

    signal.addEventListener(
      'abort',
      () => {
        for (const requestId of activeRequestIds) {
          qvacCancel({
            requestId,
          }).catch(() => {});
        }

        activeRequestIds.clear();
      },
      {
        once: true,
      },
    );

    const checkCancelled = () => {
      if (signal.aborted) {
        throw new IndexingCancelledError();
      }
    };

    const awaitCompletion = async (
      run: {
        requestId: string;
        final: Promise<any>;
        events?: AsyncIterable<any>;
      },
      timeoutMs = 3_600_000,
    ): Promise<any> => {
      activeRequestIds.add(run.requestId);
      console.log(`[LLM] Executing completion call on device: ${currentDeviceConfig || 'unknown'}`);

      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`LLM step timed out after ${timeoutMs / 1000}s`));
        }, timeoutMs);
      });

      if (run.events) {
        void (async () => {
          try {
            for await (const chunk of run.events!) {
              const text = chunk.text || chunk.content || chunk.delta?.content || '';

              if (text) {
                process.stdout.write(text);
              }
            }

            console.log();
          } catch {
            // Streaming output is informational.
            // Cancellation/failure is handled by run.final.
          }
        })();
      }

      try {
        return await Promise.race([run.final, timeoutPromise]);
      } catch (error: any) {
        if (error?.name === 'InferenceCancelledError' || error?.code === 52419) {
          throw new IndexingCancelledError();
        }

        throw error;
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        activeRequestIds.delete(run.requestId);
      }
    };

    const progress = (message: string) => {
      this.mainModule.socket?.emitIndexingProgress({
        projectId,
        status: 'running',
        message,
      });
    };

    try {
      const indexingStartTime = Date.now();

      // Emit an initial progress event immediately so the frontend
      // knows indexing has started even before models are loaded.
      progress('Starting indexing...');

      const project = await this.initializeProject(projectId);

      const absoluteRoot = project.repository_path!;

      progress('Preparing repository...');

      const [models] = await Promise.all([
        loadAIModels(this.mainModule, activeRequestIds),

        executeGitPull(absoluteRoot, progress),
      ]);

      checkCancelled();

      const llmModelId = models.llmModelId;
      const embeddingModelId = models.embeddingModelId;

      /**
       * Do not promote this version to the ProjectEntity until
       * indexing has completed successfully.
       */
      const indexingVersion = (project.indexing_version || 0) + 1;

      // ─────────────────────────────────────────
      // EMBEDDING
      // ─────────────────────────────────────────

      /**
       * The QVAC GGMLBert embedding runtime currently accepts one
       * inference job at a time.
       *
       * Keeping one explicit queue here guarantees that callers cannot
       * accidentally overlap embed() requests.
       */
      let embeddingQueue: Promise<void> = Promise.resolve();

      const runEmbed = (text: string): Promise<number[]> => {
        const task = embeddingQueue.then(async () => {
          checkCancelled();

          let attempt = text;

          for (let attemptIndex = 0; ; attemptIndex++) {
            try {
              const response = await embed({
                modelId: embeddingModelId,
                text: attempt,
              });

              checkCancelled();

              return getEmbeddingVector(response);
            } catch (error: any) {
              const message = String(error?.message || error || '');

              const isContextOverflow = CONTEXT_OVERFLOW_RE.test(message);

              if (!isContextOverflow || attemptIndex >= 5) {
                throw error;
              }

              const shrunkLength = Math.max(64, Math.floor(attempt.length * 0.6));

              if (shrunkLength >= attempt.length) {
                throw error;
              }

              console.warn(
                `[Embedding] GTE context overflow detected (${message}), ` +
                  `shrinking input ${attempt.length} → ${shrunkLength} chars and retrying (attempt ${attemptIndex + 1})`,
              );

              attempt = attempt.substring(0, shrunkLength);
            }
          }
        });

        embeddingQueue = task.then(
          () => undefined,
          () => undefined,
        );

        return task;
      };

      /**
       * Persist a complete logical set of facts for one file/key.
       *
       * This is deliberately the ONLY place where replaceFactsForFile
       * is used during normal indexing.
       *
       * A source file is therefore replaced once with:
       *
       *   file summary
       *   + symbol facts
       *
       * instead of repeatedly replacing itself for every symbol.
       */
      const indexFactsForFile = async (filePath: string, facts: FactDraft[]): Promise<void> => {
        checkCancelled();

        if (facts.length === 0) {
          return;
        }

        const storedFacts: StoredFact[] = [];

        for (const fact of facts) {
          checkCancelled();

          const rawText = fact.embeddingText || fact.content;
          const textForEmbedding = rawText.substring(0, MAX_EMBED_INPUT_CHARS);

          if (!textForEmbedding.trim()) {
            continue;
          }

          const embedding = await runEmbed(textForEmbedding);

          storedFacts.push({
            content: fact.content,
            embedding,
            metadata: {
              ...fact.metadata,
              version: indexingVersion,
            },
          });
        }

        if (storedFacts.length === 0) {
          return;
        }

        checkCancelled();

        await this.mainModule.database.vectorDatabase.replaceFactsForFile(
          project.id,
          filePath,
          storedFacts,
        );
      };

      /**
       * Generic text resources such as README files, orientation
       * documents, dependency summaries, and the global project
       * manifest are chunked before indexing.
       */
      const indexTextResource = async (
        content: string,
        filePath: string,
        metadata: Record<string, unknown> = {},
      ): Promise<void> => {
        const chunks = chunkText(content, 600).filter((chunk) => chunk && chunk.trim().length > 0);

        const facts: FactDraft[] = chunks.map((chunk, index) => ({
          content: chunk,

          metadata: {
            ...metadata,

            factType: metadata.factType || 'text_chunk',

            chunkIndex: index,
            totalChunks: chunks.length,
            sourcePath: filePath,
          },
        }));

        await indexFactsForFile(filePath, facts);
      };

      /**
       * preLoadOrientationFiles historically receives a fire-and-forget
       * indexing callback. Track those writes explicitly so indexing
       * cannot report success before they finish.
       */
      const pendingIndexWrites: Promise<void>[] = [];

      let backgroundIndexingError: unknown | undefined;

      const scheduleTextResource = (
        content: string,
        filePath: string,
        metadata: Record<string, unknown> = {},
      ) => {
        const task = indexTextResource(content, filePath, metadata).catch((error) => {
          backgroundIndexingError ??= error;
        });

        pendingIndexWrites.push(task);

        return task;
      };

      const flushPendingWrites = async () => {
        if (pendingIndexWrites.length > 0) {
          await Promise.all(pendingIndexWrites);
        }

        if (backgroundIndexingError) {
          throw backgroundIndexingError;
        }
      };

      // ─────────────────────────────────────────
      // STRUCTURAL SCAN
      // ─────────────────────────────────────────

      progress('🔍 Scanning codebase structure...');

      const scanResult = await scanCodebase(absoluteRoot);

      checkCancelled();

      progress(`📊 Found ${scanResult.totalFiles} files and ${scanResult.totalSymbols} symbols`);

      /**
       * The current vector database API replaces facts directly rather
       * than supporting staged index versions.
       *
       * Delete only after repository scanning and model setup succeed,
       * which reduces the period in which no complete index exists.
       *
       * A future vector-database update should introduce true
       * version-scoped staging and atomic promotion.
       */
      progress('Preparing new semantic index...');

      await this.mainModule.database.vectorDatabase.deleteProjectFacts(project.id);

      checkCancelled();

      // ─────────────────────────────────────────
      // SOURCE FILE FACTS
      // ─────────────────────────────────────────

      progress('🧠 Indexing files and symbols...');

      for (const file of scanResult.files) {
        checkCancelled();

        const symbolSummary = file.symbols
          .map(
            (symbol) =>
              `${symbol.kind} ${symbol.name} (lines ${symbol.startLine}-${symbol.endLine})`,
          )
          .join('\n');

        const fileSummary = [
          `## File: ${file.filePath}`,
          `Language: ${file.language}`,
          `Size: ${(file.sizeBytes / 1024).toFixed(1)} KB`,

          file.isEntryPoint ? 'Role: Entry point' : '',

          file.isConfigFile ? 'Role: Configuration' : '',

          file.isEntity ? 'Role: Data entity/model' : '',

          file.isRoute ? 'Role: API route/controller' : '',

          file.imports.length > 0 ? `Imports: ${file.imports.join(', ')}` : '',

          file.exports.length > 0 ? `Exports: ${file.exports.join(', ')}` : '',

          symbolSummary ? `\n## Symbols\n${symbolSummary}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        const facts: FactDraft[] = [];

        if (fileSummary.trim()) {
          facts.push({
            content: fileSummary,

            metadata: {
              source: 'codebase_scan',
              factType: 'file_summary',
              sourcePath: file.filePath,

              fileType: file.language,

              isEntryPoint: file.isEntryPoint,

              isConfigFile: file.isConfigFile,

              isEntity: file.isEntity,
              isRoute: file.isRoute,

              symbolCount: file.symbols.length,
            },
          });
        }

        for (const symbol of file.symbols) {
          const symbolContent = [
            `## ${symbol.kind}: ${symbol.name}`,
            `File: ${file.filePath}`,
            `Lines: ${symbol.startLine}-${symbol.endLine}`,
            '',
            symbol.content,
          ].join('\n');

          /**
           * Persist the complete symbol text, but bound the embedding
           * input so huge functions/classes do not overwhelm the
           * embedding model.
           */
          const embeddingText = symbolContent.substring(0, MAX_EMBED_INPUT_CHARS);

          facts.push({
            content: symbolContent,
            embeddingText,

            metadata: {
              source: 'symbol',
              factType: 'symbol',
              sourcePath: file.filePath,

              kind: symbol.kind,
              symbolName: symbol.name,

              startLine: symbol.startLine,
              endLine: symbol.endLine,
            },
          });
        }

        /**
         * Exactly one replacement per source file.
         */
        await indexFactsForFile(file.filePath, facts);
      }

      // ─────────────────────────────────────────
      // REPOSITORY-WIDE STRUCTURAL FACTS
      // ─────────────────────────────────────────

      const topImports = Array.from(scanResult.topLevelImports.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([name, count]) => `- ${name} (${count} files)`)
        .join('\n');

      if (topImports) {
        const dependencySummary = [
          '## Top Dependencies',
          topImports,

          '## Entry Points',
          scanResult.entryPoints.join('\n') || 'None detected',

          '## Entities',
          scanResult.entityFiles.join('\n') || 'None detected',

          '## Routes',
          scanResult.routeFiles.join('\n') || 'None detected',
        ].join('\n\n');

        await indexTextResource(dependencySummary, '__repository__/dependencies', {
          source: 'dependency_graph',
          factType: 'repository_dependencies',
        });
      }

      // ─────────────────────────────────────────
      // ORIENTATION FILES
      // ─────────────────────────────────────────

      progress('📚 Loading repository orientation files...');

      const orientationFileContents = await preLoadOrientationFiles(
        absoluteRoot,
        indexingVersion,
        progress,
        scheduleTextResource,
      );

      await flushPendingWrites();

      checkCancelled();

      // ─────────────────────────────────────────
      // ARCHITECTURAL RESEARCH
      // ─────────────────────────────────────────

      progress('🔬 Researching application architecture...');

      const extractedFacts = await runResearchAgentLoop(
        project,
        absoluteRoot,
        llmModelId,
        orientationFileContents,
        progress,
        checkCancelled,
        awaitCompletion,
      );

      checkCancelled();

      // ─────────────────────────────────────────
      // GLOBAL PROJECT MANIFEST
      // ─────────────────────────────────────────

      progress('💾 Saving architectural knowledge...');

      const richMarkdownSummary = createProjectManifestSummary(extractedFacts);

      await indexTextResource(richMarkdownSummary, '__repository__/project-overview', {
        source: 'project_overview',
        factType: 'project_overview',
      });

      await flushPendingWrites();

      checkCancelled();

      /**
       * Promote the ProjectEntity version only after all indexing and
       * architectural research has successfully completed.
       *
       * NOTE:
       * The vector DB itself still needs version-scoped staging before
       * this becomes a truly atomic index swap.
       */
      project.analysis = extractedFacts;
      project.indexing_version = indexingVersion;
      project.last_indexing_duration_seconds = Math.round((Date.now() - indexingStartTime) / 1000);

      await project.save();

      this.mainModule.socket?.emitIndexingProgress({
        projectId,
        status: 'success',
        message: 'Indexing complete!',
        facts: extractedFacts,
      });
    } catch (error: any) {
      if (error instanceof IndexingCancelledError) {
        console.log(`Indexing cancelled for project ${projectId}.`);

        this.mainModule.socket?.emitIndexingProgress({
          projectId,
          status: 'cancelled',
          message: 'Indexing was cancelled.',
        });

        return;
      }

      console.error('Error during indexing:', error);

      if (error?.message?.includes('loadCache') || error?.message?.includes('nPast')) {
        purgeQvacKvCache();
      }

      this.mainModule.socket?.emitIndexingProgress({
        projectId,
        status: 'error',
        message: error?.message || 'Failed to index codebase',
      });

      throw error;
    } finally {
      this.indexingControllers.delete(projectId);

      try {
        const project = await ProjectEntity.findOne({
          where: {
            id: projectId,
          },
        });

        if (project) {
          project.current_task = null;
          await project.save();
        }
      } catch (error) {
        console.error('Failed to reset project current_task', error);
      }
    }
  }

  private async initializeProject(projectId: string): Promise<ProjectEntity> {
    const availableModels = await this.mainModule.qvac.getAvailableModels();

    const llmModel = availableModels.find((model) => model.id === LLM_MODEL_ID);

    const embeddingModel = availableModels.find((model) => model.id === EMBEDDING_MODEL_ID);

    if (!llmModel?.isCached || !embeddingModel?.isCached) {
      throw new Error(
        'MODEL_SETUP_REQUIRED: Local AI models are not downloaded. Please complete the model setup first.',
      );
    }

    const project = await ProjectEntity.findOne({
      where: {
        id: projectId,
      },
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found.`);
    }

    if (!project.repository_path) {
      throw new Error('Project repository path not set.');
    }

    /**
     * Mark the operation as active, but DO NOT increment
     * indexing_version here.
     *
     * indexing_version represents the most recently completed index,
     * not the index currently being attempted.
     */
    project.current_task = 'indexing';

    await project.save();

    return project;
  }
}
