import { extractJson } from '../ai-agent.utils.js';
import { runAgentLoop, type ToolDefinition } from './agent-loop.js';
import { REVIEWER_DESCRIPTIONS } from './types.js';
import type { ExplorerAnswer, ReviewerCandidate, ReviewCategory } from './types.js';

export interface ReviewerOpts {
  modelId: string;
  kvCacheId?: string;
  progress?: (m: string) => void;
  askExplorer: (q: string) => Promise<ExplorerAnswer>;
}

const BUDGET = 5;

export async function reviewAsSpecialist(
  category: ReviewCategory,
  opts: ReviewerOpts,
  diffText: string,
  changeContext: string,
): Promise<ReviewerCandidate[]> {
  const { description, focus } = REVIEWER_DESCRIPTIONS[category];

  const system = `You are a ${category} code reviewer.

${description}
FOCUS: ${focus}

You do NOT have raw file access. To investigate, ask the Repository Explorer
precise questions via the ask_explorer tool. You have ${BUDGET} investigations.

LOOP: form hypothesis → ask precise question → review evidence → supported/rejected.
STOP when: confirmed, disproven, further exploration unlikely to change conclusion, or budget exhausted.

Output ONLY a JSON array of candidate findings:
[{"category":"${category}","hypothesis":"...","confidence":0.0-1.0,"impactScore":1-4,"likelihoodScore":1-4,"impactDescription":"...","recommendation":"...","invariant":"...","evidence":[{"fact":"...","source":"file:line"}],"location":{"file":"src/x.ts","line":42}}]
Use "evidence" only from Explorer answers.`;

  const tools: ToolDefinition[] = [
    {
      name: 'ask_explorer',
      description: 'Ask the Repository Explorer a precise question. Returns evidence facts.',
      handler: async (a) => {
        const q = String(a.question ?? a.q ?? '');
        if (!q) return { error: 'question required' };
        const ans = await opts.askExplorer(q);
        return { question: ans.question, facts: ans.facts, confidence: ans.confidence, missingEvidence: ans.missingEvidence };
      },
    },
  ];

  const result = await runAgentLoop({
    modelId: opts.modelId,
    systemPrompt: system,
    userMessage: `## ${category.toUpperCase()} REVIEW\n## Diff\n\`\`\`diff\n${diffText.slice(0, 8000)}\n\`\`\`\n${changeContext ? `\n## Context\n${changeContext}` : ''}\n\nReview this change for ${category} issues. Ask the explorer for evidence. Output the JSON array when done.`,
    tools,
    maxIterations: 8,
    maxToolCalls: BUDGET + 1,
    maxSourceTokens: 10_000,
    kvCacheId: opts.kvCacheId,
    progress: (m) => opts.progress?.('[' + category + '] ' + m),
    finalize: 'Output ONLY a JSON array (possibly empty) of candidate findings. No markdown.',
  });

  try {
    const parsed = extractJson(result.text);
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed.findings) ? parsed.findings : [];
    return arr
      .filter((f: any) => f && typeof f.hypothesis === 'string')
      .map((f: any): ReviewerCandidate => {
        const c: ReviewerCandidate = {
          category,
          hypothesis: String(f.hypothesis),
          confidence: clamp(f.confidence),
          evidence: Array.isArray(f.evidence)
            ? f.evidence.map((e: any) => ({ fact: String(e.fact ?? ''), source: String(e.source ?? '') }))
            : [],
        };
        const impactScore = clampScore(f.impactScore);
        if (impactScore !== undefined) c.impactScore = impactScore;
        const likelihoodScore = clampScore(f.likelihoodScore);
        if (likelihoodScore !== undefined) c.likelihoodScore = likelihoodScore;
        if (f.impactDescription) c.impactDescription = String(f.impactDescription);
        if (f.recommendation) c.recommendation = String(f.recommendation);
        if (f.invariant) c.invariant = String(f.invariant);
        const loc = buildLocation(f.location);
        if (loc) c.location = loc;
        return c;
      });
  } catch {
    return [];
  }
}

function clamp(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
}

function clampScore(n: unknown): 1 | 2 | 3 | 4 | undefined {
  const v = Number(n);
  if (!Number.isFinite(v)) return undefined;
  return Math.min(4, Math.max(1, Math.round(v))) as 1 | 2 | 3 | 4;
}

function buildLocation(loc: unknown): { file: string; line?: number } | undefined {
  if (!loc || typeof loc !== 'object') return undefined;
  const o = loc as Record<string, unknown>;
  const file = String(o.file ?? '');
  if (!file) return undefined;
  const line = Number(o.line);
  return { file, ...(Number.isFinite(line) && line > 0 ? { line } : {}) };
}
