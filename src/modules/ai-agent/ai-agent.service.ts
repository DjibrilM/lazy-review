import type { MainModule } from '../main.module.js';
import ProjectEntity from '../server/entities/project.entity.js';
import { completion, embed, getModelInfo, loadModel, cancel as qvacCancel } from '@qvac/sdk';
import * as qvacModels from '@qvac/sdk';
import * as path from 'path';
import * as fs from 'fs/promises';
import { QWEN_MODEL_ID, GTE_MODEL_ID } from '../../constants.js';
import { createGitTools } from './tools/git-tools.js';
import SettingsEntity from '../server/entities/settings.entity.js';

export function chunkText(text: string, maxChunkSize = 1000): string[] {
  const lines = text.split('\n');
  const chunks: string[] = [];
  let currentChunk = '';

  for (const line of lines) {
    if (line.trim().length === 0) continue;

    // If a single line exceeds maxChunkSize, split it by character chunks
    if (line.length > maxChunkSize) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      let remaining = line;
      while (remaining.length > maxChunkSize) {
        chunks.push(remaining.substring(0, maxChunkSize));
        remaining = remaining.substring(maxChunkSize);
      }
      currentChunk = remaining;
    } else {
      if (currentChunk.length + line.length + 1 > maxChunkSize) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = line;
      } else {
        currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

export function extractJson(text: string): any {
  // 1. Try to extract from a markdown code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  let jsonString = codeBlockMatch ? (codeBlockMatch[1] || text) : text;

  // 2. Find the first '{' and the last '}'
  const start = jsonString.indexOf('{');
  const end = jsonString.lastIndexOf('}');
  
  if (start === -1 || end === -1 || start > end) {
    throw new Error('No JSON object found in response.');
  }

  jsonString = jsonString.substring(start, end + 1);

  // 3. Simple cleanup for common LLM JSON errors (trailing commas)
  jsonString = jsonString.replace(/,\s*([}\]])/g, '$1');

  return JSON.parse(jsonString);
}

export const createProjectManifestSummary = (facts: any): string => {
  return `# Project: ${facts.project_name || 'Unknown Project'}

## Overview
This is a ${facts.application_type || 'software application'} built using the ${facts.architecture_pattern || 'Unknown'} architecture pattern.

${facts.explanation || 'No detailed explanation provided.'}

## Technology Stack
The core technologies and frameworks used are:
${(facts.tech_stack || []).map((tech: string) => `- ${tech}`).join('\n')}

## Core Modules
${(facts.core_modules || []).map((m: any) => `- **${m.path}**: ${m.desc}`).join('\n')}

## Key Conventions
${(facts.key_conventions || []).map((k: string) => `- ${k}`).join('\n')}

## Required Secrets & Environment Variables
${(facts.required_secrets || []).map((s: any) => `- **${s.key}**: ${s.description}`).join('\n')}
`;
};

class IndexingCancelledError extends Error {
  constructor() {
    super('Indexing was cancelled by the user.');
    this.name = 'IndexingCancelledError';
  }
}

export class AiAgentService {
  mainModule: MainModule;
  /** In-memory registry of active indexing AbortControllers keyed by projectId */
  private indexingControllers: Map<string, AbortController> = new Map();

  constructor(mainModule: MainModule) {
    this.mainModule = mainModule;
  }

