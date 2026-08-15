import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { Dirent } from 'fs';
import { simpleGit } from 'simple-git';
import type { SimpleGit } from 'simple-git';

/**
 * These are LOCAL repository tools only.
 *
 * GitHub API mutations such as leave_pr_comment belong in ChatAgent because
 * they depend on the current PR metadata and the confirmation/socket services.
 */
export function createGitTools(projectRootPath: string) {
  const absoluteRoot = path.resolve(projectRootPath);
  const git: SimpleGit = simpleGit(absoluteRoot);

  const resolveInsideProject = (relativePath: string) => {
    const resolved = path.resolve(absoluteRoot, relativePath);
    const relative = path.relative(absoluteRoot, resolved);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Access denied: path is outside the project root.');
    }

    return resolved;
  };

  const getCurrentBranchTool = {
    name: 'get_current_branch',
    description: 'Returns the name of the currently checked-out git branch.',
    parameters: z.object({}),
    handler: async () => {
      try {
        const status = await git.status();
        return { current_branch: status.current };
      } catch (error: any) {
        return { error: `Error getting current branch: ${error.message}` };
      }
    },
  };

  const getCommitsTool = {
    name: 'get_recent_commits',
    description:
      "Retrieve the most recent git commit history to understand the project's development trajectory and purpose.",
    parameters: z.object({
      limit: z
        .number()
        .int()
        .positive()
        .max(100)
        .optional()
        .describe('Maximum number of commits to retrieve (default: 15)'),
    }),
    handler: async (args: { limit?: number }) => {
      try {
        const logResult = await git.log({ maxCount: args.limit ?? 15 });

        return {
          commits: logResult.all.map((commit) => ({
            hash: commit.hash.substring(0, 7),
            author: commit.author_name,
            date: commit.date,
            message: commit.message,
          })),
        };
      } catch (error: any) {
        return { error: `Error retrieving commits: ${error.message}` };
      }
    },
  };

  const readFileTool = {
    name: 'read_file',
    description:
      'Read the contents of a specific file in the repository. Large files are truncated to the first 80KB.',
    parameters: z.object({
      file_path: z
        .string()
        .min(1)
        .describe(
          'The path to the file relative to the project root (e.g. "src/main.ts" or "prisma/schema.prisma")',
        ),
    }),
    handler: async (args: { file_path: string }) => {
      try {
        const resolved = resolveInsideProject(args.file_path);
        const stat = await fs.stat(resolved);

        if (!stat.isFile()) {
          return { error: `"${args.file_path}" is not a file.` };
        }

        const maxBytes = 80 * 1024;

        if (stat.size > maxBytes) {
          const fd = await fs.open(resolved, 'r');

          try {
            const buffer = Buffer.alloc(maxBytes);
            const { bytesRead } = await fd.read(buffer, 0, buffer.length, 0);

            return {
              content: buffer.subarray(0, bytesRead).toString('utf-8'),
              truncated: true,
              note: 'File was larger than 80KB; only the first portion is shown.',
            };
          } finally {
            await fd.close();
          }
        }

        return { content: await fs.readFile(resolved, 'utf-8') };
      } catch (error: any) {
        return { error: `Could not read file "${args.file_path}": ${error.message}` };
      }
    },
  };

  const searchInFilesTool = {
    name: 'search_in_files',
    description:
      'Search for a keyword across source files in the repository. Returns at most 20 matches.',
    parameters: z.object({
      keyword: z.string().min(1).describe('The keyword or string to search for.'),
      file_extension: z
        .string()
        .optional()
        .describe('Optional extension filter such as ".ts" or ".py".'),
    }),
    handler: async (args: { keyword: string; file_extension?: string }) => {
      const results: { file: string; line: number; content: string }[] = [];
      const ignoredDirs = new Set([
        'node_modules',
        '.git',
        'dist',
        'build',
        '.next',
        '.cache',
        'coverage',
      ]);

      const keyword = args.keyword.toLowerCase();

      const walkDir = async (dir: string): Promise<void> => {
        if (results.length >= 20) return;

        let entries: Dirent[];

        try {
          entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }

        for (const entry of entries) {
          if (results.length >= 20) return;

          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            if (!ignoredDirs.has(entry.name)) {
              await walkDir(fullPath);
            }
            continue;
          }

          if (!entry.isFile()) continue;
          if (args.file_extension && !entry.name.endsWith(args.file_extension)) continue;

          try {
            const stat = await fs.stat(fullPath);
            if (stat.size > 500 * 1024) continue;

            const content = await fs.readFile(fullPath, 'utf-8');
            const lines = content.split('\n');

            for (let index = 0; index < lines.length && results.length < 20; index++) {
              const line = lines[index];

              if (line?.toLowerCase().includes(keyword)) {
                results.push({
                  file: path.relative(absoluteRoot, fullPath),
                  line: index + 1,
                  content: line.trim(),
                });
              }
            }
          } catch {
            // Ignore unreadable/binary files.
          }
        }
      };

      await walkDir(absoluteRoot);

      return {
        matches: results,
        total: results.length,
        capped: results.length >= 20,
      };
    },
  };

  const switchBranchTool = {
    name: 'switch_branch',
    description: 'Switch the current local git branch to a different branch.',
    parameters: z.object({
      branch: z.string().min(1).describe('The name of the branch to switch to.'),
    }),
    handler: async (args: { branch: string }) => {
      try {
        await git.checkout(args.branch);
        return { success: `Successfully switched to branch ${args.branch}` };
      } catch (error: any) {
        return { error: `Failed to switch branch: ${error.message}` };
      }
    },
  };

  const getPrFilesTool = {
    name: 'get_pr_files',
    description:
      'Get the files changed between the current HEAD and a base branch using a three-dot diff.',
    parameters: z.object({
      base_branch: z.string().min(1).describe('The base branch, e.g. "main" or "master".'),
    }),
    handler: async (args: { base_branch: string }) => {
      try {
        const diffSummary = await git.diffSummary([`${args.base_branch}...HEAD`]);
        return { files: diffSummary.files.map((file) => file.file) };
      } catch (error: any) {
        return { error: `Failed to get PR files: ${error.message}` };
      }
    },
  };

  const getFileDiffTool = {
    name: 'get_file_diff',
    description: 'Get the git diff for one file relative to a base branch.',
    parameters: z.object({
      file_path: z.string().min(1).describe('The relative path of the file to diff.'),
      base_branch: z.string().min(1).describe('The base branch, e.g. "main".'),
    }),
    handler: async (args: { file_path: string; base_branch: string }) => {
      try {
        // Validate the path before passing it to git even though `--` prevents it
        // from being interpreted as another git option.
        resolveInsideProject(args.file_path);

        const diff = await git.diff([`${args.base_branch}...HEAD`, '--', args.file_path]);

        return { diff: diff || `No changes found for ${args.file_path}` };
      } catch (error: any) {
        return { error: `Failed to get file diff: ${error.message}` };
      }
    },
  };

  // ===== NEW: Branch-aware tools =====

  const listBranchesTool = {
    name: 'list_branches',
    description:
      'List all local and remote git branches. Useful for understanding what branches exist and which one to compare against.',
    parameters: z.object({
      include_remote: z
        .boolean()
        .optional()
        .describe('Whether to include remote branches (default: true)'),
    }),
    handler: async (args: { include_remote?: boolean }) => {
      try {
        const branches = await git.branch(['-a']);
        const current = branches.current;

        const localBranches = branches.all
          .filter((b) => !b.startsWith('remotes/'))
          .map((b) => (b === current ? `* ${b}` : b));

        const remoteBranches =
          args.include_remote !== false
            ? branches.all
                .filter((b) => b.startsWith('remotes/'))
                .map((b) => b.replace('remotes/', ''))
            : [];

        return {
          current_branch: current,
          local_branches: localBranches,
          remote_branches: remoteBranches,
        };
      } catch (error: any) {
        return { error: `Failed to list branches: ${error.message}` };
      }
    },
  };

  const readFileFromBranchTool = {
    name: 'read_file_from_branch',
    description:
      'Read the contents of a file from a specific branch WITHOUT switching branches. This is useful for comparing how a file looks on another branch (e.g. main vs feature branch) without disrupting the current working state.',
    parameters: z.object({
      file_path: z
        .string()
        .min(1)
        .describe('The path to the file relative to the project root (e.g. "src/main.ts").'),
      branch: z
        .string()
        .min(1)
        .describe(
          'The branch name or commit ref to read the file from (e.g. "main", "feature/x", or a commit hash).',
        ),
      max_bytes: z
        .number()
        .int()
        .positive()
        .max(200 * 1024)
        .optional()
        .describe('Maximum bytes to read (default: 80KB).'),
    }),
    handler: async (args: { file_path: string; branch: string; max_bytes?: number }) => {
      try {
        resolveInsideProject(args.file_path);

        const maxBytes = args.max_bytes ?? 80 * 1024;
        const content = await git.show([`${args.branch}:${args.file_path}`]);

        if (content.length > maxBytes) {
          return {
            content: content.substring(0, maxBytes),
            truncated: true,
            note: `File was larger than ${Math.round(maxBytes / 1024)}KB; only the first portion is shown.`,
            branch: args.branch,
            file_path: args.file_path,
          };
        }

        return {
          content,
          branch: args.branch,
          file_path: args.file_path,
        };
      } catch (error: any) {
        return {
          error: `Could not read "${args.file_path}" from branch "${args.branch}": ${error.message}`,
        };
      }
    },
  };

  const compareFileBetweenBranchesTool = {
    name: 'compare_file_between_branches',
    description:
      'Compare a specific file between two branches. Returns the diff showing what changed. Useful for understanding how a file evolved between branches (e.g. main vs feature branch).',
    parameters: z.object({
      file_path: z
        .string()
        .min(1)
        .describe('The path to the file relative to the project root (e.g. "src/main.ts").'),
      branch_a: z.string().min(1).describe('The first branch/ref to compare (e.g. "main").'),
      branch_b: z
        .string()
        .min(1)
        .describe('The second branch/ref to compare (e.g. "feature/my-change").'),
    }),
    handler: async (args: { file_path: string; branch_a: string; branch_b: string }) => {
      try {
        resolveInsideProject(args.file_path);

        const diff = await git.diff([args.branch_a, args.branch_b, '--', args.file_path]);

        if (!diff || diff.trim().length === 0) {
          return {
            file_path: args.file_path,
            branch_a: args.branch_a,
            branch_b: args.branch_b,
            diff: `No differences found for "${args.file_path}" between ${args.branch_a} and ${args.branch_b}.`,
          };
        }

        return {
          file_path: args.file_path,
          branch_a: args.branch_a,
          branch_b: args.branch_b,
          diff,
        };
      } catch (error: any) {
        return {
          error: `Failed to compare "${args.file_path}" between ${args.branch_a} and ${args.branch_b}: ${error.message}`,
        };
      }
    },
  };

  const getBranchDiffTool = {
    name: 'get_branch_diff',
    description:
      'Get the full diff between two branches. Useful for understanding all changes in a feature branch compared to main.',
    parameters: z.object({
      branch_a: z.string().min(1).describe('The base branch/ref (e.g. "main").'),
      branch_b: z
        .string()
        .min(1)
        .describe('The target branch/ref to compare (e.g. "feature/my-change").'),
      max_files: z
        .number()
        .int()
        .positive()
        .max(50)
        .optional()
        .describe('Maximum number of files to include in the diff (default: 20).'),
    }),
    handler: async (args: { branch_a: string; branch_b: string; max_files?: number }) => {
      try {
        const maxFiles = args.max_files ?? 20;

        const diffSummary = await git.diffSummary([args.branch_a, args.branch_b]);
        const allFiles = diffSummary.files.map((f) => f.file);
        const filesToShow = allFiles.slice(0, maxFiles);

        const diffs: { file: string; diff: string }[] = [];

        for (const file of filesToShow) {
          try {
            const diff = await git.diff([args.branch_a, args.branch_b, '--', file]);
            diffs.push({ file, diff: diff.substring(0, 8000) });
          } catch {
            // Skip files that fail to diff
          }
        }

        return {
          branch_a: args.branch_a,
          branch_b: args.branch_b,
          total_changed_files: allFiles.length,
          files_shown: filesToShow.length,
          truncated: allFiles.length > filesToShow.length,
          diffs,
        };
      } catch (error: any) {
        return {
          error: `Failed to get diff between ${args.branch_a} and ${args.branch_b}: ${error.message}`,
        };
      }
    },
  };

  const getFileHistoryTool = {
    name: 'get_file_history',
    description:
      'Get the commit history for a specific file. Useful for understanding how a file evolved over time and why certain changes were made.',
    parameters: z.object({
      file_path: z
        .string()
        .min(1)
        .describe('The path to the file relative to the project root (e.g. "src/main.ts").'),
      limit: z
        .number()
        .int()
        .positive()
        .max(50)
        .optional()
        .describe('Maximum number of commits to retrieve (default: 10).'),
    }),
    handler: async (args: { file_path: string; limit?: number }) => {
      try {
        resolveInsideProject(args.file_path);

        const logResult = await git.log({
          maxCount: args.limit ?? 10,
          file: args.file_path,
        });

        return {
          file_path: args.file_path,
          commits: logResult.all.map((commit) => ({
            hash: commit.hash.substring(0, 7),
            author: commit.author_name,
            date: commit.date,
            message: commit.message,
          })),
        };
      } catch (error: any) {
        return { error: `Failed to get history for "${args.file_path}": ${error.message}` };
      }
    },
  };

  const getFileAtCommitTool = {
    name: 'get_file_at_commit',
    description:
      'Read a file as it existed at a specific commit. Useful for understanding what the code looked like at a particular point in time.',
    parameters: z.object({
      file_path: z
        .string()
        .min(1)
        .describe('The path to the file relative to the project root (e.g. "src/main.ts").'),
      commit: z
        .string()
        .min(1)
        .describe('The commit hash or ref to read the file from (e.g. "abc1234" or "HEAD~3").'),
      max_bytes: z
        .number()
        .int()
        .positive()
        .max(200 * 1024)
        .optional()
        .describe('Maximum bytes to read (default: 80KB).'),
    }),
    handler: async (args: { file_path: string; commit: string; max_bytes?: number }) => {
      try {
        resolveInsideProject(args.file_path);

        const maxBytes = args.max_bytes ?? 80 * 1024;
        const content = await git.show([`${args.commit}:${args.file_path}`]);

        if (content.length > maxBytes) {
          return {
            content: content.substring(0, maxBytes),
            truncated: true,
            note: `File was larger than ${Math.round(maxBytes / 1024)}KB; only the first portion is shown.`,
            commit: args.commit,
            file_path: args.file_path,
          };
        }

        return {
          content,
          commit: args.commit,
          file_path: args.file_path,
        };
      } catch (error: any) {
        return {
          error: `Could not read "${args.file_path}" at commit "${args.commit}": ${error.message}`,
        };
      }
    },
  };

  const getBranchStatusTool = {
    name: 'get_branch_status',
    description:
      'Get the ahead/behind status of the current branch relative to another branch. Useful for understanding how far a feature branch has diverged from main.',
    parameters: z.object({
      compare_branch: z.string().min(1).describe('The branch to compare against (e.g. "main").'),
    }),
    handler: async (args: { compare_branch: string }) => {
      try {
        const status = await git.status();
        const current = status.current || '';

        const ahead = await git
          .revparse([`--abbrev-ref`, `${current}@{upstream}`])
          .catch(() => null);

        // Get ahead/behind counts
        const mergeBase = await git
          .raw(['merge-base', current, args.compare_branch])
          .catch(() => null);
        if (!mergeBase) {
          return {
            error: `Could not find merge base between ${current} and ${args.compare_branch}`,
          };
        }

        const aheadCount = await git
          .raw(['rev-list', '--count', `${args.compare_branch}..${current}`])
          .catch(() => '0');
        const behindCount = await git
          .raw(['rev-list', '--count', `${current}..${args.compare_branch}`])
          .catch(() => '0');

        return {
          current_branch: current,
          compare_branch: args.compare_branch,
          ahead: parseInt(aheadCount.trim() || '0', 10),
          behind: parseInt(behindCount.trim() || '0', 10),
          has_upstream: !!ahead,
        };
      } catch (error: any) {
        return { error: `Failed to get branch status: ${error.message}` };
      }
    },
  };

  return [
    getCurrentBranchTool,
    getCommitsTool,
    readFileTool,
    searchInFilesTool,
    switchBranchTool,
    getPrFilesTool,
    getFileDiffTool,
    // New branch-aware tools
    listBranchesTool,
    readFileFromBranchTool,
    compareFileBetweenBranchesTool,
    getBranchDiffTool,
    getFileHistoryTool,
    getFileAtCommitTool,
    getBranchStatusTool,
  ];
}

export async function executeGitPull(absoluteRoot: string, progress: (message: string) => void) {
  try {
    const { simpleGit } = await import('simple-git');
    const git = simpleGit(absoluteRoot);

    progress('🔄 Pulling latest changes from git...');
    await git.pull();
    progress('✅ Successfully pulled latest changes');
  } catch (error: any) {
    progress(`⚠️ Could not pull latest changes: ${error.message}`);
  }
}
