import { extractJson, parseDiff } from '../ai-agent.utils.js';
import { runAgentLoop, type ToolDefinition } from './agent-loop.js';
import type { ReviewerCandidate } from './types.js';

export interface SecretScannerOpts {
  modelId: string;
  kvCacheId?: string | undefined;
  progress?: ((m: string) => void) | undefined;
}

/**
 * File-name patterns that flag a changed file as a likely carrier of secrets.
 * These are used to steer the Secret Scanner agent (and are matched over the
 * PR diff file names) before it deep-dives into a file's diff content.
 */
export const SENSITIVE_FILE_PATTERNS: RegExp[] = [
  /(^|\/)\.env([^/]*)$/i, // .env, .env.local, .env.production, ...
  /\.env\.(local|dev|development|test|staging|prod|production|example)$/i,
  /\.(pem|p12|pfx|p8|key|keystore|jks|ppk)$/i,
  /(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\.pub)?$/i,
  /(^|\/)(credentials|secret|secrets)([^/]*)$/i,
  /(^|\/)secret\.(ya?ml|json|env)$/i,
  /service-account[^/]*\.json$/i,
  /google-credentials[^/]*\.json$/i,
  /(^|\/)\.(npmrc|pypirc|netrc|htpasswd)$/i,
  /(^|\/)dockerconfigjson$/i,
  /(^|\/)\.docker\/config\.json$/i,
];

const BUDGET = 12;

const FILE_NAME_GUIDANCE = `
Watch carefully for file NAMES that commonly hold secrets and must NEVER be committed:
- Environment files: .env, .env.local, .env.production, .env.*
- Private key / certificate material: *.pem, *.key, *.p12, *.pfx, *.p8, *.keystore, *.jks, id_rsa, id_dsa, id_ecdsa, id_ed25519
- Credential / secret bundles: credentials*, secret(s).yaml|json|env, service-account*.json, google-credentials*.json, .npmrc, .pypirc, .netrc, .htpasswd, dockerconfigjson`;

const CONFIRMATION_RULE = `
Only report a finding when you CONFIRMED an actual secret in the file's diff content,
such as: KEY=VALUE assignments where the value looks like a credential, tokens,
passwords, connection strings, or an "-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY-----" block.
Do NOT report files whose diff contains only placeholders, empty values, or example data.
For each confirmed file, set evidence to the exact secret-bearing line(s) and
location to the file (and line when the diff reveals it).`;

/**
 * Secret Scanner agent.
 *
 * In charge of finding sensitive files and leaked secrets that should never reach
 * GitHub (env files, private keys, credential bundles, etc.). It reviews the PR's
 * changed file names; when a name may contain secrets it calls the
 * `read_pr_file_diff` tool to read that file's diff and CONFIRM the secret exists.
 *
 * Returns confirmed findings as security ReviewerCandidates so they flow through
 * the pipeline's verifier, ranker, and writer.
 */
export async function scanSensitiveFiles(
  opts: SecretScannerOpts,
  diffText: string,
): Promise<ReviewerCandidate[]> {
  const parsedDiff = parseDiff(diffText);
  if (parsedDiff.length === 0) return [];

  const byFile = new Map(parsedDiff.map((f) => [f.file, f.diff]));
  const changedFiles = parsedDiff.map((f) => f.file);

  const system = `You are the Secret Scanner agent in a code review pipeline.

Your ONLY job is to find files that should NEVER be committed to GitHub because
they contain secrets (API keys, passwords, tokens, private keys, database credentials).

You receive the list of file paths changed in this PR. Inspect every file NAME.
${FILE_NAME_GUIDANCE}

If a file NAME looks like it may contain secrets, call the read_pr_file_diff tool
with its full path to read the actual diff content for that file.
${CONFIRMATION_RULE}

Use "evidence" only from the diff content returned by read_pr_file_diff.

Output ONLY a JSON array of confirmed findings:
[{"hypothesis":"...","confidence":0.0-1.0,"impactScore":1-4,"likelihoodScore":1-4,"impactDescription":"...","recommendation":"...","invariant":"...","evidence":[{"fact":"...","source":"file:line"}],"location":{"file":"src/.env","line":3}}]`;

  const tools: ToolDefinition[] = [
    {
      name: 'read_pr_file_diff',
      description:
        'Read the exact diff content for a specific file changed in this PR. Use this to confirm whether a sensitive-named file actually contains secrets.',
      handler: async (a) => {
        const p = String(a.file_path ?? a.filePath ?? '');
        if (!p) return { error: 'file_path (or filePath) is required.' };
        const diff = byFile.get(p);
        if (diff === undefined) return { error: `File "${p}" is not in this PR's diff.` };
        return { file: p, diff };
      },
    },
  ];

  const result = await runAgentLoop({
    modelId: opts.modelId,
    systemPrompt: system,
    userMessage: `## Files changed in this PR\n${changedFiles
      .map((f) => '- ' + f)
      .join(
        '\n',
      )}\n\n${FILE_NAME_GUIDANCE}\n\nReview each file name above. For any name that may hold secrets, call read_pr_file_diff to read its diff and CONFIRM the secret. Output the JSON array of confirmed findings when done.`,
    tools,
    maxIterations: 10,
    maxToolCalls: BUDGET + 1,
    maxSourceTokens: 10_000,
    kvCacheId: opts.kvCacheId,
    progress: (m) => opts.progress?.('[SecretScanner] ' + m),
    finalize: 'Output ONLY a JSON array (possibly empty) of confirmed findings. No markdown.',
  });

  try {
    const parsed = extractJson(result.text);
    const arr: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.findings)
        ? parsed.findings
        : [];
    return arr
      .filter((f: any) => f && typeof f.hypothesis === 'string')
      .map((f: any): ReviewerCandidate => {
        const c: ReviewerCandidate = {
          category: 'security',
          hypothesis: String(f.hypothesis),
          confidence: clamp(f.confidence),
          evidence: Array.isArray(f.evidence)
            ? f.evidence.map((e: any) => ({
                fact: String(e.fact ?? ''),
                source: String(e.source ?? ''),
              }))
            : [],
        };
        const impactScore = clampScore(f.impactScore);
        if (impactScore !== undefined) c.impactScore = impactScore;
        const likelihoodScore = clampScore(f.likelihoodScore);
        if (likelihoodScore !== undefined) c.likelihoodScore = likelihoodScore;
        if (f.impactDescription) c.impactDescription = String(f.impactDescription);
        if (f.recommendation) c.recommendation = String(f.recommendation);
        if (f.invariant) c.invariant = String(f.invariant);
        const loc = buildLocation(f.location);
        if (loc) c.location = loc;
        return c;
      });
  } catch {
    return [];
  }
}

function clamp(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
}

function clampScore(n: unknown): 1 | 2 | 3 | 4 | undefined {
  const v = Number(n);
  if (!Number.isFinite(v)) return undefined;
  return Math.min(4, Math.max(1, Math.round(v))) as 1 | 2 | 3 | 4;
}

function buildLocation(loc: unknown): { file: string; line?: number } | undefined {
  if (!loc || typeof loc !== 'object') return undefined;
  const o = loc as Record<string, unknown>;
  const file = String(o.file ?? '');
  if (!file) return undefined;
  const line = Number(o.line);
  return { file, ...(Number.isFinite(line) && line > 0 ? { line } : {}) };
}
