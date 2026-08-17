import { completion } from '@qvac/sdk';
import { BaseAgent } from './base.agent.js';
import ProjectEntity from '../server/entities/project.entity.js';
import { parseDiff, createProjectManifestSummary } from './ai-agent.utils.js';
import { createGitTools } from './tools/git-tools.js';
import { createFsTools } from './tools/fs-tools.js';
import { createPrChatTools } from './tools/pr-chat-tools.js';
import type { GitHubMeta, RuntimeTool, ToolContext } from './tool-types.js';
import { ToolExecutor, serializeToolResult, resolveToolName } from './tool-executor.js';
import { AgentContextManager } from './agent-context-manager.js';

interface ParsedToolCall {
  name: string;
  arguments: unknown;
}

/**
 * Parses JSON tool calls embedded in raw model text output. Local models
 * frequently emit tool calls as JSON text in content deltas rather than as
 * structured toolCall events.
 */
function parseFallbackToolCalls(rawText: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];

  try {
    const jsonRegex = /\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}/g;

    let match: RegExpExecArray | null;

    while ((match = jsonRegex.exec(rawText)) !== null) {
      try {
        const parsed = JSON.parse(match[0]);

        if (parsed.name && parsed.arguments !== undefined) {
          calls.push({
            name: parsed.name,
            arguments: parsed.arguments,
          });
        } else if (parsed.name && parsed.args !== undefined) {
          calls.push({
            name: parsed.name,
            arguments: parsed.args,
          });
        }
      } catch {
        // Ignore malformed JSON fragments.
      }
    }

    const toolCallRegex = /<\|tool_call\|>?:?call:([a-zA-Z0-9_-]+)\{(.*?)\}/g;

    // eslint-disable-next-line no-constant-condition
    let toolMatch: RegExpExecArray | null;

    // eslint-disable-next-line no-constant-condition
    while ((toolMatch = toolCallRegex.exec(rawText)) !== null) {
      try {
        const body = toolMatch[2]?.trim();
        const args = body ? JSON.parse(`{${body}}`) : {};

        calls.push({
          name: toolMatch[1] || '',
          arguments: args,
        });
      } catch {
        try {
          calls.push({
            name: toolMatch[1] || '',
            arguments: JSON.parse(toolMatch[2] || '{}'),
          });
        } catch {
          // Ignore malformed tool-call syntax.
        }
      }
    }
  } catch {
    // Fall back to no tool calls.
  }

  return calls;
}

/**
 * Selects the tool subset exposed to the model for this turn.
 *
 * All read-only codebase exploration, branch inspection, and PR investigation
 * tools are ALWAYS available so the agent can confidently navigate the cloned
 * repository, read files, list branches, and compare implementations without
 * the user needing to use specific keywords.
 *
 * Only mutation tools (leave_pr_comment, request_pr_changes) are gated behind
 * intent detection to avoid exposing destructive actions unnecessarily.
 */
