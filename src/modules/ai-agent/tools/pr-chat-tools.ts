import { z } from 'zod';
import type { MainModule } from '../../main.module.js';
import type { ConfirmationPreview, GitHubMeta, RuntimeTool, ToolContext } from '../tool-types.js';

/**
 * Creates PR-specific chat tools. These require GitHub metadata and access
 * to the GitHub API services.
 *
 * Confirmation is NOT handled inside tool handlers. The ToolExecutor gates
 * mutation tools (effect !== 'read') behind a structured confirmation request
 * bound to the initiating socket.
 */
export function createPrChatTools(
  parsedDiffFiles: { file: string; diff: string }[],
  githubMeta: GitHubMeta | undefined,
  mainModule: MainModule,
  getRelevantContext: (projectId: string, query: string) => Promise<string>,
  projectId: string,
): RuntimeTool[] {
  const readPrFileDiffTool: RuntimeTool = {
    name: 'read_pr_file_diff',
    description: 'Get the exact diff for a specific file modified in this PR.',
    effect: 'read',
    parameters: z.object({
      file_path: z.string().optional().describe('The path of the changed file (e.g. src/main.ts).'),
      filePath: z
        .string()
        .optional()
        .describe('The path of the changed file (e.g. src/main.ts). Alias for file_path.'),
    }),
    handler: async (args: { file_path?: string; filePath?: string }) => {
      const filePath = args.file_path ?? args.filePath;
      if (!filePath) return { error: 'Missing file_path or filePath argument.' };
      const fileDiff = parsedDiffFiles.find((file) => file.file === filePath);
      if (!fileDiff) return { error: `File ${filePath} not found in this PR's diff.` };
      return { diff: fileDiff.diff };
    },
  };

  const semanticSearchTool: RuntimeTool = {
    name: 'semantic_search',
    description:
      'Search the indexed codebase using semantic similarity. Useful for finding architecture patterns, existing conventions, or context about unfamiliar code.',
    effect: 'read',
    parameters: z.object({
      query: z.string().describe('The search query for semantic matching.'),
    }),
    handler: async (args: { query: string }) => {
      const factsContext = await getRelevantContext(projectId, args.query);
      if (!factsContext) return { result: 'No relevant semantic information found.' };
      return { result: factsContext };
    },
  };

  const leavePrCommentTool: RuntimeTool = {
    name: 'leave_pr_comment',
    description:
      'Post a general comment to the current GitHub pull request. Use this whenever the user asks you to leave, post, send, or submit a general PR comment.',
    effect: 'write',
    confirmation: {
      required: true,
      buildPreview: (args: Record<string, unknown>, context: ToolContext): ConfirmationPreview => {
        const body = (args.body as string) ?? '';
        const prNumber = context.githubMeta?.pull_number;

        const preview: ConfirmationPreview = {
          title: prNumber ? `Post comment on PR #${prNumber}` : 'Post comment on PR',
          description: body,
        };

        if (context.githubMeta) {
          preview.request = {
            method: 'POST',
            endpoint: `/repos/${context.githubMeta.owner}/${context.githubMeta.repo}/pulls/${context.githubMeta.pull_number}/reviews`,
            payload: {
              body,
              event: 'COMMENT',
            },
          };
        }

        return preview;
      },
    },
    parameters: z.object({
      body: z.string().describe('The exact comment body that should be posted to GitHub.'),
    }),
    handler: async (args: { body: string }, context: ToolContext) => {
      if (!context.githubMeta) {
        return { error: 'GitHub metadata is not available for this chat session.' };
      }

      try {
        await mainModule.github.submitPRReview({
          owner: context.githubMeta.owner,
          repo: context.githubMeta.repo,
          pull_number: context.githubMeta.pull_number,
          body: args.body,
          event: 'COMMENT',
        });
        return { result: 'Comment successfully posted to GitHub.' };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  };

  const requestPrChangesTool: RuntimeTool = {
    name: 'request_pr_changes',
    description:
      'Submit a GitHub REQUEST_CHANGES review for the current pull request with a specific inline file comment.',
    effect: 'write',
    confirmation: {
      required: true,
      buildPreview: (args: Record<string, unknown>, context: ToolContext): ConfirmationPreview => {
        const body = (args.body as string) ?? '';
        const filePath = (args.file_path as string) ?? '';
        const lineNumber = (args.line_number as number) ?? 0;
        const commentDetails = (args.comment_details as string) ?? '';
        const prNumber = context.githubMeta?.pull_number;

        const preview: ConfirmationPreview = {
          title: prNumber ? `Request changes on PR #${prNumber}` : 'Request changes on PR',
          description: [
            filePath ? `**File:** \`${filePath}:${lineNumber}\`` : '',
            commentDetails ? `**Inline comment:**\n${commentDetails}` : '',
            body ? `**Review summary:**\n${body}` : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
        };

        if (context.githubMeta) {
          preview.request = {
            method: 'POST',
            endpoint: `/repos/${context.githubMeta.owner}/${context.githubMeta.repo}/pulls/${context.githubMeta.pull_number}/reviews`,
            payload: {
              body,
              event: 'REQUEST_CHANGES',
              comments: [
                {
                  path: filePath,
                  line: lineNumber,
                  body: commentDetails,
                },
              ],
            },
          };
        }

        return preview;
      },
    },
    parameters: z.object({
      body: z.string().describe('The overall summary for the requested changes review.'),
      file_path: z.string().describe('The changed file containing the issue.'),
      line_number: z
        .number()
        .int()
        .positive()
        .describe('The target line number in the changed file.'),
      comment_details: z.string().describe('The exact inline review comment for that line.'),
    }),
    handler: async (
      args: { body: string; file_path: string; line_number: number; comment_details: string },
      context: ToolContext,
    ) => {
      if (!context.githubMeta) {
        return { error: 'GitHub metadata is not available for this chat session.' };
      }

      try {
        await mainModule.github.submitPRReview({
          owner: context.githubMeta.owner,
          repo: context.githubMeta.repo,
          pull_number: context.githubMeta.pull_number,
          body: args.body,
          event: 'REQUEST_CHANGES',
          comments: [{ path: args.file_path, line: args.line_number, body: args.comment_details }],
        });
        return { result: 'Changes successfully requested on GitHub.' };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  };

  return [readPrFileDiffTool, semanticSearchTool, leavePrCommentTool, requestPrChangesTool];
}
