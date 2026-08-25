import { completion } from '@qvac/sdk';
import { extractJson } from './ai-agent.utils.js';

export interface ResearchMemory {
  projectUnderstanding?: {
    purpose?: string;
    applicationType?: string;
    architecture?: string;
  };
  technologies: string[];
  modules: Array<{
    path: string;
    purpose: string;
    dependencies?: string[];
  }>;
  relationships: Array<{
    from: string;
    to: string;
    relation: string;
  }>;
  conventions: string[];
  discoveries: string[];
  unresolvedQuestions: string[];
}

export interface ResearchState {
  understood: string[];
  openQuestions: string[];
  inspectedFiles: Record<string, { purpose: string; findings: string[] }>;
  currentGoal?: string;
}

export interface ResearchBudget {
  iterationsRemaining: number;
  toolCallsRemaining: number;
  sourceTokensRemaining: number;
}

export class AgentContextManager {
  private researchMemory: ResearchMemory;
  private researchState: ResearchState;
  private recentMessages: any[] = [];
  private readonly systemPrompt: string;

  constructor(
    systemPrompt: string,
    private readonly modelId: string,
    private readonly maxContextTokens = 128000,
    private readonly outputReserve = 2500,
    private readonly kvCacheId?: string,
  ) {
    this.systemPrompt = `${systemPrompt}

STRICT RULE: DO NOT use <execute_tool> tags, <think> tags, or any XML. If you want to use a tool, output ONLY a JSON object with "name" and "arguments" keys. If you want to respond to the user without using a tool, output plain text.
Example Tool Call:
{"name": "read_file", "arguments": {"filePath": "src/index.ts"}}
`;
    this.researchMemory = {
      technologies: [],
      modules: [],
      relationships: [],
      conventions: [],
      discoveries: [],
      unresolvedQuestions: [],
    };
    this.researchState = {
      understood: [],
      openQuestions: [],
      inspectedFiles: {},
    };
  }

  getResearchMemory() {
    return this.researchMemory;
  }

  getResearchState() {
    return this.researchState;
  }

  updateResearchState(updates: Partial<ResearchState>) {
    this.researchState = { ...this.researchState, ...updates };
  }

  markFileInspected(filePath: string, purpose: string, findings: string[]) {
    this.researchState.inspectedFiles[filePath] = { purpose, findings };
  }

  hasInspected(filePath: string): boolean {
    return !!this.researchState.inspectedFiles[filePath];
  }

  estimateTokens(value: unknown): number {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return Math.ceil(text.length / 4);
  }

  buildHistory(budget?: ResearchBudget) {
    let memoryContext = `
## Persistent Research Memory
${JSON.stringify(this.researchMemory, null, 2)}

## Current Research State
${JSON.stringify(this.researchState, null, 2)}
`;

    if (budget) {
      memoryContext += `\n## Research Budget Remaining\n${JSON.stringify(budget, null, 2)}\n`;
    }

    memoryContext += `\nContinue investigating or reasoning based on this memory. 
Do not assume facts not represented here or in the immediate tool results.
`;

    return [
      {
        role: 'system',
        content: this.systemPrompt,
      },
      {
        role: 'user',
        content: memoryContext,
      },
      ...this.recentMessages,
    ];
  }

  addRecent(message: any) {
    this.recentMessages.push(message);
  }

  needsCompaction(extraTokens = 0, budget?: ResearchBudget): boolean {
    const history = this.buildHistory(budget);
    const used = history.reduce((sum, msg) => sum + this.estimateTokens(msg.content), 0);
    const available = this.maxContextTokens - this.outputReserve;
    // Compact when at 70% of available space
    return used + extraTokens > available * 0.7;
  }

  async compactWithLLM(progressCallback?: (msg: string) => void): Promise<void> {
    if (this.recentMessages.length <= 1) return; // Nothing to compact really

    if (progressCallback) {
      progressCallback('🗜️ Context budget threshold reached. Distilling research memory...');
    }

    const compactionPrompt = `Update the research memory and research state using the new events below.

Rules:
- Preserve existing verified facts in ResearchMemory.
- Add newly discovered facts to ResearchMemory.
- Keep file paths and symbol references.
- Remove conversational wording.
- Update ResearchState with what is currently understood and what questions remain open.
- Keep the existing inspectedFiles in ResearchState as they are (do not clear them).

Return a JSON object with two top-level keys: "researchMemory" and "researchState".

OLD MEMORY:
${JSON.stringify({ researchMemory: this.researchMemory, researchState: this.researchState }, null, 2)}

NEW EVENTS:
${this.recentMessages.map((m) => `[${m.role.toUpperCase()}]: ${typeof m.content === 'string' ? m.content.substring(0, 5000) : JSON.stringify(m.content).substring(0, 5000)}`).join('\n\n')}
`;

    try {
      const run = completion({
        modelId: this.modelId,
        history: [{ role: 'user', content: compactionPrompt }],
        maxTokens: 4000,
        stream: false,
        toolDialect: 'json',
        ...(this.kvCacheId ? { kvCache: this.kvCacheId } : {}),
      });

      const runRes: any = await ((run as any).final || run);
      const resultText = runRes.contentText || '';

      const newCtx = extractJson(resultText);
      if (newCtx.researchMemory) {
        this.researchMemory = {
          ...this.researchMemory,
          ...newCtx.researchMemory,
        };
      }
      if (newCtx.researchState) {
        this.researchState = {
          ...this.researchState,
          ...newCtx.researchState,
          inspectedFiles: {
            ...this.researchState.inspectedFiles,
            ...(newCtx.researchState.inspectedFiles || {}),
          },
        };
      }

      // Keep only the most recent tool interactions to maintain conversational thread context
      this.recentMessages = this.recentMessages.slice(-2);

      if (progressCallback) {
        progressCallback('✅ Research memory compacted successfully.');
      }
    } catch (e: any) {
      console.warn('Failed to compact research memory:', e);
      if (progressCallback) {
        progressCallback('⚠️ Memory compaction failed, truncating oldest messages instead.');
      }
      this.recentMessages = this.recentMessages.slice(4);
    }
  }
}
