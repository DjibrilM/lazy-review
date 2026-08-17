import * as path from 'path';
import * as fs from 'fs/promises';
import type { Dirent } from 'fs';
import { extractSymbolsWithAST } from './ai-agent.utils.js';

export interface CodeSymbolFact {
  kind: string;
  name: string;
  startLine: number;
  endLine: number;
  parent?: string;
  dependencies: string[];
  content: string;
}

export interface FileFacts {
  filePath: string;
  language: string;
  sizeBytes: number;
  symbols: CodeSymbolFact[];
  imports: string[];
  exports: string[];
  isConfigFile: boolean;
  isEntryPoint: boolean;
  isEntity: boolean;
  isRoute: boolean;
  contentChunks: string[];
  dependencyNames: string[];
}

export interface CodebaseScanResult {
  files: FileFacts[];
  totalFiles: number;
  totalSymbols: number;
  totalBytes: number;
  entryPoints: string[];
  entityFiles: string[];
  routeFiles: string[];
  configFiles: string[];
  topLevelImports: Map<string, number>;
  directorySummary: string;
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.cache',
  'coverage',
  '.pnpm',
]);
const IGNORED_FILES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  '.DS_Store',
  'prompt_dump.txt',
]);
const SUPPORTED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.rs',
  '.go',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.md',
  '.sql',
  '.graphql',
  '.prisma',
  '.env.example',
]);

const ENTRY_POINT_CANDIDATES = new Set([
  'src/main.ts',
  'src/index.ts',
  'src/app.ts',
  'src/server.ts',
  'src/App.tsx',
  'main.ts',
  'index.ts',
  'app.ts',
  'server.ts',
  'main.js',
  'index.js',
  'src/main.js',
  'src/index.js',
  'src/server.js',
]);

const CONFIG_CANDIDATES = [
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'vite.config.js',
  'next.config.js',
  'next.config.ts',
  'docker-compose.yml',
  'docker-compose.yaml',
  'Dockerfile',
  'requirements.txt',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'Gemfile',
  '.env.example',
  'prisma/schema.prisma',
  'schema.graphql',
  'quasar.conf.js',
  'nuxt.config.ts',
  'tailwind.config.ts',
  'eslint.config.mjs',
  '.prettierrc',
  'rebar.config',
  'mix.exs',
];

