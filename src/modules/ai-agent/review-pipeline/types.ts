export type ReviewCategory =
  | 'correctness'
  | 'security'
  | 'performance'
  | 'concurrency'
  | 'architecture'
  | 'maintainability';

export type Severity = 'info' | 'warning' | 'critical';

export interface Evidence {
  fact: string;
  source: string;
}

export interface ExplorerAnswer {
  question: string;
  facts: Evidence[];
  confidence: number;
  missingEvidence: boolean;
}

export interface ReviewerCandidate {
  category: ReviewCategory;
  hypothesis: string;
  confidence: number;
  impactScore?: 1 | 2 | 3 | 4;
  likelihoodScore?: 1 | 2 | 3 | 4;
  impactDescription?: string;
  recommendation?: string;
  invariant?: string;
  evidence: Evidence[];
  location?: { file: string; line?: number };
}

export interface VerifierVerdict {
  verdict: 'confirmed' | 'disproven';
  confidence: number;
  supportingEvidence?: string[];
  counterEvidence?: string[];
  recommendation?: string;
  invariant?: string;
}

export interface ChangeModel {
  purpose: string;
  changedComponents: string[];
  behaviorsIntroduced: string[];
  behaviorsModified: string[];
  stateIntroduced: string[];
  externalBoundaries: string[];
  risks: string[];
  investigationQuestions: string[];
  reviewers: ReviewCategory[];
}

export const REVIEWER_DESCRIPTIONS: Record<ReviewCategory, { description: string; focus: string }> =
  {
    correctness: {
      description:
        'Detect correctness bugs: race conditions, null dereferences, stale state, incorrect edge-case handling, and logic errors.',
      focus:
        'Does this change behave correctly under edge cases, unusual inputs, or unexpected ordering?',
    },
    security: {
      description:
        'Detect security vulnerabilities: injection, broken authorization, missing validation, unsafe deserialization, and leaked secrets.',
      focus:
        'Can an attacker leverage this change to violate confidentiality, integrity, or availability?',
    },
    performance: {
      description:
        'Detect performance problems: quadratic loops, blocking work in hot paths, unbounded queues, and wasted computation.',
      focus:
        'Does this change introduce latency, memory growth, or throughput regressions under realistic load?',
    },
    concurrency: {
      description:
        'Detect concurrency bugs: shared-state races, missing synchronization, deadlock, and unsafe async ordering.',
      focus:
        'Can this change corrupt state when multiple requests, connections, or processes interleave?',
    },
    architecture: {
      description:
        'Detect architectural defects: layer violations, hidden coupling, missing abstractions, and design-level breakage.',
      focus:
        'Does this change respect the module boundaries and architecture, or does it introduce structural debt?',
    },
    maintainability: {
      description:
        'Detect maintainability issues: duplicated logic, dead branches, unclear naming, and untestable code.',
      focus: 'Will maintainers be able to safely modify or extend this code later?',
    },
  };

export function severityFromScore(impact: number, likelihood: number): Severity {
  const score = impact * likelihood;
  if (score >= 9) return 'critical';
  if (score >= 4) return 'warning';
  return 'info';
}

export function impactSeverityToLegacy(severity: Severity): 'critical' | 'warning' | 'suggestion' {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'warning';
    case 'info':
      return 'suggestion';
  }
}