function selectTools(userMessage: string, allTools: RuntimeTool[]): RuntimeTool[] {
  const msg = userMessage.toLowerCase();

  // Always available: full codebase exploration + branch inspection + PR tools.
  // The agent should be able to navigate the cloned repository, read files,
  // list branches, and compare implementations without keyword gating.
  const alwaysAvailable = new Set([
    // PR investigation
    'read_pr_file_diff',
    'semantic_search',
    // Codebase exploration (fs-tools)
    'read_file',
    'read_file_lines',
    'read_directory',
    'get_directory_tree',
    'get_file_outline',
    'read_symbol',
    'search_in_files',
    // Git / branch inspection (git-tools)
    'get_current_branch',
    'get_recent_commits',
    'get_pr_files',
    'get_file_diff',
    'list_branches',
    'read_file_from_branch',
    'compare_file_between_branches',
    'get_branch_diff',
    'get_file_history',
    'get_file_at_commit',
    'get_branch_status',
  ]);

  const selected = new Set<string>(alwaysAvailable);

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

## CRITICAL: You MUST use tools to gather information. Never describe or plan to use a tool — actually call it.

You have access to the full cloned repository on disk. When the user asks about
code, files, branches, diffs, or history, you MUST call the appropriate tool to
get the actual data. Do NOT say "I would use X" or "Let me check X" — just call
the tool and use its result.

### Tool Usage Rules
1. If the user asks about a file → call read_file immediately.
2. If the user asks about branches → call list_branches immediately.
3. If the user asks about a diff → call get_branch_diff or read_pr_file_diff immediately.
4. If the user asks about file history → call get_file_history immediately.
5. If the user asks to compare branches → call compare_file_between_branches or get_branch_diff immediately.
6. If the user asks about the codebase structure → call get_directory_tree or read_directory immediately.
7. If the user asks about a symbol → call read_symbol or search_in_files immediately.
8. If the user asks about previous implementations → call get_file_history or read_file_from_branch immediately.

Never respond with "I would need to check" or "Let me look at" — just call the tool.
Never summarize what a tool would do — call it and report the actual result.

### Available Tools
- read_file / read_file_lines / read_directory / get_directory_tree: navigate the repository
- get_file_outline / read_symbol: understand file structure without reading everything
- search_in_files: find where symbols are used
- list_branches: see all local and remote branches
- read_file_from_branch / compare_file_between_branches: compare implementations
- get_branch_diff / get_file_history / get_file_at_commit: understand evolution
- get_current_branch / get_recent_commits / get_pr_files / get_file_diff: PR context
- leave_pr_comment: post a general comment to the current PR (requires user approval)
- request_pr_changes: submit a REQUEST_CHANGES review on the current PR (requires user approval)

GitHub and workspace mutations are executed by the runtime and always require
user approval through a confirmation dialog. NEVER claim a mutation succeeded
until its tool result reports success. If the tool result says the action was
rejected or failed, say so honestly.

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
      conversation: history,
    };

    if (githubMeta) {
      toolContext.githubMeta = githubMeta;
    }

    if (socketId) {
      toolContext.socketId = socketId;
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

      let streamedContent = '';
      let thinkingOpen = false;

      // QVAC already separates normal content, thinking, and tool calls.
      // Never try to infer a tool call from whether a text chat starts with "{".
      // Yield content deltas incrementally so the frontend can stream tokens
      // to the user in real time instead of waiting for the full response.
      //
      // Thinking and content are wrapped in explicit markers so the frontend
      // can separate reasoning (collapsed "Reasoning" panel) from the actual
      // answer. Without these markers, raw thinking text mixed in with normal
      // content corrupts markdown parsing (e.g. unclosed code fences pack
      // the explanation and snippets into a single code block).
      for await (const event of run.events as AsyncIterable<any>) {
        switch (event.type) {
          case 'thinkingDelta': {
            if (event.text) {
              // Emit an opening marker before the first thinking chunk.
              if (!thinkingOpen) {
                thinkingOpen = true;
                yield '<thinking>';
              }
              streamedContent += event.text;
              yield event.text;
            }
            break;
          }

          case 'contentDelta': {
            // Close the thinking section when real content begins.
            if (thinkingOpen) {
              thinkingOpen = false;
              yield '</thinking>';
            }
            if (event.text) {
              streamedContent += event.text;
              yield event.text;
            }
            break;
          }

          case 'toolCall': {
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

      // If the stream ends while a thinking block is still open, close it.
      if (thinkingOpen) {
        thinkingOpen = false;
        yield '</thinking>';
      }

      const result = await run.final;
      // IMPORTANT: toolCalls may be exposed asynchronously. Always await it.
      const structuredToolCalls = (await result.toolCalls) ?? [];

      const rawText =
        result.cacheableAssistantContent ?? result.contentText ?? result.raw?.fullText ?? '';

      // Check if the streamed/raw content is actually a JSON tool call the SDK
      // didn't parse into structured toolCall events. Local models frequently
      // emit tool calls as JSON text.
      let toolCalls: any[] = structuredToolCalls;

      if (toolCalls.length === 0) {
        const parsedFallback = parseFallbackToolCalls(rawText || streamedContent);

        if (parsedFallback.length > 0) {
          console.log(
            `🧰 [ChatAgent] Parsed ${parsedFallback.length} tool call(s) from raw text fallback`,
          );
          toolCalls = parsedFallback.map((call) => ({
            name: call.name,
            arguments: call.arguments,
          }));
        }
      }

      // No tool requested: the streamed content is the final answer.
      // Content was already yielded incrementally above, so just return.
      if (toolCalls.length === 0) {
        return;
      }

      // This turn contains tool calls. Discard the preliminary prose and
      // preserve the assistant's structured tool-call turn in history so the
      // follow-up completion can reason from the tool results correctly.
      contextManager.addRecent({
        role: 'assistant',
        content: rawText || streamedContent,
      });

      // Tools that mutate state or require user confirmation must run serially.
      // Read-only tools can run in parallel for much faster multi-tool turns.
      //
      // Use resolveToolName to map hallucinated aliases (e.g.
      // "anonymous.submitPRReview") to the real registered tool name so
      // mutation calls always go through the confirmation-gated serial path.
      const mutationTools = new Set(
        runtimeTools
          .filter((tool) => (tool.effect ?? 'read') !== 'read' && tool.confirmation?.required)
          .map((tool) => tool.name),
      );

      // Resolve alias names before classifying parallel vs serial calls.
      const resolvedCalls = (toolCalls as any[]).map((tc) => ({
        ...tc,
        name: resolveToolName(tc.name),
      }));

      const parallelCalls = resolvedCalls.filter((tc) => !mutationTools.has(tc.name));
      const serialCalls = resolvedCalls.filter((tc) => mutationTools.has(tc.name));

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
          console.log('🗝️ [ChatAgent] Compacting context after tool result');
          await contextManager.compactWithLLM();
        }

        contextManager.addRecent({
          role: 'tool',
          content: serializeToolResult(result),
        });
      }

      // Execute mutation tools serially (they may require confirmation)
      for (const toolCall of serialCalls) {
        const result = await executor.execute(toolCall, toolContext);

        const estimatedTokens = contextManager.estimateTokens(result);

        if (contextManager.needsCompaction(estimatedTokens)) {
          console.log('🗝️ [ChatAgent] Compacting context after tool result');
          await contextManager.compactWithLLM();
        }

        contextManager.addRecent({
          role: 'tool',
          content: serializeToolResult(result),
        });
      }

      // Loop again. The next completion sees the tool result and produces the
      // final user-facing response.
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