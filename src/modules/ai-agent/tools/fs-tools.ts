import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { extractSymbolsWithAST } from '../ai-agent.utils.js';

export function createFsTools(projectRootPath: string) {
  const absoluteRoot = path.resolve(projectRootPath);

  const safeResolve = (relativePath: string): string => {
    const resolvedPath = path.resolve(absoluteRoot, relativePath);
    if (!resolvedPath.startsWith(absoluteRoot)) {
      throw new Error(`Access denied: Path "${relativePath}" is outside the repository directory.`);
    }
    return resolvedPath;
  };

  const readFileTool = {
    name: 'read_file',
    description:
      'Read the contents of a specific file in the repository. Input should be a relative path from the project root. Files up to 80KB are read in full; larger files are truncated to the first 80KB.',
    parameters: z.object({
      filePath: z
        .string()
        .describe('The relative path of the file to read (e.g., "package.json" or "src/index.ts")'),
    }),
    handler: async ({ filePath }: { filePath: string }) => {
      console.log(`[Tool Execution] read_file`, { filePath });
      try {
        const resolved = safeResolve(filePath);
        const stat = await fs.stat(resolved);
        if (!stat.isFile()) {
          return `Error: "${filePath}" is not a file.`;
        }

        const sizeLimit = 80 * 1024; // 80KB
        if (stat.size > sizeLimit) {
          const fd = await fs.open(resolved, 'r');
          try {
            const buffer = Buffer.alloc(sizeLimit);
            const { bytesRead } = await fd.read(buffer, 0, buffer.length, 0);
            return `${buffer.subarray(0, bytesRead).toString('utf-8')}\n\n[File truncated: ${(stat.size / 1024).toFixed(1)} KB total. Use read_file_lines to read specific line ranges.]`;
          } finally {
            await fd.close();
          }
        }

        const content = await fs.readFile(resolved, 'utf-8');
        return content;
      } catch (error: any) {
        console.error(error);
        return `Error reading file: ${error.message}`;
      }
    },
  };

  const readFileLinesTool = {
    name: 'read_file_lines',
    description:
      'Read a specific range of lines from a file in the repository. Useful for reading large files in chunks or focusing on a specific section without loading the entire file.',
    parameters: z.object({
      filePath: z
        .string()
        .describe('The relative path of the file to read (e.g., "src/index.ts")'),
      startLine: z
        .number()
        .int()
        .positive()
        .describe('The 1-based line number to start reading from (inclusive).'),
      endLine: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('The 1-based line number to stop reading at (inclusive). Defaults to startLine + 100.'),
    }),
    handler: async ({ filePath, startLine, endLine }: { filePath: string; startLine: number; endLine?: number }) => {
      console.log(`[Tool Execution] read_file_lines`, { filePath, startLine, endLine });
      try {
        const resolved = safeResolve(filePath);
        const stat = await fs.stat(resolved);
        if (!stat.isFile()) {
          return `Error: "${filePath}" is not a file.`;
        }

        const content = await fs.readFile(resolved, 'utf-8');
        const lines = content.split('\n');
        const end = endLine ?? Math.min(startLine + 99, lines.length);
        const start = Math.max(1, startLine);

        if (start > lines.length) {
          return `Error: File "${filePath}" has only ${lines.length} lines.`;
        }

        const slice = lines.slice(start - 1, end);
        const numbered = slice.map((line, i) => `${start + i}\t${line}`).join('\n');
        const totalLines = lines.length;

        return `Lines ${start}-${Math.min(end, totalLines)} of ${totalLines} in ${filePath}:\n\n${numbered}`;
      } catch (error: any) {
        return `Error reading file lines: ${error.message}`;
      }
    },
  };

  const readDirectoryTool = {
    name: 'read_directory',
    description:
      'List the immediate contents of a directory in the repository. Input should be a relative path from the project root.',
    parameters: z.object({
      dirPath: z
        .string()
        .describe(
          'The relative path of the directory to list (e.g., "." for project root, or "src")',
        ),
    }),
    handler: async ({ dirPath }: { dirPath: string }) => {
      console.log(`[Tool Execution] read_directory`, { dirPath });
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
  };

  const getDirectoryTreeTool = {
    name: 'get_directory_tree',
    description:
      'Get a visual recursive tree representation of the project folder structure up to a specified depth (default 3), ignoring node_modules, .git, dist, etc.',
    parameters: z.object({
      maxDepth: z
        .number()
        .optional()
        .describe('Maximum depth of recursion (default is 3, maximum allowed is 5)'),
    }),
    handler: async ({ maxDepth = 3 }: { maxDepth?: number }) => {
      console.log(`[Tool Execution] get_directory_tree`, { maxDepth });
      try {
        const buildTree = async (currentPath: string, currentDepth: number): Promise<string> => {
          if (currentDepth > maxDepth) return '';
          const resolved = safeResolve(path.join(absoluteRoot, currentPath));
          const entries = await fs.readdir(resolved, { withFileTypes: true });

          let result = '';
          const indent = '  '.repeat(currentDepth);

          const ignoredDirs = [
            'node_modules',
            '.git',
            'dist',
            '.pnpm',
            'build',
            '.next',
            '.cache',
            'pnpm-lock.yaml',
            'package-lock.json',
            '.DS_Store',
          ];

          for (const entry of entries) {
            if (ignoredDirs.includes(entry.name)) continue;

            const relativeEntryPath =
              currentPath === '.' ? entry.name : path.join(currentPath, entry.name);
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
  };

  const getFileOutlineTool = {
    name: 'get_file_outline',
    description:
      'Get an outline of the classes, functions, and symbols in a file to save context window.',
    parameters: z.object({
      filePath: z.string().describe('The relative path of the file to outline'),
    }),
    handler: async ({ filePath }: { filePath: string }) => {
      console.log(`[Tool Execution] get_file_outline`, { filePath });
      try {
        const resolved = safeResolve(filePath);
        const stat = await fs.stat(resolved);
        if (!stat.isFile()) return `Error: "${filePath}" is not a file.`;
        const text = await fs.readFile(resolved, 'utf-8');
        const symbols = await extractSymbolsWithAST(resolved, text);
        if (symbols.length === 0)
          return `No AST symbols extracted (perhaps unsupported language). Use read_file.`;
        const outline = symbols
          .map(
            (s: any) =>
              `- ${s.symbol.kind} ${s.symbol.name} (lines ${s.symbol.startLine}-${s.symbol.endLine})`,
          )
          .join('\n');
        return outline || 'File has no identifiable symbols.';
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    },
  };

  const readSymbolTool = {
    name: 'read_symbol',
    description:
      'Read the exact source code for a specific symbol (e.g. function or class name) in a file.',
    parameters: z.object({
      filePath: z.string().describe('The relative path of the file'),
      symbolName: z.string().describe('The exact name of the symbol to extract'),
    }),
    handler: async ({ filePath, symbolName }: { filePath: string; symbolName: string }) => {
      console.log(`[Tool Execution] read_symbol`, { filePath, symbolName });
      try {
        const resolved = safeResolve(filePath);
        const stat = await fs.stat(resolved);
        if (!stat.isFile()) return `Error: "${filePath}" is not a file.`;
        const text = await fs.readFile(resolved, 'utf-8');
        const symbols = await extractSymbolsWithAST(resolved, text);
        const symbol = symbols.find((s: any) => s.symbol.name === symbolName);
        if (!symbol) return `Symbol "${symbolName}" not found in ${filePath}.`;
        return symbol.content;
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    },
  };

  return [
    readFileTool,
    readFileLinesTool,
    readDirectoryTool,
    getDirectoryTreeTool,
    getFileOutlineTool,
    readSymbolTool,
  ];
}