export async function scanCodebase(absoluteRoot: string): Promise<CodebaseScanResult> {
  const files: FileFacts[] = [];
  let totalSymbols = 0;
  let totalBytes = 0;
  const entryPoints: string[] = [];
  const entityFiles: string[] = [];
  const routeFiles: string[] = [];
  const configFiles: string[] = [];
  const topLevelImports = new Map<string, number>();

  const walkDir = async (dir: string, relPath: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          await walkDir(path.join(dir, entry.name), path.posix.join(relPath, entry.name));
        }
        continue;
      }

      if (!entry.isFile() || IGNORED_FILES.has(entry.name)) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

      const fullPath = path.join(dir, entry.name);
      const relFilePath = path.posix.join(relPath, entry.name);

      try {
        const stat = await fs.stat(fullPath);
        if (stat.size > 2 * 1024 * 1024) continue;

        totalBytes += stat.size;
        const content = await fs.readFile(fullPath, 'utf-8');

        const filePathLower = relFilePath.toLowerCase();
        const isEntryPoint = ENTRY_POINT_CANDIDATES.has(relFilePath);
        const isConfigFile =
          CONFIG_CANDIDATES.includes(relFilePath) ||
          CONFIG_CANDIDATES.some((c) => relFilePath.endsWith(c));
        const isEntity =
          filePathLower.includes('entity') ||
          filePathLower.endsWith('.entity.ts') ||
          filePathLower.endsWith('.entity.js') ||
          filePathLower.endsWith('.model.ts') ||
          filePathLower.endsWith('.model.js');
        const isRoute =
          filePathLower.includes('route') ||
          filePathLower.includes('routes') ||
          filePathLower.includes('controller') ||
          filePathLower.includes('endpoint');

        let symbols: CodeSymbolFact[] = [];
        const importMatches = content.match(/^import\s+[^;\n]+/gm) || [];
        const requireMatches = content.match(/require\(['"][^'"]+['"]\)/g) || [];
        const imports = [...importMatches, ...requireMatches];

        const importNames = imports
          .map((s) => {
            const m = s.match(/from\s+['"]([^'"]+)['"]/);
            if (m && m[1]) return m[1].split('/').pop() || m[1];
            const r = s.match(/require\(['"]([^'"]+)['"]\)/);
            if (r && r[1]) return r[1].split('/').pop() || r[1];
            return '';
          })
          .filter((x): x is string => Boolean(x));

        for (const imp of importNames) {
          if (imp && !imp.startsWith('.') && !imp.startsWith('/')) {
            topLevelImports.set(imp, (topLevelImports.get(imp) || 0) + 1);
          }
        }

        if (
          ext === '.ts' ||
          ext === '.tsx' ||
          ext === '.js' ||
          ext === '.jsx' ||
          ext === '.py' ||
          ext === '.rs' ||
          ext === '.go'
        ) {
          try {
            const astSymbols = await extractSymbolsWithAST(fullPath, content);
            symbols = astSymbols.map((s) => {
              const symbol = s.symbol || {};
              return {
                kind: symbol.kind || 'symbol',
                name: symbol.name || 'anonymous',
                startLine: symbol.startLine || 0,
                endLine: symbol.endLine || 0,
                parent: symbol.parent,
                dependencies: s.dependencies || [],
                content: (s.content || '').substring(0, 1000),
              };
            });
          } catch {
            // AST parsing failed
          }
        }

        totalSymbols += symbols.length;

        if (isEntryPoint) entryPoints.push(relFilePath);
        if (isEntity) entityFiles.push(relFilePath);
        if (isRoute) routeFiles.push(relFilePath);
        if (isConfigFile) configFiles.push(relFilePath);

        const exportMatches =
          content.match(
            /^export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/gm,
          ) || [];

        files.push({
          filePath: relFilePath,
          language: ext.substring(1),
          sizeBytes: stat.size,
          symbols,
          imports: importNames.length > 10 ? importNames.slice(0, 10) : importNames,
          exports: exportMatches
            .map((m) => {
              const match = m.match(/(\w+)\s*$/);
              return match ? match[1] : '';
            })
            .filter((x): x is string => Boolean(x)),
          isConfigFile,
          isEntryPoint,
          isEntity,
          isRoute,
          contentChunks: [],
          dependencyNames: symbols.flatMap((s) => s.dependencies).slice(0, 20),
        });
      } catch {
        // Skip unreadable files
      }
    }
  };

  const dirCounts = new Map<string, number>();
  const collectDirs = async (dir: string, relPath: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !IGNORED_DIRS.has(entry.name)) {
        const childRel = relPath === '' ? entry.name : `${relPath}/${entry.name}`;
        const fileExts = new Set<string>();
        const subEntries = await fs
          .readdir(path.join(dir, entry.name), { withFileTypes: true })
          .catch(() => []);
        for (const sub of subEntries) {
          if (sub.isFile()) {
            const ext = path.extname(sub.name).toLowerCase();
            if (SUPPORTED_EXTENSIONS.has(ext)) fileExts.add(ext.substring(1));
          }
        }
        dirCounts.set(childRel, fileExts.size);
        await collectDirs(path.join(dir, entry.name), childRel);
      }
    }
  };

  await walkDir(absoluteRoot, '');
  await collectDirs(absoluteRoot, '');

  const directorySummary = Array.from(dirCounts.entries())
    .map(([dir, count]) => `📁 ${dir}/ (${count} file types)`)
    .join('\n');

  return {
    files,
    totalFiles: files.length,
    totalSymbols,
    totalBytes,
    entryPoints,
    entityFiles,
    routeFiles,
    configFiles,
    topLevelImports,
    directorySummary,
  };
}
