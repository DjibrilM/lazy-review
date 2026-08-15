import { completion } from '@qvac/sdk';
import { BaseAgent } from './base.agent.js';
import ProjectEntity from '../server/entities/project.entity.js';
import { parseDiff, createProjectManifestSummary } from './ai-agent.utils.js';
import { createGitTools } from './tools/git-tools.js';
import { createFsTools } from './tools/fs-tools.js';
import { createPrChatTools } from './tools/pr-chat-tools.js';
import type { GitHubMeta, RuntimeTool, ToolContext } from './tool-types.js';
import { ToolExecutor, serializeToolResult } from './tool-executor.js';
import { AgentContextManager } from './agent-context-manager.js';

/**
 * Dynamically selects a smaller tool subset based on the user's intent.
 * Small/local models deteriorate much faster as the available function set
 * grows, so we only expose what the current turn needs.
 */
function selectTools(
  userMessage: string,
  allTools: RuntimeTool[],
): RuntimeTool[] {
  const msg = userMessage.toLowerCase();

  // Always available: core PR investigation + semantic search + file reading.
  const coreNames = new Set([
    'read_pr_file_diff',
    'semantic_search',
    'search_in_files',
    'read_file',
    'read_directory',
    'get_directory_tree',
    'get_file_outline',
    'read_symbol',
    'get_current_branch',
    'get_recent_commits',
    'get_pr_files',
    'get_file_diff',
  ]);

  // Branch comparison tools.
  const branchNames = new Set([
    'list_branches',
    'read_file_from_branch',
    'compare_file_between_branches',
    'get_branch_diff',
    'get_file_history',
    'get_file_at_commit',
    'get_branch_status',
  ]);

  const selected = new Set<string>(coreNames);

  const wantsBranches =
    msg.includes('branch') ||
    msg.includes('main') ||
    msg.includes('compare') ||
    msg.includes('difference') ||
    msg.includes('evolve') ||
    msg.includes('history') ||
    msg.includes('commit');

  const wantsComment =
    msg.includes('comment') ||
    msg.includes('post') ||
    msg.includes('leave') ||
    msg.includes('send') ||
    msg.includes('submit');

  const wantsChanges =
    msg.includes('request change') ||
    msg.includes('request_changes') ||
    msg.includes('changes on the pr') ||
    msg.includes('changes on this pr') ||
    msg.includes('approve') ||
    msg.includes('reject');

  if (wantsBranches) {
    for (const name of branchNames) selected.add(name);
  }

  if (wantsComment) {
    selected.add('leave_pr_comment');
  }

  if (wantsChanges) {
    selected.add('request_pr_changes');
  }

  return allTools.filter((tool) => selected.has(tool.name));
}

