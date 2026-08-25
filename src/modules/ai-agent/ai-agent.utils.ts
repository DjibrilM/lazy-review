import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function chunkText(text: string, maxChunkSize = 1000): string[] {
  const lines = text.split('\n');
  const chunks: string[] = [];
  let currentChunk = '';

  for (const line of lines) {
    if (line.trim().length === 0) continue;

    // If a single line exceeds maxChunkSize, split it by character chunks
    if (line.length > maxChunkSize) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      let remaining = line;
      while (remaining.length > maxChunkSize) {
        chunks.push(remaining.substring(0, maxChunkSize));
        remaining = remaining.substring(maxChunkSize);
      }
      currentChunk = remaining;
    } else {
      if (currentChunk.length + line.length + 1 > maxChunkSize) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = line;
      } else {
        currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

export async function extractSymbolsWithAST(filePath: string, text: string): Promise<any[]> {
  try {
    const Parser = (await import('tree-sitter')).default;
    const parser = new Parser();
    let language;

    if (filePath.endsWith('.ts')) {
      language = (await import('tree-sitter-typescript')).default.typescript;
    } else if (filePath.endsWith('.tsx')) {
      language = (await import('tree-sitter-typescript')).default.tsx;
    } else if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      language = (await import('tree-sitter-javascript')).default;
    } else if (filePath.endsWith('.py')) {
      language = (await import('tree-sitter-python')).default;
    } else if (filePath.endsWith('.rs')) {
      language = (await import('tree-sitter-rust')).default;
    } else if (filePath.endsWith('.go')) {
      language = (await import('tree-sitter-go')).default;
    } else {
      return []; // Unsupported language fallback
    }

    parser.setLanguage(language);
    const tree = parser.parse(text);
    const symbols: any[] = [];

    const extractDependencies = (node: any): string[] => {
      const deps = new Set<string>();
      const walk = (n: any) => {
        if (n.type === 'call_expression') {
          const fnNode = n.children[0];
          if (fnNode) deps.add(fnNode.text);
        }
        for (let i = 0; i < n.childCount; i++) {
          walk(n.child(i));
        }
      };
      walk(node);
      return Array.from(deps);
    };

    const traverse = (node: any, parentName?: string) => {
      const type = node.type;
      let currentName = parentName;

      if (
        type === 'class_declaration' ||
        type === 'function_declaration' ||
        type === 'method_definition' ||
        type === 'function_item' ||
        type === 'impl_item'
      ) {
        const nameNode = node.children.find(
          (c: any) => c.type === 'identifier' || c.type === 'property_identifier',
        );
        const name = nameNode ? nameNode.text : 'anonymous';

        if (type === 'class_declaration' || type === 'impl_item') {
          currentName = name;
        } else {
          const symbol = {
            type: 'symbol',
            language: filePath.split('.').pop() || 'unknown',
            filePath,
            symbol: {
              name: parentName ? `${parentName}.${name}` : name,
              kind: type === 'method_definition' ? 'method' : 'function',
              parent: parentName,
              startLine: node.startPosition.row + 1,
              endLine: node.endPosition.row + 1,
            },
            dependencies: extractDependencies(node),
            content: node.text,
          };
          symbols.push(symbol);
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        traverse(node.child(i), currentName);
      }
    };

    traverse(tree.rootNode);
    return symbols;
  } catch (e) {
    console.error(`AST parsing failed for ${filePath}`, e);
    return [];
  }
}

export function extractJson(text: string): any {
  // 1. Try to extract from a markdown code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  let jsonString = codeBlockMatch ? codeBlockMatch[1] || text : text;

  // 2. Find the first '{' and the last '}'
  const start = jsonString.indexOf('{');
  const end = jsonString.lastIndexOf('}');

  if (start === -1 || end === -1 || start > end) {
    throw new Error('No JSON object found in response.');
  }

  jsonString = jsonString.substring(start, end + 1);

  // 3. Simple cleanup for common LLM JSON errors (trailing commas)
  jsonString = jsonString.replace(/,\s*([}\]])/g, '$1');

  return JSON.parse(jsonString);
}

