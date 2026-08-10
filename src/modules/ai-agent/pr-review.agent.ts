import { completion } from '@qvac/sdk';
import { BaseAgent } from './base.agent.js';
import ProjectEntity from '../server/entities/project.entity.js';
import { extractJson, parseDiff, createProjectManifestSummary } from './ai-agent.utils.js';
import { z } from 'zod';
import { createGitTools } from './tools/git-tools.js';
import { createFsTools } from './tools/fs-tools.js';
import { AgentContextManager } from './agent-context-manager.js';

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

export class PrReviewAgent extends BaseAgent {
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
    const { llmId, embeddingId } = await this.ensureModelsLoaded();

    const project = await ProjectEntity.findOne({ where: { id: projectId } });
    if (!project) throw new Error(`Project ${projectId} not found.`);

    const gitTools = createGitTools(project.repository_path);
    const fsTools = createFsTools(project.repository_path);
    const tools = [...gitTools, ...fsTools];

    const context = await this.getRelevantContext(
      projectId,
      embeddingId,
      `code review for: ${prTitle} ${prBody}`,
    );

    const jsonSchema = `{
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

    const systemPrompt = `You are an expert autonomous code reviewer embedded in Cactus Review. You have access to the project's architectural manifest which describes the codebase conventions, patterns, and rules.

            Your job is to review the provided pull request diff and identify:
            1. Architectural violations (violations of the project's established conventions)
            2. Security issues
            3. Code quality concerns
            4. Suggestions for improvement

            You must use your tools (like switch_branch, get_pr_files, get_file_diff, and read_file) to investigate the PR thoroughly before rendering a verdict.
            Once you have enough context, you MUST output ONLY valid JSON matching this exact schema — no markdown, no explanation outside the JSON:
            ${jsonSchema}`;

    const parsedDiffFiles = prDiff ? parseDiff(prDiff) : [];
    const changedFiles = parsedDiffFiles.map((f) => f.file);
    const diffSnippet =
      changedFiles.length > 0
        ? `## Changed Files in PR:\n${changedFiles.map((f) => `- ${f}`).join('\n')}\n\nUse the \`read_pr_file_diff\` tool to view the exact changes for these files.`
        : 'No files changed.';

    const projectOverview = project.analysis
      ? createProjectManifestSummary(project.analysis)
      : 'No project overview available.';

    // Provide the tool so the agent can read files slowly and on-demand
    const readPrFileDiffTool = {
      name: 'read_pr_file_diff',
      description: 'Get the exact diff for a specific file modified in this PR.',
      parameters: z.object({
        file_path: z.string().describe('The path of the changed file (e.g. src/main.ts).'),
      }),
      handler: async (args: { file_path: string }) => {
        const fileDiff = parsedDiffFiles.find((f) => f.file === args.file_path);
        if (fileDiff) return { diff: fileDiff.diff };
        return { error: `File ${args.file_path} not found in this PR's diff.` };
      },
    };

    const semanticSearchTool = {
      name: 'semantic_search',
      description:
        'Search the indexed codebase using semantic similarity. Useful for finding architecture patterns, existing conventions, or context about unfamiliar code.',
      parameters: z.object({
        query: z.string().describe('The search query for semantic matching.'),
      }),
      handler: async (args: { query: string }) => {
        const factsContext = await this.getRelevantContext(projectId, embeddingId, args.query);
        if (!factsContext) return { result: 'No relevant semantic information found.' };
        return { result: factsContext };
      },
    };

    const runtimeTools = [...tools, readPrFileDiffTool, semanticSearchTool];

    const userMessage = `/no_think
            ## Codebase Overview (Project Manifest)
            ${projectOverview}
            
            ## Relevant Semantic Context
            ${context || 'No indexed semantic context available.'}

            ---

            ## Pull Request: ${prTitle}
            ${prBody ? `**Description:** ${prBody}\n\n` : ''}
            ${diffSnippet}

      Review this PR. You MUST use the \`read_pr_file_diff\` tool to read the specific file diffs you need to explore the changes. Output your JSON review when done.`;

    const contextManager = new AgentContextManager(
      systemPrompt,
      llmId,
      128000,
      2500,
      projectId.toString(),
    );
    contextManager.addRecent({ role: 'user', content: userMessage });

    const MAX_ITERATIONS = 15;
    let iterations = 0;
    let finalResponseText = '';

    while (iterations < MAX_ITERATIONS) {
      // Compaction logic removed temporarily

      const run = completion({
        modelId: llmId,
        history: contextManager.buildHistory(),
        tools: runtimeTools as any,
        toolDialect: 'json',
        stream: false,
        kvCache: projectId.toString(),
      });

      const result = await this.awaitCompletion(run);
      const text = result.contentText || '';
      contextManager.addRecent({ role: 'assistant', content: text });

      const resolvedToolCalls = await result.toolCalls;
      let toolCalls: any[] = [];
      if (resolvedToolCalls && resolvedToolCalls.length > 0) {
        toolCalls = resolvedToolCalls;
      } else {
        const regex = /\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed.name && parsed.arguments) {
              toolCalls.push(parsed);
            }
          } catch {
            // ignore
          }
        }

