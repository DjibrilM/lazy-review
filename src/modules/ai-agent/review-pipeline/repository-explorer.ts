import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { extractSymbolsWithAST, extractJson } from '../ai-agent.utils.js';
import { runAgentLoop, type ToolDefinition } from './agent-loop.js';
import type { Evidence, ExplorerAnswer } from './types.js';

const LIMIT_BYTES = 60 * 1024;
const LIMIT_HITS = 20;

interface Opts {
  basePath: string;
  modelId: string;
  kvCacheId?: string | undefined;
  progress?: ((m: string) => void) | undefined;
  semanticSearch?: ((q: string) => Promise<string>) | undefined;
}

export class RepositoryExplorer {
  private root: string;

  constructor(private opts: Opts) {
    this.root = path.resolve(opts.basePath);
  }

  private safe(p: string): string {
    const r = path.resolve(this.root, p);
    if (!r.startsWith(this.root)) throw new Error(`Path "${p}" outside repo root.`);
    return r;
  }

  private async read(p: string): Promise<string | null> {
    try {
      const r = this.safe(p);
      const st = await fs.stat(r);
      if (!st.isFile()) return null;
      if (st.size > LIMIT_BYTES) {
        const fd = await fs.open(r, 'r');
        try {
          const buf = Buffer.alloc(LIMIT_BYTES);
          const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
          return buf.subarray(0, bytesRead).toString('utf-8');
        } finally {
          await fd.close();
        }
      }
      return await fs.readFile(r, 'utf-8');
    } catch {
      return null;
    }
  }

