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
  return `# Project: ${facts.project_name || 'Unknown Project'}

## Overview
This is a ${facts.application_type || 'software application'} built using the ${facts.architecture_pattern || 'Unknown'} architecture pattern.

${facts.explanation || 'No detailed explanation provided.'}

## Technology Stack
The core technologies and frameworks used are:
${(facts.tech_stack || []).map((tech: string) => `- ${tech}`).join('\n')}

## Core Modules
${(facts.core_modules || []).map((m: any) => `- **${m.path}**: ${m.desc}`).join('\n')}

## Key Conventions
${(facts.key_conventions || []).map((k: string) => `- ${k}`).join('\n')}

## Required Secrets & Environment Variables
${(facts.required_secrets || []).map((s: any) => `- **${s.key}**: ${s.description}`).join('\n')}
`;
};

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