        const agRegex = /<\|tool_call\|>?:?call:([a-zA-Z0-9_-]+)\{(.*?)\}/g;
        let agMatch;
        while ((agMatch = agRegex.exec(text)) !== null) {
          try {
            let parsedArgs = {};
            if (agMatch[2] && agMatch[2].trim()) {
              parsedArgs = JSON.parse('{' + agMatch[2] + '}');
            }
            toolCalls.push({ name: agMatch[1] || '', arguments: parsedArgs });
          } catch {
            try {
              const parsedArgs = JSON.parse(agMatch[2] || '{}');
              toolCalls.push({ name: agMatch[1] || '', arguments: parsedArgs });
            } catch {
              // ignore
            }
          }
        }
      }

      if (toolCalls.length > 0) {
        for (const call of toolCalls) {
          const tool = runtimeTools.find((t) => t.name === call.name);
          if (tool) {
            console.log(`🤖 [Executing Tool] ${tool.name}`, call.arguments);
            try {
              let toolResult;
              if ('invoke' in call && typeof call.invoke === 'function') {
                toolResult = await call.invoke();
              } else if ('handler' in tool && typeof (tool as any).handler === 'function') {
                toolResult = await (tool as any).handler(call.arguments);
              } else if ('invoke' in tool && typeof (tool as any).invoke === 'function') {
                toolResult = await (tool as any).invoke(call.arguments);
              }

              const estimatedTokens = contextManager.estimateTokens(toolResult);
              // Compaction removed temporarily
              contextManager.addRecent({
                role: 'tool',
                content: JSON.stringify(toolResult, null, 2),
              });
            } catch (e: any) {
              contextManager.addRecent({ role: 'tool', content: `Tool error: ${e.message}` });
            }
          } else {
            contextManager.addRecent({ role: 'tool', content: `Tool ${call.name} not found.` });
          }
        }
      } else {
        finalResponseText = text;
        break;
      }
      iterations++;
    }

    let parsed: PRReviewResult;
    try {
      parsed = extractJson(finalResponseText);
      if (!parsed.summary) throw new Error('Missing summary');
    } catch {
      contextManager.addRecent({
        role: 'user',
        content: `/no_think\nYou have reached the maximum number of research steps. Output the final JSON strictly following this schema:\n${jsonSchema}`,
      });
      const finalRun = completion({
        modelId: llmId,
        history: contextManager.buildHistory(),
        stream: false,
        kvCache: projectId.toString(),
      });
      const finalResult = await this.awaitCompletion(finalRun);
      try {
        parsed = extractJson(finalResult.contentText);
      } catch {
        parsed = {
          summary:
            finalResult.contentText || 'Review generation failed to produce structured output.',
          issues: [],
          overallVerdict: 'comment',
        };
      }
    }

    parsed.issues = parsed.issues || [];
    parsed.summary = parsed.summary || 'Review complete.';
    parsed.overallVerdict = parsed.overallVerdict || 'comment';

    if (this.mainModule.socket) {
      this.mainModule.socket.emitReviewProgress({
        projectId,
        status: 'success',
        review: parsed,
      });
    }

    return parsed;
  }
}
