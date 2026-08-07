import { completion, embed, loadModel } from '@qvac/sdk';
import * as qvacModels from '@qvac/sdk';
import type { MainModule } from '../main.module.js';
import { QWEN_MODEL_ID, GTE_MODEL_ID } from '../../constants.js';
import SettingsEntity from '../server/entities/settings.entity.js';
import { extractJson } from './ai-agent.service.js';

export interface ReviewIssue {
  severity: 'critical' | 'warning' | 'suggestion';
  title: string;
  description: string;
  file?: string;
  line?: number;
  convention?: string;
}

export interface PRReviewResult {
  summary: string;
  issues: ReviewIssue[];
  overallVerdict: 'approve' | 'request_changes' | 'comment';
}

const REVIEW_TIMEOUT_MS = 600_000; // 10 min for CPU inference

export class ReviewService {
  constructor(private mainModule: MainModule) {}

  private async ensureModelsLoaded(): Promise<{ qwenId: string; gteId: string }> {
    const settingsRepo = this.mainModule.database.appDataSource.getRepository(SettingsEntity);
    const settings = await settingsRepo.findOneBy({ id: 1 });
    const deviceConfig = settings?.useExperimentalGpu ? undefined : 'cpu';

    const QWEN_CTX_SIZE = 32768;
    let qwenId: string = (qvacModels as any)[QWEN_MODEL_ID]?.modelId ?? QWEN_MODEL_ID;
    let gteId: string = (qvacModels as any)[GTE_MODEL_ID]?.modelId ?? GTE_MODEL_ID;

    const qvacQwen = (qvacModels as any)[QWEN_MODEL_ID];
    const qvacGte = (qvacModels as any)[GTE_MODEL_ID];

    if (qvacQwen) {
      try {
        qwenId = await loadModel({
          modelSrc: qvacQwen,
          modelConfig: {
            ctx_size: QWEN_CTX_SIZE,
            ...(deviceConfig ? { device: deviceConfig } : {}),
          },
        });
      } catch (e: any) {
        if (e?.code !== 52200) throw e; // 52200 = already loaded
        const info = await qvacModels.getModelInfo(qvacQwen);
        if (info.loadedInstances && info.loadedInstances.length > 0) {
          qwenId = info.loadedInstances[0].registryId;
        } else if (qvacQwen.modelId) {
          qwenId = qvacQwen.modelId;
        }
      }
    }

    if (qvacGte) {
      try {
        gteId = await loadModel({
          modelSrc: qvacGte,
          modelConfig: { ...(deviceConfig ? { device: deviceConfig } : {}) },
        });
      } catch (e: any) {
        if (e?.code !== 52200) throw e;
        const info = await qvacModels.getModelInfo(qvacGte);
        if (info.loadedInstances && info.loadedInstances.length > 0) {
          gteId = info.loadedInstances[0].registryId;
        } else if (qvacGte.modelId) {
          gteId = qvacGte.modelId;
        }
      }
    }

    return { qwenId, gteId };
  }

