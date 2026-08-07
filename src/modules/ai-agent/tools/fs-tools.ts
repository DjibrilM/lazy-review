import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

export function createFsTools(projectRootPath: string) {
  const absoluteRoot = path.resolve(projectRootPath);

  const safeResolve = (relativePath: string): string => {
    const resolvedPath = path.resolve(absoluteRoot, relativePath);
    if (!resolvedPath.startsWith(absoluteRoot)) {
      throw new Error(`Access denied: Path "${relativePath}" is outside the repository directory.`);
    }
    return resolvedPath;
  };

  const readFileTool = tool(
    async ({ filePath }: { filePath: string }) => {
      try {
        const resolved = safeResolve(filePath);
        const stat = await fs.stat(resolved);
        if (!stat.isFile()) {
          return `Error: "${filePath}" is not a file.`;
        }

        const sizeLimit = 30 * 1024; // 30KB
        if (stat.size > sizeLimit) {
          const handle = await fs.open(resolved, 'r');
          const buffer = Buffer.alloc(10 * 1024);
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
          await handle.close();
          const content = buffer.toString('utf8', 0, bytesRead);
          return `File too large (${(stat.size / 1024).toFixed(1)} KB). Showing first 10KB:\n\n${content}\n\n[TRUNCATED due to size limit]`;
        }

        const content = await fs.readFile(resolved, 'utf-8');
        return content;
      } catch (error: any) {
        return `Error reading file: ${error.message}`;
      }
    },
    {
      name: 'read_file',
      description: 'Read the contents of a specific file in the repository. Input should be a relative path from the project root.',
      schema: z.object({
        filePath: z.string().describe('The relative path of the file to read (e.g., "package.json" or "src/index.ts")'),
      }),
    }
  );

  const readDirectoryTool = tool(
    async ({ dirPath }: { dirPath: string }) => {
      try {
        const resolved = safeResolve(dirPath);
        const stat = await fs.stat(resolved);
        if (!stat.isDirectory()) {
          return `Error: "${dirPath}" is not a directory.`;
        }
        const entries = await fs.readdir(resolved, { withFileTypes: true });
        const items = entries.map((entry) => {
          const type = entry.isDirectory() ? 'directory' : 'file';
          return `${entry.name} (${type})`;
        });
        return items.length > 0 ? items.join('\n') : 'Empty directory';
      } catch (error: any) {
        return `Error reading directory: ${error.message}`;
      }
    },
    {
      name: 'read_directory',
      description: 'List the immediate contents of a directory in the repository. Input should be a relative path from the project root.',
      schema: z.object({
        dirPath: z.string().describe('The relative path of the directory to list (e.g., "." for project root, or "src")'),
      }),
    }
  );

  const getDirectoryTreeTool = tool(
    async ({ maxDepth = 3 }: { maxDepth?: number }) => {
      try {
        const buildTree = async (currentPath: string, currentDepth: number): Promise<string> => {
          if (currentDepth > maxDepth) return '';
          const resolved = safeResolve(path.join(absoluteRoot, currentPath));
          const entries = await fs.readdir(resolved, { withFileTypes: true });

          let result = '';
          const indent = '  '.repeat(currentDepth);

          const ignoredDirs = [
            'node_modules', '.git', 'dist', '.pnpm', 'build', '.next', '.cache',
            'pnpm-lock.yaml', 'package-lock.json', '.DS_Store',
          ];

          for (const entry of entries) {
            if (ignoredDirs.includes(entry.name)) continue;

            const relativeEntryPath = currentPath === '.' ? entry.name : path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
              result += `${indent}📁 ${entry.name}/\n`;
              const subTree = await buildTree(relativeEntryPath, currentDepth + 1);
              result += subTree;
            } else {
              result += `${indent}📄 ${entry.name}\n`;
            }
          }
          return result;
        };

        const tree = await buildTree('.', 0);
        return tree || 'Empty directory';
      } catch (error: any) {
        return `Error building directory tree: ${error.message}`;
      }
    },
    {
      name: 'get_directory_tree',
      description: 'Get a visual recursive tree representation of the project folder structure up to a specified depth (default 3), ignoring node_modules, .git, dist, etc.',
      schema: z.object({
        maxDepth: z.number().optional().describe('Maximum depth of recursion (default is 3, maximum allowed is 5)'),
      }),
    }
  );

  return [readFileTool, readDirectoryTool, getDirectoryTreeTool];
}