export const createProjectManifestSummary = (facts: any): string => {
  // Extract scan results from facts
  const scanResult = facts.scanResult || {};
  const extractedFacts = facts.extractedFacts || [];

  // Build language distribution from all indexed files
  const languageDistribution: Record<string, number> = {};
  const fileTypes: Record<string, number> = {};
  const allImports: Record<string, number> = {};

  // Process scan results
  if (scanResult.files) {
    for (const file of scanResult.files) {
      const lang = file.language || 'unknown';
      languageDistribution[lang] = (languageDistribution[lang] || 0) + 1;
      const ext = path.extname(file.filePath).replace('.', '') || 'no-ext';
      fileTypes[ext] = (fileTypes[ext] || 0) + 1;

      // Collect imports
      if (file.imports) {
        for (const imp of file.imports) {
          const impName = imp.split('/').pop() || imp;
          allImports[impName] = (allImports[impName] || 0) + 1;
        }
      }
    }
  }

  // Process extracted facts for additional metadata
  const topImports = Object.entries(allImports)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  // Extract PR info from extracted facts if available
  const prInfo = extractedFacts.find((f: any) => f.source === 'dependency_graph');

  const langEntries =
    Object.entries(languageDistribution)
      .map(([lang, count]) => `${lang}: ${count}`)
      .join(', ') || 'Unknown';

  const importLines =
    topImports.map((imp) => `- ${imp.name}: used in ${imp.count} files`).join('\n') ||
    'No imports tracked';

  const fileTypeLines =
    Object.entries(fileTypes)
      .sort((a, b) => b[1] - a[1])
      .map(([ext, count]) => `- .${ext}: ${count} files`)
      .join('\n') || 'Unknown';

  const symbolLines =
    extractedFacts
      .filter((f: any) => f.source === 'symbol')
      .slice(0, 10)
      .map(
        (f: any) =>
          `- **${f.kind}**: ${f.symbolName} in ${f.filePath} (lines ${f.startLine}-${f.endLine})`,
      )
      .join('\n') || 'No symbols indexed';

  const prSection = prInfo
    ? `\n**PR Size:** ${prInfo.additions ?? 0} additions, ${prInfo.deletions ?? 0} deletions\n**Files Modified:** ${prInfo.changedFiles ?? 0}`
    : '';

  const totalSizeKB = (scanResult.totalBytes || 0) / 1024;
  const sizeDisplay = totalSizeKB.toFixed(1);

  // Build folder structure explanation
  const folderStructure = buildFolderStructure(scanResult);

  // Build run instructions
  const runInstructions = buildRunInstructions(facts);

  // Build codebase familiarization guide
  const familiarization = buildCodebaseFamiliarization(scanResult, extractedFacts);

  return `# Project: ${facts.project_name || 'Unknown Project'}

## Overview
This is a ${facts.application_type || 'software application'} built using the ${facts.architecture_pattern || 'Unknown'} architecture pattern.

${facts.explanation || 'No detailed explanation provided.'}

## Codebase Statistics
- **Total Files:** ${scanResult.totalFiles || 0}
- **Total Symbols:** ${scanResult.totalSymbols || 0}
- **Total Size:** ${sizeDisplay} KB
- **Languages Used:** ${langEntries}

## Entry Points & Key Files
- **Entry Points:** ${(scanResult.entryPoints || []).join(', ') || 'None identified'}
- **Entities/Models:** ${(scanResult.entityFiles || []).length} files
- **API Routes/Controllers:** ${(scanResult.routeFiles || []).length} files
- **Configuration Files:** ${(scanResult.configFiles || []).length} files

## Top Dependencies
${importLines}

## File Type Distribution
${fileTypeLines}

## Key Symbols (from indexed content)
${symbolLines}

## PR Context (if available)
${prSection}

## Folder Structure
${folderStructure}

## How to Run
${runInstructions}

## Codebase Familiarization
${familiarization}

## Directory Structure
${scanResult.directorySummary || 'No directory summary available'}
`;
};

function buildFolderStructure(scanResult: any): string {
  const files = scanResult.files || [];

  if (!files.length) return 'No files indexed.';

  // Group files by directory
  const dirs = new Map<string, string[]>();
  for (const file of files) {
    const parts = file.filePath.split('/');
    const dir = parts.slice(0, -1).join('/') || '.';
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir)!.push(file.filePath);
  }

  const sortedDirs = Array.from(dirs.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  let structure = '';
  for (const [dir, files] of sortedDirs) {
    const relDir = dir || '.';
    structure += `- **${relDir}/**\n`;
    for (const f of files.slice(0, 5)) {
      // Show first 5 files per dir
      structure += `  - \`${f}\`\n`;
    }
    if (files.length > 5) {
      structure += `  ... and ${files.length - 5} more files\n`;
    }
  }

  return structure || 'No folder structure available.';
}

