import crypto from 'crypto';
import { z } from 'zod';
import type { MainModule } from '../../main.module.js';
import type {
  AgentConfirmationRequest,
  ConfirmationPreview,
  GitHubMeta,
  RuntimeTool,
  ToolContext,
} from '../tool-types.js';

/**
 * Builds a structured AgentConfirmationRequest from a preview and sends it to
 * the initiating socket, waiting for the user's reply. Returns true if the user
 * approved, false if they rejected or the request timed out.
 */
async function requestToolConfirmation(
  mainModule: MainModule,
  context: ToolContext,
  preview: ConfirmationPreview,
  toolName: string,
  args: Record<string, unknown>,
): Promise<boolean> {
  if (!context.socketId) {
    console.warn(
      `[pr-chat-tools] No socketId available for confirmation of ${toolName}; denying by default.`,
    );
    return false;
  }

  const action: AgentConfirmationRequest['action'] = {
    type: toolName,
    title: preview?.title ?? `Execute ${toolName}`,
  };

  if (preview?.description) {
    action.description = preview.description;
  }

  const confirmation: AgentConfirmationRequest = {
    sessionId: context.sessionId,
    toolCallId: crypto.randomUUID(),
    action,
    tool: {
      name: toolName,
      arguments: args,
    },
  };

  if (context.githubMeta) {
    confirmation.target = {
      provider: 'github',
      owner: context.githubMeta.owner,
      repo: context.githubMeta.repo,
      pullNumber: context.githubMeta.pull_number,
    };
  }

  if (preview?.request) {
    confirmation.request = preview.request;
  }

  if (context.conversation) {
    confirmation.conversation = { messages: context.conversation };
  }

  return mainModule.socket.requestToolConfirmation(context.socketId, confirmation);
}

/**
 * Creates PR-specific chat tools. These require GitHub metadata and access
 * to the GitHub API services.
 *
 * Confirmation is handled inside the tool handlers. Each mutation tool sends
 * a structured confirmation request bound to the initiating socket, waits for
 * the user's reply, then executes the GitHub request only if approved.
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
    parameters: z
      .object({
        body: z.string().optional().describe('The exact comment body to post to GitHub.'),
        comment: z
          .string()
          .optional()
          .describe('Alias for body. The exact comment body to post to GitHub.'),
      })
      .superRefine((args, ctx) => {
        if (args.body === undefined && args.comment === undefined) {
          ctx.addIssue({ code: 'custom', message: 'Either "body" or "comment" is required.' });
        }
      }),
    handler: async (args: { body?: string; comment?: string }, context: ToolContext) => {
      if (!context.githubMeta) {
        return { error: 'GitHub metadata is not available for this chat session.' };
      }

      // Normalize: accept both "body" and "comment" argument names because the
      // local model frequently emits {"comment": "..."} while the schema was
      // previously body-only. Zod validation used to reject the call before any
      // confirmation dialog could appear.
      const body = args.body ?? args.comment ?? '';
      if (!body) {
        return { error: 'Missing comment body. Provide body or comment argument.' };
      }

      const prNumber = context.githubMeta.pull_number;
      const preview: ConfirmationPreview = {
        title: prNumber ? `Post comment on PR #${prNumber}` : 'Post comment on PR',
        description: body,
        request: {
          method: 'POST',
          endpoint: `/repos/${context.githubMeta.owner}/${context.githubMeta.repo}/pulls/${context.githubMeta.pull_number}/reviews`,
          payload: {
            body,
            event: 'COMMENT',
          },
        },
      };

      // Ask the user for approval via socket. The tool waits for the reply.
      const approved = await requestToolConfirmation(
        mainModule,
        context,
        preview,
        'leave_pr_comment',
        args,
      );

      if (!approved) {
        return {
          error:
            'The user declined the leave_pr_comment action. The comment was NOT posted to GitHub. Do not claim it succeeded.',
        };
      }

      try {
        const { data } = await mainModule.github.submitPRReview({
          owner: context.githubMeta.owner,
          repo: context.githubMeta.repo,
          pull_number: context.githubMeta.pull_number,
          body,
          event: 'COMMENT',
        });
        return {
          result: 'Comment successfully posted to GitHub.',
          reviewId: data?.id,
        };
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

      const body = args.body;
      const filePath = args.file_path;
      const lineNumber = args.line_number;
      const commentDetails = args.comment_details;
      const prNumber = context.githubMeta.pull_number;

      const preview: ConfirmationPreview = {
        title: prNumber ? `Request changes on PR #${prNumber}` : 'Request changes on PR',
        description: [
          filePath ? `**File:** \`${filePath}:${lineNumber}\`` : '',
          commentDetails ? `**Inline comment:**\n${commentDetails}` : '',
          body ? `**Review summary:**\n${body}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        request: {
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
        },
      };

      // Ask the user for approval via socket. The tool waits for the reply.
      const approved = await requestToolConfirmation(
        mainModule,
        context,
        preview,
        'request_pr_changes',
        args,
      );

      if (!approved) {
        return {
          error:
            'The user declined the request_pr_changes action. The changes were NOT requested on GitHub. Do not claim it succeeded.',
        };
      }

      try {
        const { data } = await mainModule.github.submitPRReview({
          owner: context.githubMeta.owner,
          repo: context.githubMeta.repo,
          pull_number: context.githubMeta.pull_number,
          body,
          event: 'REQUEST_CHANGES',
          comments: [{ path: filePath, line: lineNumber, body: commentDetails }],
        });
        return {
          result: 'Changes successfully requested on GitHub.',
          reviewId: data?.id,
        };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  };

  return [readPrFileDiffTool, semanticSearchTool, leavePrCommentTool, requestPrChangesTool];
}