export class ChatAgent extends BaseAgent {
  /**
   * Stream a chat response grounded in project context and PR diff.
   *
   * The socketId is used to bind structured confirmations to the initiating
   * client so no other connected client can respond.
   */
  async *chatStream(
    projectId: string,
    history: { role: string; content: string }[],
    userMessage: string,
    prDiff?: string,
    githubMeta?: GitHubMeta,
    socketId?: string,
  ): AsyncGenerator<string, void, unknown> {
    const session =
      githubMeta?.pull_number !== undefined
        ? this.mainModule.aiAgent.sessionManager.getSession(projectId, githubMeta.pull_number)
        : undefined;

    let llmId: string;
    let embeddingId: string;
    let parsedDiffFiles: { file: string; diff: string }[];
    let gitTools: RuntimeTool[];
    let fsTools: RuntimeTool[];
    let projectOverview: string;

    if (session) {
      llmId = session.llmId;
      embeddingId = session.embeddingId;
      parsedDiffFiles = session.parsedDiffFiles;
      gitTools = session.gitTools as RuntimeTool[];
      fsTools = session.fsTools as RuntimeTool[];
      projectOverview = session.projectOverview;
    } else {
      const models = await this.ensureModelsLoaded();
      llmId = models.llmId;
      embeddingId = models.embeddingId;

      const project = await ProjectEntity.findOneBy({ id: projectId });
      gitTools = project?.repository_path
        ? (createGitTools(project.repository_path) as RuntimeTool[])
        : [];
      fsTools = project?.repository_path
        ? (createFsTools(project.repository_path) as RuntimeTool[])
        : [];
      parsedDiffFiles = prDiff ? parseDiff(prDiff) : [];
      projectOverview = project?.analysis
        ? createProjectManifestSummary(project.analysis)
        : 'No project overview available.';
    }

    const context = await this.getRelevantContext(projectId, embeddingId, userMessage);
    const changedFiles = parsedDiffFiles.map((file) => file.file);

    const diffContext =
      changedFiles.length > 0
        ? `\n\n## Changed Files in PR:\n${changedFiles
            .map((file) => `- ${file}`)
            .join(
              '\n',
            )}\n\nUse the \`read_pr_file_diff\` tool to view the exact changes for any of these files.`
        : '';

    let metaContext = '';
    if (githubMeta) {
      metaContext = `\n\n## GitHub PR Metadata\nOwner: ${githubMeta.owner}\nRepo: ${githubMeta.repo}\nPull Number: ${githubMeta.pull_number}`;
      if (githubMeta.creator) metaContext += `\nCreator: ${githubMeta.creator}`;
      if (githubMeta.additions !== undefined) metaContext += `\nAdditions: ${githubMeta.additions}`;
      if (githubMeta.deletions !== undefined) metaContext += `\nDeletions: ${githubMeta.deletions}`;
      if (githubMeta.changed_files !== undefined) {
        metaContext += `\nChanged Files: ${githubMeta.changed_files}`;
      }
      // Explicit line count context for the PR
      const totalLines = (githubMeta.additions ?? 0) + (githubMeta.deletions ?? 0);
      metaContext += `\n\n## PR Size Summary\n- **Lines Added:** ${githubMeta.additions ?? 0}`;
      metaContext += `\n- **Lines Removed:** ${githubMeta.deletions ?? 0}`;
      metaContext += `\n- **Total Lines Changed:** ${totalLines}`;
      if (githubMeta.changed_files !== undefined) {
        metaContext += `\n- **Files Modified:** ${githubMeta.changed_files}`;
      }
      metaContext += `\n\nUse this context to gauge the scope of the PR. A small PR (under 100 lines) is likely a focused change, while a large PR (500+ lines) may need more careful review.`;
    }

    // PR-specific tools are now in their own module: tools/pr-chat-tools.ts
    // This keeps chat.agent.ts focused on the orchestration logic.
    const prTools = createPrChatTools(
      parsedDiffFiles,
      githubMeta,
      this.mainModule,
      async (pid: string, query: string) => await this.getRelevantContext(pid, embeddingId, query),
      projectId,
    );

    // Remove switch_branch from ordinary chat. It changes the physical working
    // tree and the model almost never needs it when read-only branch inspection
    // tools are available.
    const safeGitTools = gitTools.filter((tool) => tool.name !== 'switch_branch');

    // Remove duplicate read_file. Both git-tools and fs-tools define one.
    const gitToolsWithoutReadFile = safeGitTools.filter((tool) => tool.name !== 'read_file');

    // All tools available for this session.
    const allTools: RuntimeTool[] = [...gitToolsWithoutReadFile, ...fsTools, ...prTools];

    // Dynamically select a smaller tool subset based on user intent.
    const runtimeTools = selectTools(userMessage, allTools);

    const systemPrompt = `You are Cactus Review, a code-review assistant embedded in a PR review tool.

Help the user understand, investigate, and review the current pull request.

Use available tools when repository or PR evidence is needed.
Do not invent repository details when they can be inspected.

GitHub and workspace mutations are executed by the runtime and may require
user authorization. Never claim a mutation succeeded until its tool result
reports success.

Prefer read-only investigation before proposing changes.

When reviewing code:
- identify concrete correctness, security, maintainability, or performance issues;
- distinguish confirmed issues from uncertain concerns;
- cite relevant files and lines when available;
- avoid unnecessary repository exploration.

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

    for (const message of history) {
      contextManager.addRecent({ role: message.role, content: message.content });
    }

    contextManager.addRecent({ role: 'user', content: userMessage });

    const executor = new ToolExecutor(runtimeTools, this.mainModule);

    const toolContext: ToolContext = {
      projectId,
      sessionId: projectId.toString(),
    };

    if (githubMeta) {
      toolContext.githubMeta = githubMeta;
    }

    if (socketId) {
      toolContext.socketId = socketId;
    }

    if (history.length > 0) {
      toolContext.conversation = history;
    }

    const maxToolTurns = 5;

    for (let turn = 0; turn < maxToolTurns; turn++) {
      if (contextManager.needsCompaction()) {
        console.log('🗜️ [ChatAgent] Compacting context before completion');
        await contextManager.compactWithLLM();
      }

      const run = completion({
        modelId: llmId,
        history: contextManager.buildHistory() as any,
        tools: runtimeTools as any,
        toolDialect: 'json',
        stream: true,
        captureThinking: true,
        kvCache: projectId.toString(),
      });

      let thinkingOpen = false;
      let bufferedContent = '';

      // QVAC already separates normal content, thinking, and tool calls.
      // Never try to infer a tool call from whether a text chunk starts with "{".
      for await (const event of run.events as AsyncIterable<any>) {
        switch (event.type) {
          case 'thinkingDelta': {
            if (!thinkingOpen) {
              thinkingOpen = true;
              yield ' thinking';
            }

            if (event.text) {
              yield event.text;
            }
            break;
          }

          case 'contentDelta': {
            if (thinkingOpen) {
              thinkingOpen = false;
              yield ' response';
            }

            if (event.text) {
              // Buffer content until we know whether this turn contains tool
              // calls. If it does, we discard the preliminary prose and let the
              // model generate the final answer after tool execution.
              bufferedContent += event.text;
            }
            break;
          }

          case 'toolCall': {
            if (thinkingOpen) {
              thinkingOpen = false;
              yield ' response';
            }

            console.log(
              `🧰 [ChatAgent] Tool requested: ${event.call?.name}`,
              event.call?.arguments,
            );
            break;
          }

          case 'toolError': {
            console.error('❌ [ChatAgent] Tool parsing error:', event.error);
            break;
          }

          case 'completionDone': {
            break;
          }

          default:
            break;
        }
      }

      if (thinkingOpen) {
        yield ' response';
      }

      const result = await run.final;
      // IMPORTANT: toolCalls may be exposed asynchronously. Always await it.
      const toolCalls = (await result.toolCalls) ?? [];

      // No tool requested: the buffered content is the final answer.
      if (toolCalls.length === 0) {
        if (bufferedContent) {
          yield bufferedContent;
        }
        return;
      }

      // This turn contains tool calls. Discard the preliminary prose and
      // preserve the assistant's structured tool-call turn in history so the
      // follow-up completion can reason from the tool results correctly.
      contextManager.addRecent({
        role: 'assistant',
        content:
          result.cacheableAssistantContent ?? result.contentText ?? result.raw?.fullText ?? '',
      });

      // Tools that mutate state or require user confirmation must run serially.
      // Read-only tools can run in parallel for much faster multi-tool turns.
      const mutationTools = new Set(
        runtimeTools
          .filter((tool) => (tool.effect ?? 'read') !== 'read' && tool.confirmation?.required)
          .map((tool) => tool.name),
      );

      const parallelCalls = (toolCalls as any[]).filter((tc) => !mutationTools.has(tc.name));
      const serialCalls = (toolCalls as any[]).filter((tc) => mutationTools.has(tc.name));

      // Execute read-only tools in parallel
      const parallelResults = await Promise.all(
        parallelCalls.map(async (toolCall) => ({
          toolCall,
          result: await executor.execute(toolCall, toolContext),
        })),
      );

      // Add parallel results to context
      for (const { toolCall, result } of parallelResults) {
        const estimatedTokens = contextManager.estimateTokens(result);

        if (contextManager.needsCompaction(estimatedTokens)) {
          console.log('🗜️ [ChatAgent] Compacting context after tool result');
          await contextManager.compactWithLLM();
        }

        contextManager.addRecent({
          role: 'tool',
          content: serializeToolResult(result),
        });
      }

      // Execute mutation tools serially (they may require user confirmation)
      for (const toolCall of serialCalls) {
        const result = await executor.execute(toolCall, toolContext);

        const estimatedTokens = contextManager.estimateTokens(result);

        if (contextManager.needsCompaction(estimatedTokens)) {
          console.log('🗜️ [ChatAgent] Compacting context after tool result');
          await contextManager.compactWithLLM();
        }

        contextManager.addRecent({
          role: 'tool',
          content: serializeToolResult(result),
        });
      }

      // Loop again. The next completion sees the tool result and produces the
      // final user-facing response (or another tool request if truly needed).
    }

    yield '\n\nI reached the maximum number of tool turns before the request completed.';
  }

  /**
   * Single-turn helper. The caller is responsible for preserving history.
   */
  async chat(
    projectId: string,
    history: { role: string; content: string }[],
    userMessage: string,
    prDiff?: string,
    githubMeta?: GitHubMeta,
    socketId?: string,
  ): Promise<string> {
    const stream = this.chatStream(projectId, history, userMessage, prDiff, githubMeta, socketId);
    let full = '';

    for await (const chunk of stream) {
      full += chunk;
    }

    return full;
  }
}