function buildRunInstructions(facts: any): string {
  const instructions = [];

  // Check for common run methods
  if (facts.application_type === 'web application' || facts.application_type === 'website') {
    instructions.push('- **npm install**: Install dependencies');
    instructions.push('- **npm run dev** or **npm start**: Start development server');
    instructions.push('- **Open browser** to http://localhost:3000 or http://localhost:16500');
  }

  if (facts.application_type === 'api server' || facts.application_type === 'backend') {
    instructions.push('- **npm install**: Install dependencies');
    instructions.push('- **npm run dev**: Start the API server');
    instructions.push(
      '- **Server will listen** on the configured port (e.g., http://localhost:16500)',
    );
  }

  if (facts.required_secrets) {
    instructions.push(
      '- **Set required environment variables** as listed in the Required Secrets section',
    );
  }

  instructions.push('');
  instructions.push(
    "For detailed setup instructions, refer to the project's README and configuration files.",
  );

  return instructions.join('\n') || 'No run instructions available.';
}

function buildCodebaseFamiliarization(scanResult: any, extractedFacts: any[]): string {
  const files = scanResult.files || [];

  if (!files.length) return 'No codebase information available.';

  const sections = [];

  // Key areas of the codebase
  const entryPoints =
    (scanResult.entryPoints || []).map((p: string) => `- \`${p}\``).join(', ') || 'None identified';
  sections.push(`**Entry Points:** ${entryPoints}`);

  // Main modules/files
  const mainFiles =
    files
      .filter((f: { isEntryPoint: boolean }) => f.isEntryPoint)
      .slice(0, 10)
      .map(
        (f: { filePath: string; language: string }) =>
          `- \`${f.filePath}\` (${f.language || 'unknown'})`,
      )
      .join('\n') || 'No entry points identified';
  sections.push(`**Main Files:**\n${mainFiles}`);

  // Entity/models overview
  const entities =
    files
      .filter((f: { isEntity: boolean }) => f.isEntity)
      .slice(0, 5)
      .map((f: { filePath: string }) => `- \`${f.filePath}\` - Data entity/model`)
      .join('\n') || 'No entities identified';
  sections.push(`**Data Entities/Models:**\n${entities}`);

  // API routes overview
  const routes =
    files
      .filter((f: { isRoute: boolean }) => f.isRoute)
      .slice(0, 5)
      .map((f: { filePath: string }) => `- \`${f.filePath}\` - API route/controller`)
      .join('\n') || 'No routes identified';
  sections.push(`**API Routes/Controllers:**\n${routes}`);

  // Key symbols overview
  const symbols =
    extractedFacts
      .filter((f: { source: string }) => f.source === 'symbol')
      .slice(0, 10)
      .map(
        (f: {
          kind: string;
          symbolName: string;
          filePath: string;
          startLine: number;
          endLine: number;
        }) =>
          `- **${f.kind}**: ${f.symbolName} in ${f.filePath} (lines ${f.startLine}-${f.endLine})`,
      )
      .join('\n') || 'No symbols indexed';
  sections.push(`**Key Symbols:**\n${symbols}`);

  // Top imports
  const allImports: Record<string, number> = {};
  for (const file of files) {
    if (file.imports) {
      for (const imp of file.imports) {
        const impName = imp.split('/').pop() || imp;
        allImports[impName] = (allImports[impName] || 0) + 1;
      }
    }
  }
  const topImports =
    Object.entries(allImports)
      .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]: [string, number]) => `- \`${name}\` (in ${count} files)`)
      .join('\n') || 'No imports tracked';
  sections.push(`**Top Imports:**\n${topImports}`);

  return sections.join('\n\n') || 'No codebase familiarization information available.';
}

export function parseDiff(diffString: string): { file: string; diff: string }[] {
  const files: { file: string; diff: string }[] = [];
  const lines = diffString.split('\n');
  let currentFile = '';
  let currentDiff = '';

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (currentFile && currentDiff) {
        files.push({ file: currentFile, diff: currentDiff });
      }
      const match = line.match(/diff --git a\/(.+?) b\/(.+?)$/);
      if (match) {
        currentFile = match[2] || 'unknown';
      } else {
        currentFile = 'unknown';
      }
      currentDiff = line + '\n';
    } else {
      if (currentFile) {
        currentDiff += line + '\n';
      }
    }
  }

  if (currentFile && currentDiff) {
    files.push({ file: currentFile, diff: currentDiff });
  }

  return files;
}

export function purgeQvacKvCache(): boolean {
  try {
    const cacheDir = path.join(os.homedir(), '.qvac', 'kv-cache');
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
      console.log('Cleared QVAC KV cache directory:', cacheDir);
      return true;
    }
  } catch (err) {
    console.error('Failed to purge QVAC KV cache:', err);
  }
  return false;
}
