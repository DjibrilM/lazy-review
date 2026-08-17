import crypto from 'crypto';
import type { MainModule } from '../main.module.js';
import type { AgentConfirmationRequest, RuntimeTool, ToolContext } from './tool-types.js';

export function normalizeToolArguments(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  return {};
}

export function serializeToolResult(result: unknown): string {
  if (typeof result === 'string') return result;

  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

/**
 * Validates that no duplicate tool names reach inference. Duplicate names
 * cause silent, non-deterministic execution because the first match wins.
 */
export function validateTools(tools: RuntimeTool[]): RuntimeTool[] {
  const seen = new Set<string>();

  for (const tool of tools) {
    if (seen.has(tool.name)) {
      throw new Error(`Duplicate tool registration: ${tool.name}`);
    }
    seen.add(tool.name);
  }

  return tools;
}

/**
 * Maps model-hallucinated or aliased tool names to the actual registered
 * runtime tool. Local models frequently emit names like
 * `anonymous.submitPRReview` from a remembered tool dictionary instead of
 * the exact registered name `leave_pr_comment`. Without this mapping the
 * call is rejected BEFORE confirmation is requested, so the user never
 * sees a confirmation dialog and the model may still claim success.
 */
const TOOL_ALIASES: Record<string, string> = {
  'anonymous.submitPRReview': 'leave_pr_comment',
  submitPRReview: 'leave_pr_comment',
  submit_review: 'leave_pr_comment',
  submite_review: 'leave_pr_comment',
  postComment: 'leave_pr_comment',
  post_comment: 'leave_pr_comment',
  leaveComment: 'leave_pr_comment',
  leave_comment: 'leave_pr_comment',
  postPRComment: 'leave_pr_comment',
  post_pr_comment: 'leave_pr_comment',
  submitComment: 'leave_pr_comment',
  submit_comment: 'leave_pr_comment',
  requestChanges: 'request_pr_changes',
  request_changes: 'request_pr_changes',
  requestPRChanges: 'request_pr_changes',
  request_pr_changes_review: 'request_pr_changes',
};

/**
 * Resolves a model-emitted tool name (which may be an alias or hallucination)
 * to the actual registered runtime tool name.
 */
export function resolveToolName(name: string): string {
  return TOOL_ALIASES[name] ?? name;
}

/**
 * Centralizes tool execution. The LLM proposes an action; the runtime decides
 * whether it is allowed to execute it.
 *
 *   validate args → determine effect → build preview → ask confirmation if
 *   required → execute → record audit event
 */
export class ToolExecutor {
  private tools: Map<string, RuntimeTool> = new Map();

  constructor(
    tools: RuntimeTool[],
    private mainModule: MainModule,
  ) {
    validateTools(tools);
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  getTool(name: string): RuntimeTool | undefined {
    // Resolve aliases / hallucinated names to the real registered tool.
    const resolvedName = resolveToolName(name);
    return this.tools.get(resolvedName);
  }

  hasTool(name: string): boolean {
    return this.getTool(name) !== undefined;
  }

  get names(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Execute a single tool call. Mutation tools (effect !== 'read') that
   * declare confirmation.required will be gated behind a structured
   * confirmation request bound to the initiating socket.
   */
  async execute(toolCall: any, context: ToolContext): Promise<unknown> {
    const originalName = toolCall.name;
    const resolvedName = resolveToolName(originalName);
    const tool = this.tools.get(resolvedName);

    if (!tool) {
      return {
        error: `Unknown tool: ${originalName}. Available tools: ${this.names.join(', ')}. Try again with the exact tool name.`,
      };
    }

    // Use the resolved name for downstream logic (effect, confirmation, etc.).
    if (resolvedName !== originalName) {
      console.log(`🧭 [ToolExecutor] Resolved tool alias "${originalName}" → "${resolvedName}"`);
      toolCall.name = resolvedName;
    }

    console.log(`🤖 [ToolExecutor] Executing tool: ${toolCall.name}`, toolCall.arguments);

    // Validate arguments against the tool schema.
    const rawArgs = normalizeToolArguments(toolCall.arguments ?? toolCall.args);
    const parsedArgs = tool.parameters.safeParse(rawArgs);

    if (!parsedArgs.success) {
      return {
        error: `Invalid arguments for ${toolCall.name}`,
        details: parsedArgs.error.flatten(),
      };
    }

    // Mutation tools require user authorization before execution.
    // Tools without an explicit effect default to read-only.
    const effect = tool.effect ?? 'read';

    if (effect !== 'read' && tool.confirmation?.required) {
      const approved = await this.requestConfirmation(
        tool,
        parsedArgs.data as Record<string, unknown>,
        context,
      );

      if (!approved) {
        return {
          error: `The user declined the ${toolCall.name} action. The action was NOT executed. Do not claim it succeeded.`,
        };
      }
    }

    try {
      // Preferred QVAC path. A structured tool call whose definition had a
      // handler exposes invoke(), which forwards the parsed arguments.
      if (typeof toolCall.invoke === 'function') {
        return await toolCall.invoke();
      }

      if (!tool.handler) {
        return { error: `Tool ${toolCall.name} does not have a handler.` };
      }

      return await tool.handler(parsedArgs.data, context);
    } catch (error: any) {
      return { error: error?.message ?? String(error) };
    }
  }

  private async requestConfirmation(
    tool: RuntimeTool,
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<boolean> {
    if (!context.socketId) {
      console.warn(
        `[ToolExecutor] No socketId available for confirmation of ${tool.name}; denying by default.`,
      );
      return false;
    }

    const preview = tool.confirmation?.buildPreview?.(args, context);

    const action: AgentConfirmationRequest['action'] = {
      type: tool.name,
      title: preview?.title ?? `Execute ${tool.name}`,
    };

    if (preview?.description) {
      action.description = preview.description;
    }

    const confirmation: AgentConfirmationRequest = {
      sessionId: context.sessionId,
      toolCallId: crypto.randomUUID(),
      action,
      tool: {
        name: tool.name,
        arguments: args,
      },
    };

    if (context.githubMeta) {
      confirmation.target = {
        provider: 'github',
        owner: context.githubMeta.owner,
        repo: context.githubMeta.repo,
        pullNumber: context.githubMeta.pull_number,
      };
    }

    if (preview?.request) {
      confirmation.request = preview.request;
    }

    if (context.conversation) {
      confirmation.conversation = { messages: context.conversation };
    }

    return this.mainModule.socket.requestConfirmation(context.socketId, confirmation);
  }
}