  private async doSearch(kw: string, ext?: string): Promise<unknown> {
    if (!kw) return { error: 'keyword required' };
    const k = kw.toLowerCase();
    const results: { file: string; line: number; content: string }[] = [];

    const walk = async (dir: string): Promise<void> => {
      if (results.length >= LIMIT_HITS) return;
      let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[];
      try {
        entries = await fs.readdir(path.join(this.root, dir), { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        if (results.length >= LIMIT_HITS) return;
        if (ent.isDirectory()) {
          if (
            ['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage'].includes(
              ent.name,
            )
          )
            continue;
          await walk(path.join(dir, ent.name));
          continue;
        }
        if (!ent.isFile()) continue;
        const rel = path.join(dir, ent.name);
        if (ext && !rel.endsWith(ext)) continue;
        const c = await this.read(rel);
        if (!c || c.length > 400 * 1024) continue;
        const ls = c.split('\n');
        for (let i = 0; i < ls.length && results.length < LIMIT_HITS; i++) {
          if (ls[i]?.toLowerCase().includes(k)) {
            results.push({ file: rel, line: i + 1, content: ls[i]!.trim() });
          }
        }
      }
    };

    await walk('');
    return { matches: results, total: results.length, capped: results.length >= LIMIT_HITS };
  }

  private tools(): ToolDefinition[] {
    return [
      {
        name: 'search_symbol',
        description: 'Search the repo for a symbol/keyword. Returns up to 20 matches.',
        handler: async (a) =>
          this.doSearch(
            String(a.keyword ?? ''),
            a.fileExtension ? String(a.fileExtension) : undefined,
          ),
      },
      {
        name: 'read_file',
        description: 'Read a repository file (relative path). Large files are truncated.',
        handler: async (a) => {
          const p = String(a.filePath ?? a.file_path ?? '');
          if (!p) return { error: 'filePath required' };
          const c = await this.read(p);
          if (c === null) return { error: `File ${p} not found` };
          return { file: p, content: c };
        },
      },
      {
        name: 'read_file_lines',
        description: 'Read a line range from a file (1-based inclusive).',
        handler: async (a) => {
          const p = String(a.filePath ?? a.file_path ?? '');
          const start = Number(a.startLine ?? 1);
          const end = a.endLine !== undefined ? Number(a.endLine) : start + 80;
          if (!p) return { error: 'filePath required' };
          const c = await this.read(p);
          if (c === null) return { error: `File ${p} not found` };
          const ls = c.split('\n');
          const s = Math.max(1, start);
          const e = Math.min(end, ls.length);
          return {
            file: p,
            lines: `${s}-${e} of ${ls.length}`,
            content: ls
              .slice(s - 1, e)
              .map((l, i) => `${s + i}\t${l}`)
              .join('\n'),
          };
        },
      },
      {
        name: 'file_outline',
        description: 'List symbols (functions/classes) in a file with line ranges.',
        handler: async (a) => {
          const p = String(a.filePath ?? a.file_path ?? '');
          if (!p) return { error: 'filePath required' };
          const c = await this.read(p);
          if (c === null) return { error: `File ${p} not found` };
          const syms = await extractSymbolsWithAST(this.safe(p), c);
          return {
            file: p,
            symbols: syms.map((s: any) => ({
              name: s.symbol.name,
              kind: s.symbol.kind,
              startLine: s.symbol.startLine,
              endLine: s.symbol.endLine,
            })),
          };
        },
      },
      {
        name: 'read_symbol',
        description: 'Read the exact source of a named symbol from a file.',
        handler: async (a) => {
          const p = String(a.filePath ?? a.file_path ?? '');
          const n = String(a.symbolName ?? a.symbol ?? '');
          if (!p || !n) return { error: 'filePath and symbolName required' };
          const c = await this.read(p);
          if (c === null) return { error: `File ${p} not found` };
          const sym = (await extractSymbolsWithAST(this.safe(p), c)).find(
            (s: any) => s.symbol.name === n || s.symbol.name.endsWith('.' + n),
          );
          if (!sym) return { error: `Symbol ${n} not found in ${p}` };
          return {
            file: p,
            symbol: sym.symbol.name,
            startLine: sym.symbol.startLine,
            endLine: sym.symbol.endLine,
            content: sym.content,
          };
        },
      },
      {
        name: 'semantic_search',
        description: 'Search indexed semantic facts for architecture and data-flow context.',
        handler: async (a) => {
          const q = String(a.query ?? '');
          if (!q) return { error: 'query required' };
          const r = await this.opts.semanticSearch?.(q);
          return r ? { result: r } : { result: 'No semantic facts available.' };
        },
      },
    ];
  }

  /** Ask the explorer a precise question; it returns compact evidence facts. */
  async ask(question: string): Promise<ExplorerAnswer> {
    const system = `You are a focused repository investigator.

Answer ONE precise question by gathering observable evidence from the repository.
Do NOT review or judge quality — collect ONLY facts.
RULES:
- Use tools to find symbols, read files, search for writes/deletes/handlers.
- Every fact must have a source (file:line when possible).
- Prefer symbols and short reads over full-file reads.
- Do NOT speculate. If code does not reveal the answer, set missingEvidence=true.
- When confident, output ONLY a JSON object:
{
  "facts": [{ "fact": "observable behavior", "source": "file:line" }],
  "confidence": 0.0-1.0,
  "missingEvidence": false
}

QUESTION:
${question}`;

    const tools = this.tools();
    const result = await runAgentLoop({
      modelId: this.opts.modelId,
      systemPrompt: system,
      userMessage: `Answer this question with repository evidence:\n"${question}"`,
      tools,
      maxIterations: 6,
      maxToolCalls: 14,
      maxSourceTokens: 10_000,
      kvCacheId: this.opts.kvCacheId,
      progress: (m) => this.opts.progress?.('[Explorer] ' + m),
      finalize: `Output ONLY a JSON object:
{
  "facts": [{ "fact": "observable behavior", "source": "file:line" }],
  "confidence": 0.0-1.0,
  "missingEvidence": true/false
}
No markdown.`,
    });

    let facts: Evidence[] = [];
    let confidence = 0;
    let missing = true;
    try {
      const p = extractJson(result.text);
      if (Array.isArray(p.facts)) facts = p.facts;
      if (typeof p.confidence === 'number') confidence = Math.min(1, Math.max(0, p.confidence));
      if (typeof p.missingEvidence === 'boolean') missing = p.missingEvidence;
    } catch {
      if (result.text.trim())
        facts = [{ fact: result.text.trim().slice(0, 2000), source: 'explorer-response' }];
    }

    return { question, facts, confidence: missing ? 0 : confidence, missingEvidence: missing };
  }
}
