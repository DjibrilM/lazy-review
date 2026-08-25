import { extractJson } from '../ai-agent.utils.js';
import type { ChangeModel, ReviewCategory } from './types.js';

export interface ChangeAnalyzerOpts {
  modelId: string;
  kvCacheId?: string;
  progress?: (m: string) => void;
}

const REVIEWERS: ReviewCategory[] = [
  'correctness',
  'security',
  'performance',
  'concurrency',
  'architecture',
  'maintainability',
];

export async function analyzeChange(
  opts: ChangeAnalyzerOpts,
  diffText: string,
  prTitle: string,
  prBody: string,
): Promise<ChangeModel> {
  opts.progress?.('Analyzing change scope...');

  const snippet = diffText.slice(0, 12_000);

  const prompt = `You are the first stage of a code-review pipeline. Do NOT review the code.
Classify this change so specialist reviewers know what to investigate.

## PR: ${prTitle}
${prBody ? `**Description:** ${prBody}\n\n` : ''}
## Diff
\`\`\`diff
${snippet}
\`\`\`

Output ONLY JSON:
{
  "purpose": "string",
  "changedComponents": ["string"],
  "behaviorsIntroduced": ["string"],
  "behaviorsModified": ["string"],
  "stateIntroduced": ["string"],
  "externalBoundaries": ["string"],
  "risks": ["string"],
  "investigationQuestions": ["string — precise repo questions"],
  "reviewers": ["correctness", "security", "performance", "concurrency", "architecture", "maintainability"]
}

Rules:
- investigationQuestions: precise, evidence-answerable questions like "Where are entries in pendingConfirmations removed?" — NOT vague "check the disconnect handler".
- reviewers: only relevant ones; correctness is default.
- risks: list realistic ones first.`;

  const { completion } = await import('@qvac/sdk');
  const run = completion({
    modelId: opts.modelId,
    history: [{ role: 'user', content: `/no_think\n${prompt}` }],
    stream: false,
    maxTokens: 4096,
    ...(opts.kvCacheId ? { kvCache: opts.kvCacheId } : {}),
  });
  const result = await ((run as any).final || Promise.resolve(run));
  const text: string = result?.contentText || '';

  const model: ChangeModel = {
    purpose: prTitle || 'Untitled change',
    changedComponents: [],
    behaviorsIntroduced: [],
    behaviorsModified: [],
    stateIntroduced: [],
    externalBoundaries: [],
    risks: [],
    investigationQuestions: [],
    reviewers: ['correctness'],
  };

  try {
    const p = extractJson(text);
    if (typeof p.purpose === 'string') model.purpose = p.purpose;
    for (const key of [
      'changedComponents',
      'behaviorsIntroduced',
      'behaviorsModified',
      'stateIntroduced',
      'externalBoundaries',
      'risks',
      'investigationQuestions',
    ] as const) {
      if (Array.isArray(p[key])) (model as any)[key] = p[key].map(String);
    }
    if (Array.isArray(p.reviewers)) {
      const selected = p.reviewers
        .map(String)
        .filter((r: string): r is ReviewCategory => (REVIEWERS as string[]).includes(r));
      if (selected.length > 0) model.reviewers = selected;
    }
  } catch {
    model.investigationQuestions = [
      'What observable behavior does this change introduce or modify?',
    ];
  }

  opts.progress?.(`[Analyzer] Reviewers: ${model.reviewers.join(', ')}`);
  return model;
}
