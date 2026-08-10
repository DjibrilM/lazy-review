import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { Dirent } from 'fs';
import { simpleGit } from 'simple-git';
import type { SimpleGit } from 'simple-git';

export function createGitTools(projectRootPath: string) {
  const absoluteRoot = path.resolve(projectRootPath);
  const git: SimpleGit = simpleGit(absoluteRoot);

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
      limit: z.number().optional().describe('Maximum number of commits to retrieve (default: 15)'),
    }),
    handler: async (args: { limit?: number }) => {
      try {
        const logResult = await git.log({ maxCount: args.limit ?? 15 });
        if (logResult.all.length === 0) return { commits: [] };
        return {
          commits: logResult.all.map((c) => ({
            hash: c.hash.substring(0, 7),
            author: c.author_name,
            date: c.date,
            message: c.message,
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
      'Read the full contents of a specific file in the repository. Use this to inspect any source file, config, or schema that would help understand the project.',
    parameters: z.object({
      file_path: z
        .string()
        .describe(
          'The path to the file relative to the project root (e.g., "src/main.ts" or "prisma/schema.prisma")',
        ),
    }),
    handler: async (args: { file_path: string }) => {
      try {
        const resolved = path.join(absoluteRoot, args.file_path);
        // Safety: must be within the project root
        if (!resolved.startsWith(absoluteRoot)) {
          return { error: 'Access denied: path is outside the project root.' };
        }
        const stat = await fs.stat(resolved);
        if (!stat.isFile()) return { error: `"${args.file_path}" is not a file.` };
        if (stat.size > 80 * 1024) {
          // Return first 80kb of large files
          const fd = await fs.open(resolved, 'r');
          const buf = Buffer.alloc(80 * 1024);
          await fd.read(buf, 0, buf.length, 0);
          await fd.close();
          return {
            content: buf.toString('utf-8'),
            truncated: true,
            note: 'File was larger than 80KB; only the first portion is shown.',
          };
        }
        const content = await fs.readFile(resolved, 'utf-8');
        return { content };
      } catch (error: any) {
        return { error: `Could not read file "${args.file_path}": ${error.message}` };
      }
    },
  };

  const searchInFilesTool = {
    name: 'search_in_files',
    description:
      'Search for a keyword or pattern across all source files in the repository. Useful for finding where a specific dependency, pattern, or concept is used.',
    parameters: z.object({
      keyword: z.string().describe('The keyword or string to search for across the codebase.'),
      file_extension: z
        .string()
        .optional()
        .describe(
          'Optional file extension filter (e.g., ".ts", ".py"). If omitted, searches all files.',
        ),
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

      const walkDir = async (dir: string) => {
        if (results.length >= 20) return; // cap results
        let entries: Dirent[];
        try {
          entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          if (results.length >= 20) return;
          if (entry.isDirectory()) {
            if (!ignoredDirs.has(entry.name)) await walkDir(path.join(dir, entry.name));
          } else if (entry.isFile()) {
            const fullPath = path.join(dir, entry.name);
            if (args.file_extension && !entry.name.endsWith(args.file_extension)) continue;
            try {
              const stat = await fs.stat(fullPath);
              if (stat.size > 500 * 1024) continue;
              const content = await fs.readFile(fullPath, 'utf-8');
              const lines = content.split('\n');
              lines.forEach((line, idx) => {
                if (
                  results.length < 20 &&
                  line.toLowerCase().includes(args.keyword.toLowerCase())
                ) {
                  results.push({
                    file: path.relative(absoluteRoot, fullPath),
                    line: idx + 1,
                    content: line.trim(),
                  });
                }
              });
            } catch {
              // skip unreadable files
            }
          }
        }
      };

      await walkDir(absoluteRoot);
      return { matches: results, total: results.length };
    },
  };

  const switchBranchTool = {
    name: 'switch_branch',
    description: 'Switch the current git branch to a different branch.',
    parameters: z.object({
      branch: z.string().describe('The name of the branch to switch to.'),
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
      'Get a list of all files changed in the pull request comparing the current branch against a base branch.',
    parameters: z.object({
      base_branch: z.string().describe('The base branch (e.g., "main" or "master").'),
    }),
    handler: async (args: { base_branch: string }) => {
      try {
        const diffSummary = await git.diffSummary([`${args.base_branch}...HEAD`]);
        return { files: diffSummary.files.map((f) => f.file) };
      } catch (error: any) {
        return { error: `Failed to get PR files: ${error.message}` };
      }
    },
  };

  const getFileDiffTool = {
    name: 'get_file_diff',
    description: 'Get the specific git diff for a single file in the pull request.',
    parameters: z.object({
      file_path: z.string().describe('The relative path of the file to diff.'),
      base_branch: z.string().describe('The base branch (e.g., "main").'),
    }),
    handler: async (args: { file_path: string; base_branch: string }) => {
      try {
        const diff = await git.diff([`${args.base_branch}...HEAD`, '--', args.file_path]);
        return { diff: diff || `No changes found for ${args.file_path}` };
      } catch (error: any) {
        return { error: `Failed to get file diff: ${error.message}` };
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
  ];
}

export async function executeGitPull(absoluteRoot: string, progress: (msg: string) => void) {
  try {
    const { simpleGit } = await import('simple-git');
    const git = simpleGit(absoluteRoot);
    progress('🔄 Pulling latest changes from git...');
    await git.pull();
    progress('✅ Successfully pulled latest changes');
  } catch (err: any) {
    progress(`⚠️ Could not pull latest changes: ${err.message}`);
  }
}