  private awaitCompletion(run: { requestId: string; final: Promise<any> }): Promise<any> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`LLM timed out after ${REVIEW_TIMEOUT_MS / 1000}s`)),
        REVIEW_TIMEOUT_MS,
      ),
    );
    return Promise.race([run.final, timeout]);
  }

  private emitProgress(projectId: string, message: string) {
    if (this.mainModule.socket) {
      this.mainModule.socket.emitReviewProgress({ projectId, status: 'running', message });
    }
  }

  /** Retrieve relevant project facts from the vector DB using semantic search. */
  private async getRelevantContext(
    projectId: string,
    gteId: string,
    query: string,
  ): Promise<string> {
    try {
      const embedResult = await embed({ modelId: gteId, text: query.substring(0, 1500) });
      const facts = await this.mainModule.database.vectorDatabase.searchFacts(
        projectId,
        embedResult.embedding as number[],
        5,
      );
      if (!facts.length) return '';
      return facts.map((f: any) => f.content).join('\n\n---\n\n');
    } catch {
      return '';
    }
  }

  /**
   * Generate a structured AI review for a PR diff, grounded in the project's
   * architectural manifest stored in the vector DB.
   */
  async generatePRReview(
    projectId: string,
    prDiff: string,
    prTitle: string,
    prBody: string,
  ): Promise<PRReviewResult> {
    const { qwenId, gteId } = await this.ensureModelsLoaded();

    this.emitProgress(projectId, '🔍 Retrieving project architectural context...');

    // Truncate diff to avoid context overflow (32k ctx, keep ~8k for response)
    const diffSnippet =
      prDiff.length > 12000 ? prDiff.substring(0, 12000) + '\n\n[DIFF TRUNCATED]' : prDiff;

    const context = await this.getRelevantContext(
      projectId,
      gteId,
      `code review for: ${prTitle} ${prBody}`,
    );

    this.emitProgress(projectId, '🤖 Analyzing PR diff against architectural manifest...');

    const systemPrompt = `You are an expert code reviewer embedded in Cactus Review. You have access to the project's architectural manifest which describes the codebase conventions, patterns, and rules.

Your job is to review the provided pull request diff and identify:
1. Architectural violations (violations of the project's established conventions)
2. Security issues
3. Code quality concerns
4. Suggestions for improvement

You MUST output ONLY valid JSON matching this exact schema — no markdown, no explanation outside the JSON:
{
  "summary": "2-3 paragraph markdown summary of the PR and your overall assessment",
  "overallVerdict": "approve" | "request_changes" | "comment",
  "issues": [
    {
      "severity": "critical" | "warning" | "suggestion",
      "title": "Short title of the issue",
      "description": "Detailed explanation of why this is an issue and how to fix it",
      "file": "optional: path/to/file.ts",
      "line": null,
      "convention": "optional: the specific convention being violated, quoted from the manifest"
    }
  ]
}`;

    const userMessage = `/no_think
## Project Architectural Context
${context || 'No indexed context available. Review based on general best practices.'}

---

## Pull Request: ${prTitle}
${prBody ? `**Description:** ${prBody}\n\n` : ''}## Diff
\`\`\`diff
${diffSnippet}
\`\`\`

Review this PR diff. Check it against the architectural conventions above. Output your JSON review now.`;

    const run = completion({
      modelId: qwenId,
      history: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      stream: false,
    });

    const result = await this.awaitCompletion(run);

    this.emitProgress(projectId, '✅ Review generation complete.');

    let parsed: PRReviewResult;
    try {
      parsed = extractJson(result.contentText);
      parsed.issues = parsed.issues || [];
      parsed.summary = parsed.summary || 'Review complete.';
      parsed.overallVerdict = parsed.overallVerdict || 'comment';
    } catch {
      parsed = {
        summary: result.contentText || 'Review generation failed to produce structured output.',
        issues: [],
        overallVerdict: 'comment',
      };
    }

    if (this.mainModule.socket) {
      this.mainModule.socket.emitReviewProgress({
        projectId,
        status: 'success',
        review: parsed,
      });
    }

    return parsed;
  }

  /**
   * Single-turn chat grounded in project context and PR diff.
   * The caller is responsible for maintaining the full history across turns.
   */
  async chat(
    projectId: string,
    history: { role: string; content: string }[],
    userMessage: string,
    prDiff?: string,
  ): Promise<string> {
    const { qwenId, gteId } = await this.ensureModelsLoaded();

    const context = await this.getRelevantContext(projectId, gteId, userMessage);

    const diffContext = prDiff
      ? `\n\n## PR Diff (for reference)\n\`\`\`diff\n${prDiff.length > 6000 ? prDiff.substring(0, 6000) + '\n[TRUNCATED]' : prDiff}\n\`\`\``
      : '';

    const systemPrompt = `You are an expert code review assistant embedded in Cactus Review. You help developers understand and improve their pull requests.

You have access to the project's architectural manifest and the PR diff. Answer the user's question concisely and accurately. If the user asks you to "request changes" or take a GitHub action, confirm what you will do but don't actually do it — the UI will handle the GitHub API call.${context ? `\n\n## Project Architectural Context\n${context}` : ''}${diffContext}`;

    // Build the conversation: existing history + new user message with /no_think
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: `/no_think\n${userMessage}` },
    ];

    const run = completion({
      modelId: qwenId,
      history: messages,
      stream: false,
    });

    const result = await this.awaitCompletion(run);
    return result.contentText || 'I was unable to generate a response. Please try again.';
  }
}