  /**
   * Cancel an in-progress indexing run for a project.
   * @returns true if a running job was found and cancelled, false otherwise.
   */
  cancelIndexing(projectId: string): boolean {
    const controller = this.indexingControllers.get(projectId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  /**
   * Background task to analyze a project structure and index architectural facts
   * into the vector database.
   */
  async analyzeAndIndexProject(projectId: string) {
    // Register a fresh AbortController for this run
    const controller = new AbortController();
    const { signal } = controller;
    this.indexingControllers.set(projectId, controller);

    /** Active SDK requestId so we can hard-cancel in-flight LLM calls */
    let activeRequestId: string | null = null;

    // Hook into the abort signal so any in-flight SDK call is killed immediately
    signal.addEventListener(
      'abort',
      () => {
        if (activeRequestId) {
          qvacCancel({ requestId: activeRequestId }).catch(() => {});
          activeRequestId = null;
        }
      },
      { once: true },
    );

    /** Throws IndexingCancelledError if cancellation was requested */
    const checkCancelled = () => {
      if (signal.aborted) throw new IndexingCancelledError();
    };

    /** Awaits a CompletionRun.final with a per-step timeout (default 10 min for CPU inference) */
    const awaitCompletion = async (
      run: { requestId: string; final: Promise<any>; events?: AsyncIterable<any> },
      timeoutMs = 3600_000,
    ): Promise<any> => {
      activeRequestId = run.requestId;
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
            process.stdout.write('\n[LLM Stream] ');
            for await (const event of events) {
              if (event.type === 'contentDelta' && event.text) {
                process.stdout.write(event.text);
              } else if (event.type === 'thinkingDelta' && event.text) {
                process.stdout.write(event.text);
              }
            }
            process.stdout.write('\n');
          } catch (e) {
            // gracefully ignore stream interrupts
          }
        })();
      }
      try {
        return await Promise.race([run.final, timeoutPromise]);
      } finally {
        activeRequestId = null;
      }
    };

    try {
      if (this.mainModule.socket) {
        this.mainModule.socket.emitIndexingProgress({
          projectId,
          status: 'running',
          message: 'Scanning codebase structure...',
        });
      }

      // Check if required models are downloaded
      const availableModels = await this.mainModule.qvac.getAvailableModels();
      const qwenModel = availableModels.find((m) => m.id === QWEN_MODEL_ID);
      const gteModel = availableModels.find((m) => m.id === GTE_MODEL_ID);

      if (!qwenModel?.isCached || !gteModel?.isCached) {
        throw new Error(
          'MODEL_SETUP_REQUIRED: Local AI models are not downloaded. Please complete the model setup first.',
        );
      }

      // 1. Fetch project from DB to get the path
      const project = await ProjectEntity.findOne({ where: { id: projectId } });
      if (!project) {
        throw new Error(`Project ${projectId} not found.`);
      }

      if (project.current_task === 'indexing') {
        throw new Error('Project is already being indexed.');
      }

      // Load models and capture the actual registered IDs returned by the SDK.
      // ctx_size MUST be explicitly set — the default is only 1024 tokens which
      // causes immediate context overflow on any real code analysis prompt.
      const QWEN_CTX_SIZE = 16384;

      let qwenLoadedId: string = (qvacModels as any)[QWEN_MODEL_ID]?.modelId ?? QWEN_MODEL_ID;
      let gteLoadedId: string = (qvacModels as any)[GTE_MODEL_ID]?.modelId ?? GTE_MODEL_ID;

      const qvacQwen = (qvacModels as any)[QWEN_MODEL_ID];
      const qvacGte = (qvacModels as any)[GTE_MODEL_ID];

      // Fetch settings to determine device
      const settingsRepo = this.mainModule.database.appDataSource.getRepository(SettingsEntity);
      let settings = await settingsRepo.findOneBy({ id: 1 });
      const deviceConfig = settings?.useExperimentalGpu ? undefined : 'cpu';

      if (qvacQwen) {
        try {
          qwenLoadedId = await loadModel({
            modelSrc: qvacQwen,
            modelConfig: {
              ctx_size: QWEN_CTX_SIZE,
              ...(deviceConfig ? { device: deviceConfig } : {}),
            },
          });
        } catch (e: any) {
          if (e?.code !== 52200) throw e;
          const info = await getModelInfo(qvacQwen);
          if (info.loadedInstances && info.loadedInstances.length > 0) {
            qwenLoadedId = info.loadedInstances[0].registryId;
          } else {
            qwenLoadedId = qvacQwen.modelId;
          }
        }
      }

      if (qvacGte) {
        try {
          gteLoadedId = await loadModel({
            modelSrc: qvacGte,
            modelConfig: { ...(deviceConfig ? { device: deviceConfig } : {}) },
          });
        } catch (e: any) {
          if (e?.code !== 52200) throw e;
          const info = await getModelInfo(qvacGte);
          if (info.loadedInstances && info.loadedInstances.length > 0) {
            gteLoadedId = info.loadedInstances[0].registryId;
          } else {
            gteLoadedId = qvacGte.modelId;
          }
        }
      }

      const absoluteRoot = project.repository_path;
      if (!absoluteRoot) {
        throw new Error(`Project repository path not set.`);
      }

      // Increment version and delete old facts
      project.current_task = 'indexing';
      project.indexing_version = (project.indexing_version || 0) + 1;
      await project.save();
      this.mainModule.database.vectorDatabase.deleteProjectFacts(project.id);

      // Helper to emit live progress messages to the frontend
      const progress = (message: string) => {
        if (this.mainModule.socket) {
          this.mainModule.socket.emitIndexingProgress({ projectId, status: 'running', message });
        }
      };

      const gteModelId = gteLoadedId;

      let embeddingChain = Promise.resolve();

      /** Helper to chunk and embed a text fact in the background, saving it to the vector database */
      const embedAndSaveFact = (content: string, filePath: string, metadata: any) => {
        embeddingChain = embeddingChain.then(async () => {
          try {
            const chunks = chunkText(content, 600); // safely below 512 tokens for dense code/JSON
            const validChunks = chunks.filter((c) => c && c.trim().length > 0);
            if (validChunks.length === 0) return;

            const factsToSave = [];
            let i = 0;
            for (const chunk of validChunks) {
              const embeddingResponse = await embed({
                modelId: gteModelId,
                text: chunk,
              });

              const embedding = (
                Array.isArray(embeddingResponse.embedding[0])
                  ? embeddingResponse.embedding[0]
                  : embeddingResponse.embedding
              ) as number[];

              factsToSave.push({
                content: chunk,
                embedding,
                metadata: { ...metadata, chunkIndex: i, totalChunks: validChunks.length },
              });
              i++;
            }

            await this.mainModule.database.vectorDatabase.replaceFactsForFile(
              project.id,
              filePath,
              factsToSave,
            );
          } catch (err) {
            console.error(`Background embedding failed for ${filePath}:`, err);
          }
        });
      };

      // 2. Build directory tree
      const buildTree = async (currentPath: string, currentDepth: number): Promise<string> => {
        if (currentDepth > 3) return '';
        const resolved = path.join(absoluteRoot, currentPath);
        const entries = await fs.readdir(resolved, { withFileTypes: true });

        let result = '';
        const indent = '  '.repeat(currentDepth);
        const ignoredDirs = ['node_modules', '.git', 'dist', '.pnpm', 'build', '.next', '.cache'];

        for (const entry of entries) {
          if (ignoredDirs.includes(entry.name)) continue;
          const relativeEntryPath =
            currentPath === '.' ? entry.name : path.join(currentPath, entry.name);
          if (entry.isDirectory()) {
            result += `${indent}📁 ${entry.name}/\n`;
            result += await buildTree(relativeEntryPath, currentDepth + 1);
          } else {
            result += `${indent}📄 ${entry.name}\n`;
          }
        }
        return result;
      };

      checkCancelled();
      progress('📂 Scanning directory structure...');
      const tree = await buildTree('.', 0);
      const qwenModelId = qwenLoadedId;

      // 3. Build initial context: README and package.json first as orientation,
      //    then auto-read common entry point / config files.
      //    The model will use read_file tool to go deeper from here.
      let initialContext = '';

      progress('📖 Identifying orientation files (README, package.json, entry points)...');

      try {
        const resolvedPath = path.join(absoluteRoot, 'README.md');
        const stat = await fs.stat(resolvedPath);
        if (stat.isFile()) {
          progress('📄 Pre-loading: README.md');
          const readmeContent = await fs.readFile(resolvedPath, 'utf-8');
          initialContext += `\n--- FILE: README.md ---\n${readmeContent.substring(0, 8000)}\n`;
          embedAndSaveFact(readmeContent, 'README.md', {
            source: 'orientation_file',
            version: project.indexing_version,
          });
        }
      } catch (e) {
        /* no README */
      }

      const autoReadCandidates = [
        'package.json',
        'requirements.txt',
        'Pipfile',
        'setup.py',
        'pom.xml',
        'build.gradle',
        'Gemfile',
        'prisma/schema.prisma',
        'schema.graphql',
        'docker-compose.yml',
        'pyproject.toml',
        'Cargo.toml',
        'go.mod',
        '.env.example',
        'src/main.ts',
        'src/index.ts',
        'src/app.ts',
        'src/server.ts',
        'src/App.tsx',
      ];

      const autoReadFiles: string[] = [];
      for (const candidate of autoReadCandidates) {
        try {
          const resolved = path.join(absoluteRoot, candidate);
          const stat = await fs.stat(resolved);
          if (stat.isFile() && stat.size < 80 * 1024) {
            progress(`📄 Pre-loading: ${candidate}`);
            const content = await fs.readFile(resolved, 'utf-8');
            initialContext += `\n--- FILE: ${candidate} ---\n${content}\n`;
            autoReadFiles.push(candidate);
            embedAndSaveFact(content, candidate, {
              source: 'orientation_file',
              version: project.indexing_version,
            });
          }
        } catch (e) {
          /* file doesn't exist */
        }
      }

      // 4. Single agentic loop — model uses read_file and search tools to
      //    self-direct its research, then outputs the manifest.
      const gitTools = createGitTools(absoluteRoot);
      const MAX_ITERATIONS = 10;
      let iteration = 0;
      let isDone = false;
      let manifestResultContent = '';

      const history: any[] = [
        {
          role: 'system',
          content: `You are an expert AI software architect embedded inside Cactus Review, an autonomous code review tool.
Your mission is to deeply understand this repository so that the review AI can give accurate, context-aware feedback on PRs.

CRITICAL FOR SPEED (CPU INF):
1. Avoid conversational pleasantries, explanations, or thinking filler. Go straight to calling a tool or outputting the JSON manifest.
2. The pre-loaded files (README, package.json, etc.) usually have all the details. If they are sufficient, DO NOT call any tools. Output the final JSON manifest immediately.
3. If pre-loaded files are missing or insufficient (e.g. no README or config files), use your tools (like read_file) to inspect the core files, but do so efficiently in at most 1 or 2 iterations. Minimize tool calls.

Your research workflow:
1. Review the directory tree and pre-loaded files.
2. If needed, call read_file or search_in_files to check crucial architecture files.
3. Output the final JSON manifest strictly following this schema:
{
  "project_name": "The exact project name",
  "application_type": "e.g. Fullstack Web App, REST API, CLI Tool, Mobile Backend, Monorepo",
  "architecture_pattern": "e.g. Modular Monolith, Microservices, MVC, Clean Architecture, Feature-Sliced Design",
  "explanation": "2-4 paragraphs in plain text. Describe: what the app does and who it's for, how the main layers/modules are structured and interact, what the primary data flows are, and any non-obvious design decisions.",
  "tech_stack": ["Technology 1", "Technology 2"],
  "core_modules": [
    { "path": "src/modules/auth", "desc": "Handles JWT authentication, OAuth providers, and session management." }
  ],
  "key_conventions": [
    "All API routes must validate their input using Zod schemas before calling service layer."
  ],
  "required_secrets": [
    { "key": "DATABASE_URL", "description": "PostgreSQL connection string" }
  ]
}`,
        },
        {
          role: 'user',
          // /no_think must be at the start of user messages for Qwen3 to disable its thinking mode
          content: `/no_think\n## Repository: ${project.name}\n\n## Directory Tree\n\`\`\`\n${tree}\n\`\`\`\n\n## Pre-loaded Files (start here)\n${initialContext}\n\nNow research the codebase using your available tools, then output your final JSON manifest.`,
        },
      ];

      // For testing: dump the entire prompt to the workspace root
      try {
        const dumpPath = path.join(absoluteRoot, 'prompt_dump.txt');
        await fs.writeFile(dumpPath, JSON.stringify(history, null, 2), 'utf-8');
      } catch (e) {
        console.error('Failed to write prompt dump:', e);
      }

      progress(`🤖 AI architect starting research (up to ${MAX_ITERATIONS} steps)...`);

      while (!isDone && iteration < MAX_ITERATIONS) {
        checkCancelled();
        iteration++;

        progress(`🔍 Research step ${iteration}/${MAX_ITERATIONS} — thinking...`);

        // NOTE: responseFormat cannot be combined with tools in the QVAC SDK.
        // We use tools-enabled completion for research turns, then a tools-free
        // completion with responseFormat to extract the final JSON.
        const manifestRun = completion({
          modelId: qwenModelId,
          history,
          tools: gitTools as any,
          stream: true,
          kvCache: projectId.toString(),
        });

        const manifestResult = await awaitCompletion(manifestRun);
        console.log(
          `\n\n--- [LLM Reply: Research Step ${iteration}] ---\n${manifestResult.raw?.fullText || manifestResult.contentText}\n-----------------------------------\n`,
        );
        checkCancelled();

        if (manifestResult.toolCalls && manifestResult.toolCalls.length > 0) {
          history.push({
            role: 'assistant',
            content: manifestResult.cacheableAssistantContent || manifestResult.raw.fullText,
          });

          for (const toolCall of manifestResult.toolCalls as any[]) {
            if (toolCall.invoke) {
              // Emit a human-readable description of what the AI is doing
              const args = toolCall.arguments || {};
              let toolMsg = `🔧 Using tool: ${toolCall.name}`;
              if (toolCall.name === 'read_file' && args.file_path) {
                toolMsg = `📂 Reading file: ${args.file_path}`;
              } else if (toolCall.name === 'search_in_files' && args.keyword) {
                toolMsg = `🔎 Searching codebase for: "${args.keyword}"${args.file_extension ? ` (${args.file_extension} files)` : ''}`;
              } else if (toolCall.name === 'get_recent_commits') {
                toolMsg = `📜 Fetching git commit history...`;
              } else if (toolCall.name === 'get_current_branch') {
                toolMsg = `🌿 Checking current git branch...`;
              }
              progress(toolMsg);

              checkCancelled();
              const toolResult = await toolCall.invoke();
              history.push({
                role: 'tool',
                content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
              });

              // Gradual indexing: if the agent successfully read a file, index it
              if (
                toolCall.name === 'read_file' &&
                toolResult &&
                !toolResult.error &&
                typeof toolResult.content === 'string'
              ) {
                try {
                  embedAndSaveFact(
                    toolResult.content,
                    toolCall.arguments.filePath || toolCall.arguments.file_path,
                    { source: 'discovered_file', version: project.indexing_version },
                  );
                } catch (e) {
                  console.error(`Gradual indexing failed for ${toolCall.arguments.file_path}:`, e);
                }
              }
            }
          }
        } else if (manifestResult.contentText && manifestResult.contentText.trim().length > 0) {
          // Model stopped calling tools and produced text — try extracting the manifest directly
          progress('✍️ Research complete. Extracting architectural manifest...');
          try {
            extractJson(manifestResult.contentText);
            manifestResultContent = manifestResult.contentText;
            isDone = true;
          } catch (err) {
            // The text was not valid JSON. Force a final JSON-only call to extract it.
            progress('⚠️ Output was not valid JSON, asking model to reformat...');
            history.push({
              role: 'assistant',
              content: manifestResult.cacheableAssistantContent || manifestResult.contentText,
            });
            history.push({
              role: 'user',
              content:
                '/no_think\nGood. Now output the final JSON manifest based on your research.',
            });
            const jsonRun = completion({
              modelId: qwenModelId,
              history,
              stream: true,
              kvCache: projectId.toString(),
            });
            const jsonResult = await awaitCompletion(jsonRun);
            console.log(
              `\n\n--- [LLM Reply: Final JSON (Early)] ---\n${jsonResult.contentText}\n---------------------------------------\n`,
            );
            checkCancelled();
            manifestResultContent = jsonResult.contentText;
            try {
              extractJson(manifestResultContent);
              isDone = true;
            } catch (e) {
              progress('⚠️ Manifest output was not valid JSON, retrying...');
            }
          }
        } else {
          // Model returned empty content and no tool calls — skip this step silently
          progress(`⚠️ Step ${iteration} returned empty response, retrying...`);
        }
      }

      // If we hit MAX_ITERATIONS without a final answer, force a conclusion
      if (!isDone) {
        history.push({
          role: 'user',
          content:
            '/no_think\nYou have reached the maximum number of research steps. Output your best JSON manifest now based on everything gathered so far.',
        });
        const finalRun = completion({
          modelId: qwenModelId,
          history,
          stream: true,
        });
        const finalResult = await awaitCompletion(finalRun);
        console.log(
          `\n\n--- [LLM Reply: Final JSON (Forced)] ---\n${finalResult.contentText}\n----------------------------------------\n`,
        );
        manifestResultContent = finalResult.contentText;
      }

      let extractedFacts;
      try {
        extractedFacts = extractJson(manifestResultContent);
        // Fallback for missing properties
        extractedFacts.project_name = extractedFacts.project_name || project.name;
        extractedFacts.architecture_pattern = extractedFacts.architecture_pattern || 'Unknown';
        extractedFacts.core_modules = extractedFacts.core_modules || [];
        extractedFacts.key_conventions = extractedFacts.key_conventions || [];
        extractedFacts.tech_stack = extractedFacts.tech_stack || [];
        extractedFacts.application_type = extractedFacts.application_type || 'Unknown';
        extractedFacts.required_secrets = extractedFacts.required_secrets || [];
        extractedFacts.explanation = extractedFacts.explanation || '';
      } catch (e) {
        extractedFacts = {
          project_name: project.name,
          architecture_pattern: 'Unknown (LLM Parse Error)',
          core_modules: [],
          key_conventions: [],
          tech_stack: [],
          application_type: 'Unknown',
          required_secrets: [],
          explanation: 'Failed to parse AI output.',
        };
      }

      progress('💾 Saving facts to database...');
      const richMarkdownSummary = createProjectManifestSummary(extractedFacts);

      project.analysis = extractedFacts;
      await project.save();

      // Embed the final manifest summary chunk-by-chunk in background
      embedAndSaveFact(richMarkdownSummary, 'root', {
        source: 'project_overview',
        version: project.indexing_version,
      });

      progress('⏳ Finalizing database records...');
      await embeddingChain;

      // 6. Emit success
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
}
