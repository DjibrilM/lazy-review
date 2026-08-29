import { RepositoryExplorer } from './repository-explorer.js';
import { analyzeChange } from './change-analyzer.js';
import { reviewAsSpecialist } from './specialist-reviewer.js';
import { scanSensitiveFiles } from './secret-scanner.js';
import { verifyFinding } from './finding-verifier.js';
import { toRankedFinding, dedupeFindings } from './finding-ranker.js';
import { writeReview } from './review-writer.js';
import type { PRReviewResult } from '../pr-review.agent.js';
import type { ChangeModel, ReviewerCandidate, ReviewCategory } from './types.js';

export interface ReviewControllerOpts {
  projectId: string;
  repositoryPath: string;
  llmId: string;
  diffText: string;
  prTitle: string;
  prBody: string;
  semanticSearch?: (query: string) => Promise<string>;
  progress?: (message: string) => void;
}

/**
 * Orchestrates the evidence-driven pipeline:
 * ChangeAnalyzer → specialist reviewers → verifier → dedup/rank → writer.
 */
export class ReviewController {
  private explorer: RepositoryExplorer;

  constructor(private opts: ReviewControllerOpts) {
    this.explorer = new RepositoryExplorer({
      basePath: opts.repositoryPath,
      modelId: opts.llmId,
      kvCacheId: opts.projectId,
      progress: opts.progress,
      semanticSearch: opts.semanticSearch,
    });
  }

  async run(): Promise<PRReviewResult> {
    const p = this.opts.progress ?? (() => {});

    // 1. Classify the change.
    p('Classifying the change...');
    const model: ChangeModel = await analyzeChange(
      { modelId: this.opts.llmId, kvCacheId: this.opts.projectId, progress: p },
      this.opts.diffText,
      this.opts.prTitle,
      this.opts.prBody,
    );

    // 2. Specialist reviewers form hypotheses via explorer.
    const reviewers: ReviewCategory[] =
      model.reviewers.length > 0 ? model.reviewers : ['correctness'];
    p(`Running reviewers: ${reviewers.join(', ')}`);

    const candidates: ReviewerCandidate[] = [];
    for (const cat of reviewers) {
      try {
        const found = await reviewAsSpecialist(
          cat,
          {
            modelId: this.opts.llmId,
            kvCacheId: this.opts.projectId,
            progress: p,
            askExplorer: (q) => this.explorer.ask(q),
          },
          this.opts.diffText,
          model.purpose,
        );
        candidates.push(...found);
      } catch (e: any) {
        console.warn(`[ReviewController] ${cat} failed:`, e?.message);
      }
    }

    // Secret Scanner: detect sensitive files / leaked secrets not meant for GitHub.
    p('Scanning for sensitive files and leaked secrets...');
    try {
      const secretFindings = await scanSensitiveFiles(
        {
          modelId: this.opts.llmId,
          kvCacheId: this.opts.projectId,
          progress: p,
        },
        this.opts.diffText,
      );
      candidates.push(...secretFindings);
    } catch (e: any) {
      console.warn('[ReviewController] secret scan failed:', e?.message);
    }

    // 3. Adversarial verification.
    const verified = [];
    for (const candidate of candidates) {
      p(`Verifying: ${candidate.hypothesis.slice(0, 70)}...`);
      const verdict = await verifyFinding(
        {
          modelId: this.opts.llmId,
          kvCacheId: this.opts.projectId,
          progress: p,
          askExplorer: (q) => this.explorer.ask(q),
        },
        {
          hypothesis: candidate.hypothesis,
          category: candidate.category,
          evidence: candidate.evidence,
          ...(candidate.location ? { location: candidate.location } : {}),
          ...(candidate.impactDescription
            ? { impactDescription: candidate.impactDescription }
            : {}),
        },
      );
      if (verdict.verdict === 'confirmed') {
        verified.push(
          toRankedFinding({
            hypothesis: candidate.hypothesis,
            category: candidate.category,
            confidence: verdict.confidence,
            impactScore: candidate.impactScore,
            likelihoodScore: candidate.likelihoodScore,
            recommendation: verdict.recommendation ?? candidate.recommendation,
            invariant: verdict.invariant ?? candidate.invariant,
            evidence: candidate.evidence,
            location: candidate.location,
            ...(candidate.impactDescription && !verdict.recommendation
              ? { impact: candidate.impactDescription }
              : {}),
          }),
        );
      }
    }

    // 4. Dedup + rank; 5. Write review.
    const ranked = dedupeFindings(verified);
    p(`Writing review with ${ranked.length} verified finding(s).`);
    return writeReview(ranked, model.purpose, this.opts.prTitle);
  }
}
