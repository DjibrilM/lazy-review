import { completion } from '@qvac/sdk';

export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  handler?: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface AgentLoopOptions {
  modelId: string;
  systemPrompt: string;
  userMessage: string;
  tools: ToolDefinition[];
  maxIterations?: number;
  maxToolCalls?: number;
  maxSourceTokens?: number;
  kvCacheId?: string | undefined;
  progress?: ((message: string) => void) | undefined;
  shouldStopAfter?: ((toolName: string, result: unknown) => boolean) | undefined;
  finalize?: string | undefined;
}

export interface AgentLoopResult {
  text: string;
  iterations: number;
  toolCalls: ParsedToolCall[];
  toolResults: { name: string; args: Record<string, unknown>; result: unknown }[];
  stopReason:
    | 'final-text'
    | 'max-iterations'
    | 'max-tool-calls'
    | 'max-source-tokens'
    | 'finish-tool';
}

const TOOL_FORMAT_RULE = `\n\nSTRICT RULE: DO NOT use <execute_tool> tags or XML. If you want to use a tool, output ONLY a JSON object with "name" and "arguments" keys. If you want to respond without a tool, output plain text.\nExample: {"name": "read_file", "arguments": {"filePath": "src/index.ts"}}`;

function normalizeArgs(input: unknown): Record<string, unknown> {
  if (!input) return {};
  if (typeof input === 'string') {
    try {
      const p = JSON.parse(input);
      return p && typeof p === 'object' ? p : {};
    } catch {
      return {};
    }
  }
  if (typeof input === 'object' && !Array.isArray(input)) return input as Record<string, unknown>;
  return {};
}

function parseJsonToolCalls(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  const regex = /\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    try {
      const p = JSON.parse(m[0]);
      if (p?.name && p.arguments !== undefined)
        calls.push({ name: String(p.name), arguments: p.arguments });
      else if (p?.name && p?.args !== undefined)
        calls.push({ name: String(p.name), arguments: p.args });
    } catch {
      // skip
    }
  }
  const agRegex = /<\|tool_call\|>?:?call:([a-zA-Z0-9_-]+)\{(.*?)\}/g;
  let am: RegExpExecArray | null;
  while ((am = agRegex.exec(text)) !== null) {
    try {
      calls.push({ name: am[1] ?? '', arguments: JSON.parse(am[2] ?? '{}') });
    } catch {
      try {
        calls.push({ name: am[1] ?? '', arguments: JSON.parse('{' + (am[2] ?? '') + '}') });
      } catch {
        // skip
      }
    }
  }
  return calls;
}

function estimateTokens(v: unknown): number {
  const t = typeof v === 'string' ? v : JSON.stringify(v);
  return Math.ceil((t ?? '').length / 4);
}

export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const {
    modelId,
    systemPrompt,
    userMessage,
    tools,
    maxIterations = 8,
    maxToolCalls = 20,
    maxSourceTokens = 14_000,
    kvCacheId,
    progress,
    shouldStopAfter,
    finalize,
  } = opts;

  const history: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt + TOOL_FORMAT_RULE },
    { role: 'user', content: userMessage },
  ];

  let iterations = 0;
  let toolCallsCount = 0;
  let sourceTokensUsed = 0;
  let text = '';
  const toolResults: { name: string; args: Record<string, unknown>; result: unknown }[] = [];

  while (
    iterations < maxIterations &&
    toolCallsCount < maxToolCalls &&
    sourceTokensUsed < maxSourceTokens
  ) {
    iterations++;
    progress?.(`Iteration ${iterations}/${maxIterations}`);

    const run = completion({
      modelId,
      history: history as any,
      tools: tools as any,
      toolDialect: 'json',
      stream: false,
      maxTokens: 2048,
      ...(kvCacheId ? { kvCache: kvCacheId } : {}),
    });

    const result = await ((
      'final' in run && typeof (run as any).final === 'function'
        ? (run as any).final
        : Promise.resolve(run)
    ) as Promise<any>);

    const rawText: string = result?.contentText || result?.raw?.fullText || '';

    let calls: ParsedToolCall[] = [];
    const structured = await (result?.toolCalls ?? Promise.resolve([]));
    if (structured?.length > 0) {
      calls = structured.map((c: any) => ({
        name: c.name || c.function?.name || '',
        arguments: normalizeArgs(c.arguments || c.function?.arguments || c.args || {}),
      }));
    } else {
      calls = parseJsonToolCalls(rawText);
    }

    if (calls.length === 0) {
      text = rawText;
      break;
    }

    history.push({ role: 'assistant', content: rawText });

    let stop = false;

    for (const call of calls) {
      if (toolCallsCount >= maxToolCalls) break;
      toolCallsCount++;

      const tool = tools.find((t) => t.name === call.name);
      if (!tool) {
        history.push({
          role: 'tool',
          content: JSON.stringify({ error: `Unknown tool: ${call.name}` }),
        });
        continue;
      }

      try {
        const resultValue = tool.handler
          ? await tool.handler(call.arguments)
          : { error: 'Tool has no handler' };

        sourceTokensUsed += estimateTokens(resultValue);
        toolResults.push({ name: call.name, args: call.arguments, result: resultValue });
        history.push({
          role: 'tool',
          content: typeof resultValue === 'string' ? resultValue : JSON.stringify(resultValue),
        });

        if (shouldStopAfter && shouldStopAfter(call.name, resultValue)) {
          stop = true;
          break;
        }
      } catch (e: any) {
        history.push({ role: 'tool', content: JSON.stringify({ error: e?.message || String(e) }) });
      }
    }

    if (stop) break;
  }

  if (!text && finalize) {
    history.push({ role: 'user', content: finalize });
    const run = completion({
      modelId,
      history: history as any,
      stream: false,
      maxTokens: 4096,
      ...(kvCacheId ? { kvCache: kvCacheId } : {}),
    });
    const finalResult = await ((run as any).final || Promise.resolve(run));
    text = finalResult?.contentText || '';
  }

  const stopReason: AgentLoopResult['stopReason'] = text
    ? 'final-text'
    : sourceTokensUsed >= maxSourceTokens
      ? 'max-source-tokens'
      : toolCallsCount >= maxToolCalls
        ? 'max-tool-calls'
        : iterations >= maxIterations
          ? 'max-iterations'
          : 'finish-tool';

  return { text, iterations, toolCalls: [], toolResults, stopReason };
}
