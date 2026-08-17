import type { ReviewCategory, Severity } from './types.js';
import { severityFromScore, impactSeverityToLegacy } from './types.js';

export type FindingStatus = 'candidate' | 'verified' | 'rejected';

export interface RankedFinding {
  id: string;
  title: string;
  category: ReviewCategory;
  status: FindingStatus;
  severity: Severity;
  legacySeverity: 'critical' | 'warning' | 'suggestion';
  confidence: number;
  impactScore: number;
  likelihoodScore: number;
  riskScore: number;
  file?: string | undefined;
  line?: number | undefined;
  impact?: string | undefined;
  recommendation?: string | undefined;
  invariant?: string | undefined;
  evidence: { fact: string; source: string }[];
  reportedBy: ReviewCategory[];
}

interface RankedFindingInput {
  hypothesis: string;
  category: ReviewCategory;
  confidence?: number | undefined;
  impactScore?: number | undefined;
  likelihoodScore?: number | undefined;
  impact?: string | undefined;
  recommendation?: string | undefined;
  invariant?: string | undefined;
  evidence?: { fact: string; source: string }[] | undefined;
  location?: { file: string; line?: number } | undefined;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function dedupeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 2)
    .sort()
    .join(' ');
}

export function toRankedFinding(input: RankedFindingInput): RankedFinding {
  const impact = input.impactScore ?? 2;
  const likelihood = input.likelihoodScore ?? 2;
  const severity = severityFromScore(impact, likelihood);
  const evidence = (input.evidence ?? []).map((e) => ({
    fact: String(e.fact ?? ''),
    source: String(e.source ?? ''),
  }));
  return {
    id: `F-${Math.abs(hashStr(input.hypothesis))}`,
    title: input.hypothesis.split('.').slice(0, 2).join('.') || input.hypothesis,
    category: input.category,
    status: 'verified',
    severity,
    legacySeverity: impactSeverityToLegacy(severity),
    confidence: input.confidence ?? 0.5,
    impactScore: impact,
    likelihoodScore: likelihood,
    riskScore: impact * likelihood,
    file: input.location?.file,
    line: input.location?.line,
    impact: input.impact,
    recommendation: input.recommendation,
    invariant: input.invariant,
    evidence,
    reportedBy: [input.category],
  };
}

export function dedupeFindings(findings: RankedFinding[]): RankedFinding[] {
  const groups: RankedFinding[][] = [];
  for (const f of findings) {
    const keys = dedupeKey(f.title + ' ' + f.evidence.map((e) => e.fact).join(' ')).split(' ');
    let placed = false;
    for (const group of groups) {
      const rep = group[0]!;
      const repKeys = dedupeKey(rep.title + ' ' + rep.evidence.map((e) => e.fact).join(' ')).split(' ');
      const sameSpot =
        rep.file && f.file && rep.file === f.file &&
        rep.line !== undefined && f.line !== undefined &&
        Math.abs((rep.line as number) - (f.line as number)) <= 5;
      const k = new Set(repKeys);
      const common = keys.filter((w) => k.has(w)).length;
      const ratio = common / Math.max(1, Math.min(keys.length, repKeys.length));
      if (sameSpot || ratio > 0.55) {
        group.push(f);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([f]);
  }
  return groups
    .map((group) => {
      const best = group.reduce((acc, f) => (f.impactScore * f.likelihoodScore > acc.impactScore * acc.likelihoodScore ? f : acc));
      const evidence = new Map<string, { fact: string; source: string }>();
      group.forEach((f) => f.evidence.forEach((e) => evidence.set(e.fact + e.source, e)));
      const reportedBy = [...new Set(group.map((f) => f.category))];
      return {
        ...best,
        id: `R-${Math.abs(hashStr(best.title))}`,
        evidence: [...evidence.values()],
        riskScore: best.impactScore * best.likelihoodScore,
        confidence: Math.min(1, best.confidence + (reportedBy.length - 1) * 0.05),
        reportedBy,
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore || b.confidence - a.confidence);
}
