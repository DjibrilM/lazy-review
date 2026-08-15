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
 * Centralizes tool execution. The LLM proposes an action; the runtime decides
 * whether it is allowed to execute it.
 *
 *   validate args → determine effect → build preview → ask confirmation if
 *   required → execute → record audit event
 */
export class ToolExecutor {
  private tools: Map<string, RuntimeTool> = new Map();

  constructor(tools: RuntimeTool[], private mainModule: MainModule) {
    validateTools(tools);
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  getTool(name: string): RuntimeTool | undefined {
    return this.tools.get(name);
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
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
    const tool = this.tools.get(toolCall.name);

    if (!tool) {
      return { error: `Unknown tool: ${toolCall.name}` };
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
        return { result: `User rejected the ${tool.name} action.` };
      }
    }

    try {
      // Preferred QVAC path. A structured tool call whose definition had a
      // handler exposes invoke(), which forwards the parsed arguments.
      if (typeof toolCall.invoke === 'function') {
        return await toolCall.invoke();
      }

      if (!tool.handler) {
        return { error: `Tool ${tool.name} does not have a handler.` };
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