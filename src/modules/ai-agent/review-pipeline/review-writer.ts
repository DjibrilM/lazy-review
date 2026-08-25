import type { PRReviewResult, ReviewIssue } from '../pr-review.agent.js';
import type { RankedFinding } from './finding-ranker.js';

export function writeReview(
  rankedFindings: RankedFinding[],
  changePurpose: string,
  prTitle: string,
): PRReviewResult {
  const issues: ReviewIssue[] = rankedFindings.map((f) => ({
    severity: f.legacySeverity,
    title: f.title || f.id,
    description: buildDesc(f),
    ...(f.file ? { file: f.file } : {}),
    ...(f.line !== undefined ? { line: f.line } : {}),
    ...(f.invariant ? { convention: f.invariant } : {}),
  }));

  const c = issues.filter((i) => i.severity === 'critical').length;
  const w = issues.filter((i) => i.severity === 'warning').length;
  const s = issues.filter((i) => i.severity === 'suggestion').length;

  const verdict: PRReviewResult['overallVerdict'] =
    c > 0 || w >= 3 ? 'request_changes' : w > 0 ? 'comment' : 'approve';

  const parts: string[] = [
    changePurpose && changePurpose.trim()
      ? changePurpose.trim()
      : `This review examines "${prTitle || 'the pull request'}" through an evidence-driven pipeline: the change was classified, specialist reviewers formed hypotheses, and each finding was adversarially verified before being reported.`,
  ];

  if (rankedFindings.length > 0) {
    const counts = [
      c > 0 ? `\n- **${c} critical**` : '',
      w > 0 ? `\n- **${w} warnings**` : '',
      s > 0 ? `\n- **${s} suggestions**` : '',
    ]
      .filter(Boolean)
      .join('');
    parts.push(`### Findings${counts}`);
  } else {
    parts.push('No verified issues were found.');
  }

  return { summary: parts.join('\n\n'), issues, overallVerdict: verdict };
}

function buildDesc(f: RankedFinding): string {
  const parts: string[] = [];
  if (f.impact) parts.push(f.impact);
  if (f.recommendation) parts.push(`**Recommendation:** ${f.recommendation}`);
  if (f.invariant) parts.push(`**Invariant:** ${f.invariant}`);
  if (f.evidence.length > 0) {
    parts.push(
      '\n**Evidence:**\n' +
        f.evidence
          .slice(0, 5)
          .map((e) => `- ${e.fact}${e.source ? ` (${e.source})` : ''}`)
          .join('\n'),
    );
  }
  parts.push(`\n**Confidence:** ${Math.round(f.confidence * 100)}%`);
  return parts.join('\n');
}
