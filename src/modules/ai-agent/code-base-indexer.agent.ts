import type { MainModule } from '../main.module.js';
import ProjectEntity from '../server/entities/project.entity.js';
import { cancel as qvacCancel } from '@qvac/sdk';
import { LLM_MODEL_ID, EMBEDDING_MODEL_ID } from '../../constants.js';
import { executeGitPull } from './tools/git-tools.js';
import { preLoadOrientationFiles } from './orientation-loader.js';
import { loadAIModels } from './model-loader.js';
import { runResearchAgentLoop } from './research-loop.js';
import {
  chunkText,
  extractSymbolsWithAST,
  createProjectManifestSummary,
} from './ai-agent.utils.js';

class IndexingCancelledError extends Error {
  constructor() {
    super('Indexing was cancelled by the user.');
    this.name = 'IndexingCancelledError';
  }
}

export class CodeBaseIndexerAgent {
  mainModule: MainModule;
  /** In-memory registry of active indexing AbortControllers keyed by projectId */
  private indexingControllers: Map<string, AbortController> = new Map();

  constructor(mainModule: MainModule) {
    this.mainModule = mainModule;
  }

  cancelIndexing(projectId: string): boolean {
    const controller = this.indexingControllers.get(projectId);
    if (!controller) return false;
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
        for (const reqId of activeRequestIds) {
          qvacCancel({ requestId: reqId }).catch(() => {});
        }
        activeRequestIds.clear();
      },
      { once: true },
    );

    const checkCancelled = () => {
      if (signal.aborted) throw new IndexingCancelledError();
    };

    const awaitCompletion = async (
      run: { requestId: string; final: Promise<any>; events?: AsyncIterable<any> },
      timeoutMs = 3600_000,
    ): Promise<any> => {
      activeRequestIds.add(run.requestId);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`LLM step timed out after ${timeoutMs / 1000}s`)),
          timeoutMs,
        ),
      );

      const events = run.events;
      if (events) {
        (async () => {
          try {
            for await (const chunk of events) {
              const text = chunk.text || chunk.content || chunk.delta?.content || '';
              if (text) {
                process.stdout.write(text);
              }
            }
            console.log(); // Print newline when stream finishes
          } catch {
            // gracefully ignore stream interrupts
          }
        })();
      }
      try {
        return await Promise.race([run.final, timeoutPromise]);
      } catch (e: any) {
        if (e.name === 'InferenceCancelledError' || e.code === 52419) {
          throw new Error('IndexingCancelledError');
        }
        throw e;
      } finally {
        activeRequestIds.delete(run.requestId);
      }
    };

    const progress = (message: string) => {
      if (this.mainModule.socket) {
        this.mainModule.socket.emitIndexingProgress({ projectId, status: 'running', message });
      }
    };

    try {
      progress('Scanning codebase structure...');

      const project = await this.initializeProject(projectId);
      const absoluteRoot = project.repository_path!;

      const [models] = await Promise.all([
        loadAIModels(this.mainModule, activeRequestIds),
        executeGitPull(absoluteRoot, progress),
      ]);
      const llmModelId = models.llmModelId;

      const embeddingChain = Promise.resolve();

      const embedAndSaveFact = async (content: string, filePath: string, _metadata?: any) => {
        if (filePath.match(/\.(ts|tsx|js|jsx|py|rs|go)$/)) {
          const symbols = await extractSymbolsWithAST(filePath, content);
          if (symbols.length > 0) {
            console.log(`[AST] Extracted ${symbols.length} structural symbols from ${filePath}`);
            return;
          }
        }
        chunkText(content);
        return;
      };

      checkCancelled();

      const orientationFileContents = await preLoadOrientationFiles(
        absoluteRoot,
        project.indexing_version || 1,
        progress,
        embedAndSaveFact,
      );

      const extractedFacts = await runResearchAgentLoop(
        project,
        absoluteRoot,
        llmModelId,
        orientationFileContents,
        progress,
        checkCancelled,
        awaitCompletion,
        embedAndSaveFact,
      );

      progress('💾 Saving facts to database...');
      const richMarkdownSummary = createProjectManifestSummary(extractedFacts);

      project.analysis = extractedFacts;
      await project.save();

      embedAndSaveFact(richMarkdownSummary, 'root', {
        source: 'project_overview',
        version: project.indexing_version,
      });

      progress('⏳ Finalizing database records...');
      await embeddingChain;

      if (this.mainModule.socket) {
        this.mainModule.socket.emitIndexingProgress({
          projectId,
          status: 'success',
          message: 'Indexing complete!',
          facts: extractedFacts,
        });
      }
    } catch (error: any) {
      if (error instanceof IndexingCancelledError) {
        console.log(`Indexing cancelled for project ${projectId}.`);
        if (this.mainModule.socket) {
          this.mainModule.socket.emitIndexingProgress({
            projectId,
            status: 'cancelled',
            message: 'Indexing was cancelled.',
          });
        }
      } else {
        console.error('Error during indexing:', error);
        if (this.mainModule.socket) {
          this.mainModule.socket.emitIndexingProgress({
            projectId,
            status: 'error',
            message: error.message || 'Failed to index codebase',
          });
        }
        throw error;
      }
    } finally {
      this.indexingControllers.delete(projectId);
      try {
        const project = await ProjectEntity.findOne({ where: { id: projectId } });
        if (project) {
          project.current_task = null;
          await project.save();
        }
      } catch (e) {
        console.error('Failed to reset project current_task', e);
      }
    }
  }

  private async initializeProject(projectId: string): Promise<ProjectEntity> {
    const availableModels = await this.mainModule.qvac.getAvailableModels();
    const gemma4Model = availableModels.find((m) => m.id === LLM_MODEL_ID);
    const gteModel = availableModels.find((m) => m.id === EMBEDDING_MODEL_ID);

    if (!gemma4Model?.isCached || !gteModel?.isCached) {
      throw new Error(
        'MODEL_SETUP_REQUIRED: Local AI models are not downloaded. Please complete the model setup first.',
      );
    }

    const project = await ProjectEntity.findOne({ where: { id: projectId } });
    if (!project) {
      throw new Error(`Project ${projectId} not found.`);
    }
    if (!project.repository_path) {
      throw new Error(`Project repository path not set.`);
    }

    project.current_task = 'indexing';
    project.indexing_version = (project.indexing_version || 0) + 1;
    await project.save();
    this.mainModule.database.vectorDatabase.deleteProjectFacts(project.id);

    return project;
  }
}
