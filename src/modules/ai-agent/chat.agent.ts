import { completion } from '@qvac/sdk';
import { BaseAgent } from './base.agent.js';
import ProjectEntity from '../server/entities/project.entity.js';
import { parseDiff, createProjectManifestSummary } from './ai-agent.utils.js';
import { z } from 'zod';
import { createGitTools } from './tools/git-tools.js';
import { createFsTools } from './tools/fs-tools.js';
import { AgentContextManager } from './agent-context-manager.js';

export class ChatAgent extends BaseAgent {
  /**
   * Stream a chat response grounded in project context and PR diff.
   */
  async *chatStream(
    projectId: string,
    history: { role: string; content: string }[],
    userMessage: string,
    prDiff?: string,
    githubMeta?: any,
  ): AsyncGenerator<string, void, unknown> {
    const { llmId, embeddingId } = await this.ensureModelsLoaded();

    const project = await ProjectEntity.findOneBy({ id: projectId });
    const gitTools = project?.repository_path ? createGitTools(project.repository_path) : [];

    const context = await this.getRelevantContext(projectId, embeddingId, userMessage);

    const parsedDiffFiles = prDiff ? parseDiff(prDiff) : [];
    const changedFiles = parsedDiffFiles.map((f) => f.file);
    const diffContext =
      changedFiles.length > 0
        ? `\n\n## Changed Files in PR:\n${changedFiles.map((f) => `- ${f}`).join('\n')}\n\nUse the \`read_pr_file_diff\` tool to view the exact changes for any of these files.`
        : '';

    let metaContext = '';
    if (githubMeta) {
      metaContext = `\n\n## GitHub PR Metadata\nOwner: ${githubMeta.owner}\nRepo: ${githubMeta.repo}\nPull Number: ${githubMeta.pull_number}`;
      if (githubMeta.creator) metaContext += `\nCreator: ${githubMeta.creator}`;
      if (githubMeta.additions !== undefined) metaContext += `\nAdditions: ${githubMeta.additions}`;
      if (githubMeta.deletions !== undefined) metaContext += `\nDeletions: ${githubMeta.deletions}`;
      if (githubMeta.changed_files !== undefined)
        metaContext += `\nChanged Files: ${githubMeta.changed_files}`;
    }

    const projectOverview = project?.analysis
      ? createProjectManifestSummary(project.analysis)
      : 'No project overview available.';

    const readPrFileDiffTool = {
      name: 'read_pr_file_diff',
      description: 'Get the exact diff for a specific file modified in this PR.',
      parameters: z.object({
        file_path: z.string().describe('The path of the changed file (e.g. src/main.ts).'),
      }),
      handler: async (args: { file_path: string }) => {
        const fileDiff = parsedDiffFiles.find((f) => f.file === args.file_path);
        if (fileDiff) return { diff: fileDiff.diff };
        return { error: `File ${args.file_path} not found in this PR's diff.` };
      },
    };

    const fsTools = project?.repository_path ? createFsTools(project.repository_path) : [];

    const semanticSearchTool = {
      name: 'semantic_search',
      description:
        'Search the indexed codebase using semantic similarity. Useful for finding architecture patterns, existing conventions, or context about unfamiliar code.',
      parameters: z.object({
        query: z.string().describe('The search query for semantic matching.'),
      }),
      handler: async (args: { query: string }) => {
        const factsContext = await this.getRelevantContext(projectId, embeddingId, args.query);
        if (!factsContext) return { result: 'No relevant semantic information found.' };
        return { result: factsContext };
      },
    };

    const runtimeTools = [...gitTools, ...fsTools, readPrFileDiffTool, semanticSearchTool];

    const systemPrompt = `You are an expert code review assistant embedded in Cactus Review. You help developers understand and improve their pull requests.

You have access to the project's architectural manifest and the PR diff. You can also use tools to read files, check branches, and investigate the codebase. Answer the user's question concisely and accurately. If the user asks you to "request changes" or take a GitHub action, confirm what you will do but don't actually do it — the UI will handle the GitHub API call.

## Codebase Overview (Project Manifest)
${projectOverview}

## Relevant Semantic Context
${context || 'No relevant semantic context found.'}${diffContext}${metaContext}`;

    const contextManager = new AgentContextManager(
      systemPrompt,
      llmId,
      128000,
      2500,
      projectId.toString(),
    );

    for (const m of history) {
      contextManager.addRecent({ role: m.role, content: m.content });
    }
    contextManager.addRecent({ role: 'user', content: `/no_think\n${userMessage}` });

    let loopCount = 0;
    while (loopCount < 5) {
      loopCount++;

      if (contextManager.needsCompaction()) {
        yield `\n\n> 🗜️ Compacting context to fit memory limit...\n\n`;
        await contextManager.compactWithLLM();
      }

      const run = completion({
        modelId: llmId,
        history: contextManager.buildHistory(),
        tools: runtimeTools as any,
        toolDialect: 'json',
        stream: true,
        kvCache: projectId.toString(),
      });

      console.log(run.toolCalls, 'tool calls');

      let isToolCall = false;
      let buffer = '';

      const iterable = (run as any).events || run;
      for await (const chunk of iterable) {
        const text = typeof chunk === 'string' ? chunk : chunk.content || chunk.text || '';

        if (!buffer && (text.trim().startsWith('{') || text.trim().startsWith('<|tool_call>'))) {
          isToolCall = true;
        }

        buffer += text;

        if (!isToolCall && text) {
          yield text;
        }
      }

      // Ensure we await the final result from the SDK wrapper if it returns { requestId, final, events }
      const finalResultPromise = (run as any).final || Promise.resolve(run);
      const result = await finalResultPromise;

      const resolvedToolCalls = await result.toolCalls;
      let toolCalls: any[] = [];
      if (resolvedToolCalls && resolvedToolCalls.length > 0) {
        toolCalls = resolvedToolCalls;
      } else if (isToolCall) {
        // Fallback if the SDK didn't parse them into toolCalls but it looks like JSON
        const regex = /\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}/g;
        let match;
        while ((match = regex.exec(buffer)) !== null) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed.name && (parsed.arguments || parsed.args)) {
              toolCalls.push({ name: parsed.name, arguments: parsed.arguments || parsed.args });
            }
          } catch {
            // ignore parsing errors
          }
        }

        const agRegex = /<\|tool_call\|>?:?call:([a-zA-Z0-9_-]+)\{(.*?)\}/g;
        let agMatch;
        while ((agMatch = agRegex.exec(buffer)) !== null) {
          try {
            let parsedArgs = {};
            if (agMatch[2] && agMatch[2].trim()) {
              parsedArgs = JSON.parse('{' + agMatch[2] + '}');
            }
            toolCalls.push({ name: agMatch[1] || '', arguments: parsedArgs });
          } catch {
            try {
              const parsedArgs = JSON.parse(agMatch[2] || '{}');
              toolCalls.push({ name: agMatch[1] || '', arguments: parsedArgs });
            } catch {
              // ignore
            }
          }
        }
      }

      if (toolCalls.length > 0) {
        contextManager.addRecent({
          role: 'assistant',
          content: result.cacheableAssistantContent || result.contentText || buffer,
        });

        for (const tc of toolCalls) {
          const tool = gitTools.find((t: any) => t.name === tc.name);
          if (tool) {
            console.log(`🤖 [Executing Tool] ${tc.name}`, tc.arguments);
            yield `\n\n> 🔧 Executing tool \`${tc.name}\`...\n\n`;

            let args = tc.arguments || tc.args;
            if (typeof args === 'string') {
              try {
                args = JSON.parse(args);
              } catch {
                // ignore
              }
            }
            args = args || {};

            let toolResult;
            try {
              if ('invoke' in tool && typeof (tool as any).invoke === 'function') {
                toolResult = await (tool as any).invoke(args);
              } else if ('handler' in tool && typeof (tool as any).handler === 'function') {
                toolResult = await (tool as any).handler(args);
              }
            } catch (err: any) {
              toolResult = { error: err.message };
            }

            const estimatedTokens = contextManager.estimateTokens(toolResult);
            if (contextManager.needsCompaction(estimatedTokens)) {
              yield `\n\n> 🗜️ Compacting context after large tool result...\n\n`;
              await contextManager.compactWithLLM();
            }

            contextManager.addRecent({
              role: 'tool',
              content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
            });
          }
        }
      } else {
        break; // No more tools, we're done
      }
    }
  }

  /**
   * Single-turn chat grounded in project context and PR diff.
   * The caller is responsible for maintaining the full history across turns.
   */
  async chat(
    projectId: string,
    history: { role: string; content: string }[],
    userMessage: string,
    prDiff?: string,
  ): Promise<string> {
    const stream = this.chatStream(projectId, history, userMessage, prDiff);
    let full = '';
    for await (const chunk of stream) full += chunk;
    return full;
  }
}
