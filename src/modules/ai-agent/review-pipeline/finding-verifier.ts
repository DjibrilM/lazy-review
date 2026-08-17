import { extractJson } from '../ai-agent.utils.js';
import { runAgentLoop, type ToolDefinition } from './agent-loop.js';
import type { ExplorerAnswer, VerifierVerdict } from './types.js';

export interface VerifierOpts {
  modelId: string;
  kvCacheId?: string | undefined;
  progress?: ((m: string) => void) | undefined;
  askExplorer: (q: string) => Promise<ExplorerAnswer>;
}

/**
 * Adversarial finding verifier.
 *
 * Given a candidate finding, the verifier DELIBERATELY attempts to DISPROVE it
 * by searching for cleanup elsewhere, timeout mechanisms, lifecycle handlers,
 * guarantees, or callers that prevent the failure. Only evidence that survives
 * this adversarial search is approved.
 */
export async function verifyFinding(
  opts: VerifierOpts,
  candidate: {
    hypothesis: string;
    category: string;
    impactDescription?: string;
    evidence: { fact: string; source: string }[];
    location?: { file: string; line?: number };
  },
): Promise<VerifierVerdict> {
  const evidenceText =
    candidate.evidence.map((e) => `- ${e.fact} (${e.source})`).join('\n') ||
    'No evidence provided.';

  const locationText = candidate.location
    ? ` at ${candidate.location.file}${candidate.location.line ? `:${candidate.location.line}` : ''}`
    : '';

  const system = `You are an adversarial finding verifier for code review.

Your job is to ATTEMPT TO DISPROVE a candidate finding. Do not argue in its favor.

SEARCH FOR:
- cleanup performed elsewhere that makes the problem impossible
- timeout or retry mechanisms that prevent the failure
- lifecycle handlers that restore correctness
- guarantees or callers that prevent the invalid state
- code outside the diff that already handles the situation

PROCEDURE:
1. Ask the explorer targeted questions to look for counter-evidence.
2. If your adversarial search finds protection, return { "verdict": "disproven" }.
3. If the evidence still supports the finding, return { "verdict": "confirmed" }.
4. If genuinely uncertain, use confidence to reflect uncertainty.

Output ONLY JSON:
{
  "verdict": "confirmed" | "disproven",
  "confidence": 0.0-1.0,
  "supportingEvidence": ["string"],
  "counterEvidence": ["string"],
  "recommendation": "fix suggestion (if confirmed)",
  "invariant": "the invariant that should hold (if confirmed)"
}`;

  const tools: ToolDefinition[] = [
    {
      name: 'ask_explorer',
      description:
        'Ask the Repository Explorer a precise adversarial question. Returns evidence facts.',
      handler: async (a) => {
        const q = String(a.question ?? a.q ?? '');
        if (!q) return { error: 'question required' };
        const ans = await opts.askExplorer(q);
        return {
          question: ans.question,
          facts: ans.facts,
          confidence: ans.confidence,
          missingEvidence: ans.missingEvidence,
        };
      },
    },
  ];

  const userMessage = `## Candidate Finding (category: ${candidate.category})${locationText}
${candidate.hypothesis}
${candidate.impactDescription ? `\nImpact: ${candidate.impactDescription}` : ''}

Evidence:
${evidenceText}

Attempt to DISPROVE this finding. Ask the explorer to look for:
- cleanup elsewhere
- timeouts
- lifecycle handlers
- callers that prevent the issue

Output the JSON verdict when done.`;

  const result = await runAgentLoop({
    modelId: opts.modelId,
    systemPrompt: system,
    userMessage,
    tools,
    maxIterations: 4,
    maxToolCalls: 5,
    maxSourceTokens: 8_000,
    kvCacheId: opts.kvCacheId,
    progress: (m) => opts.progress?.('[Verifier] ' + m),
    finalize: `Output ONLY a JSON verdict:
{
  "verdict": "confirmed" | "disproven",
  "confidence": 0.0-1.0,
  "supportingEvidence": ["string"],
  "counterEvidence": ["string"],
  "recommendation": "string",
  "invariant": "string"
}
No markdown.`,
  });

  try {
    const p = extractJson(result.text);
    const v: VerifierVerdict = {
      verdict: p.verdict === 'confirmed' ? 'confirmed' : 'disproven',
      confidence: clamp(p.confidence, 0.5),
    };
    const se = arr(p.supportingEvidence);
    if (se) v.supportingEvidence = se;
    const ce = arr(p.counterEvidence);
    if (ce) v.counterEvidence = ce;
    const rec = str(p.recommendation);
    if (rec) v.recommendation = rec;
    const inv = str(p.invariant);
    if (inv) v.invariant = inv;
    return v;
  } catch {
    return { verdict: 'disproven', confidence: 0.1 };
  }
}

function clamp(n: unknown, fallback: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

function arr(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.map(String) : undefined;
}

function str(v: unknown): string | undefined {
  return v ? String(v) : undefined;
}
