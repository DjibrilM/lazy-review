import { completion } from '@qvac/sdk';
import * as fs from 'fs/promises';
import { z } from 'zod';

import { createGitTools } from './tools/git-tools.js';
import { createFsTools } from './tools/fs-tools.js';
import { extractJson } from './ai-agent.utils.js';
import { AgentContextManager } from './agent-context-manager.js';
import ProjectEntity from '../server/entities/project.entity.js';

interface ParsedToolCall {
  name: string;
  arguments: unknown;
}

interface ToolExecutionResult {
  name: string;
  args: Record<string, any>;
  toolResult: any;
}

const finishResearchSchema = z.object({
  coverage: z.object({
    entryPoints: z.boolean(),
    runtimeArchitecture: z.boolean(),
    moduleRelationships: z.boolean(),
    primaryDataFlows: z.boolean(),
    persistence: z.boolean(),
    communication: z.boolean(),
    configuration: z.boolean(),
  }),
  remainingUnknowns: z.array(z.string()).default([]),
});

type ResearchCoverage = z.infer<typeof finishResearchSchema>['coverage'];

const REQUIRED_COVERAGE: Array<keyof ResearchCoverage> = [
  'entryPoints',
  'runtimeArchitecture',
  'moduleRelationships',
  'primaryDataFlows',
  'persistence',
  'communication',
  'configuration',
];

function normalizeToolArguments(input: unknown): Record<string, any> {
  if (!input) return {};

  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return {};
    }
  }

  if (typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, any>;
  }

  return {};
}

function parseFallbackToolCalls(rawText: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];

  try {
    const jsonRegex = /\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}/g;

    let match: RegExpExecArray | null;

    while ((match = jsonRegex.exec(rawText)) !== null) {
      try {
        const parsed = JSON.parse(match[0]);

        if (parsed.name && parsed.arguments !== undefined) {
          calls.push({
            name: parsed.name,
            arguments: parsed.arguments,
          });
        } else if (parsed.name && parsed.args !== undefined) {
          calls.push({
            name: parsed.name,
            arguments: parsed.args,
          });
        }
      } catch {
        // Ignore malformed JSON fragments.
      }
    }

    const toolCallRegex = /<\|tool_call\|?>?\s*:?\s*(?:call\s*:\s*)?([a-zA-Z0-9_-]+)\{(.*?)\}/g;

    let toolMatch: RegExpExecArray | null;

    while ((toolMatch = toolCallRegex.exec(rawText)) !== null) {
      try {
        const body = toolMatch[2]?.trim();
        const args = body ? JSON.parse(`{${body}}`) : {};

        calls.push({
          name: toolMatch[1] || '',
          arguments: args,
        });
      } catch {
        try {
          calls.push({
            name: toolMatch[1] || '',
            arguments: JSON.parse(toolMatch[2] || '{}'),
          });
        } catch {
          // Ignore malformed tool-call syntax.
        }
      }
    }
  } catch {
    // Fall back to no tool calls.
  }

  return calls;
}

function getMissingCoverage(coverage: ResearchCoverage): Array<keyof ResearchCoverage> {
  return REQUIRED_COVERAGE.filter((key) => coverage[key] !== true);
}

export async function runResearchAgentLoop(
  project: ProjectEntity,
  absoluteRoot: string,
  gemma4ModelId: string,
  orientationFileContents: string[],
  progress: (msg: string) => void,
  checkCancelled: () => void,
  awaitCompletion: (run: any) => Promise<any>,
) {
  const gitTools = createGitTools(absoluteRoot);
  const fsTools = createFsTools(absoluteRoot);

  // Prefer the filesystem implementation of read_file.
  const filteredGitTools = gitTools.filter((tool: any) => tool.name !== 'read_file');

  const finishTool = {
    name: 'finish_research',

    description:
      'Call this only after investigating the major architectural areas of the repository. Report which areas have been covered and any remaining unknowns.',

    parameters: finishResearchSchema,

    handler: (args: unknown) => ({
      action: 'finish',
      ...finishResearchSchema.parse(args),
    }),
  };

  const researchTools = [...filteredGitTools, ...fsTools, finishTool];

  const MAX_ITERATIONS = 12;
  const MAX_TOOL_CALLS = 20;
  const MAX_SOURCE_TOKENS = 16_000;

  let iteration = 0;
  let toolCallsCount = 0;
  let sourceTokensUsed = 0;
  let isDone = false;

  const jsonSchema = `{
    "project_name": "<string: exact project name>",

    "application_type": "<string: type of application>",

    "architecture_pattern": "<string: dominant observed architecture pattern>",

    "explanation": "<string: concise explanation of purpose, runtime layers, major data flows, persistence, and AI behavior>",

    "tech_stack": [
      "<string: technology directly observed in repository>"
    ],

    "core_modules": [
      {
        "path": "<string: module path>",
        "desc": "<string: concise role of module>",
        "responsibilities": [
          "<string: responsibility>"
        ],
        "depends_on": [
          "<string: important module or subsystem dependency>"
        ],
        "used_by": [
          "<string: important callers or consumers>"
        ],
        "evidence": [
          "<string: file path, symbol, or line reference>"
        ]
      }
    ],

    "folder_structure": "<string: concise description of important directories and their responsibilities>",

    "important_details": "<string: important setup, build, runtime, indexing, or development details>",

    "key_conventions": [
      "<string: codebase convention directly observed>"
    ],

    "required_secrets": [
      {
        "key": "<string: environment variable key>",
        "description": "<string: observed purpose>"
      }
    ],

    "entry_points": [
      {
        "path": "<string: file path>",
        "role": "<string: how this entry point starts or participates in the application>",
        "evidence": [
          "<string: file path, symbol, or line reference>"
        ]
      }
    ],

    "runtime_components": [
      {
        "name": "<string: runtime component such as CLI, web frontend, backend, worker, local model runtime>",
        "responsibility": "<string: responsibility>",
        "communicates_with": [
          "<string: other component>"
        ],
        "evidence": [
          "<string: file path or symbol>"
        ]
      }
    ],

    "data_flows": [
      {
        "name": "<string: flow name>",
        "trigger": "<string: what starts the flow>",
        "steps": [
          {
            "component": "<string: module or subsystem>",
            "action": "<string: what happens at this step>"
          }
        ],
        "evidence": [
          "<string: file path or symbol>"
        ]
      }
    ],

    "communication": [
      {
        "mechanism": "<string: HTTP, Socket.io, IPC, CLI, events, etc.>",
        "purpose": "<string: what this channel is used for>",
        "important_events_or_routes": [
          "<string: event, route, command, or message>"
        ],
        "evidence": [
          "<string: file path or symbol>"
        ]
      }
    ],

    "persistence": [
      {
        "technology": "<string: persistence technology>",
        "responsibility": "<string: what it stores or retrieves>",
        "stores": [
          "<string: persisted concept or entity>"
        ],
        "evidence": [
          "<string: file path or symbol>"
        ]
      }
    ],

    "domain_concepts": [
      {
        "name": "<string: important domain concept>",
        "description": "<string: meaning in this application>",
        "related_modules": [
          "<string: relevant module>"
        ],
        "evidence": [
          "<string: file path or symbol>"
        ]
      }
    ],

    "architectural_invariants": [
      {
        "rule": "<string: architectural rule or constraint that should remain true>",
        "reason": "<string: evidence-backed reason>",
        "evidence": [
          "<string: file path or symbol>"
        ]
      }
    ],

    "known_unknowns": [
      "<string: architectural detail that could not be confidently established>"
    ]
  }`;

  let topLevelFiles = '';

  try {
    const entries = await fs.readdir(absoluteRoot, {
      withFileTypes: true,
    });

    topLevelFiles = entries
      .filter((entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules')
      .map((entry) => (entry.isDirectory() ? `[DIR]  ${entry.name}/` : `[FILE] ${entry.name}`))
      .join('\n');
  } catch {
    topLevelFiles = 'Could not read directory structure.';
  }

  const systemPrompt = `
You are an expert software architect investigating a repository.

Your job is not to summarize files one by one.

Your job is to build an evidence-backed mental model of how the
application actually works.

RESEARCH GOALS

Before finishing, investigate:

1. ENTRY POINTS
   Determine what starts the application and where runtime initialization occurs.

2. RUNTIME ARCHITECTURE
   Identify the major runtime components, such as CLI, frontend, backend,
   workers, databases, local AI runtimes, or other processes.

3. MODULE RELATIONSHIPS
   Determine how important modules depend on, call, or communicate with one another.

4. PRIMARY DATA FLOWS
   Trace the most important end-to-end behaviors through the application.
   Examples include startup, indexing, user requests, AI inference,
   persistence, synchronization, review generation, and streaming.

5. PERSISTENCE
   Determine what is persisted, where it is persisted, and which modules
   read or write it.

6. COMMUNICATION
   Investigate HTTP routes, Socket.io events, IPC, CLI commands,
   internal events, or other important communication boundaries.

7. CONFIGURATION
   Determine important configuration files and environment variables only
   when they are directly evidenced by repository contents.

8. DOMAIN CONCEPTS
   Identify important application concepts represented by entities,
   services, types, state, or workflows.

9. ARCHITECTURAL INVARIANTS
   Identify constraints future changes should preserve when those
   constraints are supported by concrete repository evidence.

EVIDENCE RULES

- Prefer source-code evidence over guesses.
- Never invent environment variables.
- Never infer a technology merely because it is common for the stack.
- Never claim a data flow without following enough code to support it.
- Record exact file paths and important symbols for major conclusions.
- Clearly preserve uncertainty.
- If something cannot be established, add it to known unknowns.
- Architectural patterns may be inferred, but the implementation evidence
  supporting the inference must be understood first.

RESEARCH STRATEGY

- Start with entry points, package configuration, and orientation files.
- Follow imports and calls into major subsystems.
- Prefer search, outlines, and symbol-level inspection over entire files.
- Follow execution across module boundaries when investigating important flows.
- Do not repeatedly inspect the same file unless necessary.
- Do not exhaustively read the repository.
- Spend the research budget on architectural relationships rather than
  collecting isolated code snippets.

FINISHING

The finish_research coverage booleans mean that an area has been
investigated sufficiently to determine how it works, whether it is
applicable, or that a remaining uncertainty has been explicitly recorded.

Do not call finish_research merely because the technology stack and
several important files are known.

Do not output the final manifest during research.
`;

  const contextManager = new AgentContextManager(
    systemPrompt,
    gemma4ModelId,
    128_000,
    2_500,
    project.id.toString(),
  );

  contextManager.addRecent({
    role: 'user',
    content: `/no_think
## Repository: ${project.name}

## Top-level repository structure

${topLevelFiles}

## Orientation files

${orientationFileContents.join('\n\n')}

Explore the repository using your tools and build an architectural mental model.`,
  });

  // ─────────────────────────────────────────────
  // PHASE 1: RESEARCH
  // ─────────────────────────────────────────────

  while (
    !isDone &&
    iteration < MAX_ITERATIONS &&
    toolCallsCount < MAX_TOOL_CALLS &&
    sourceTokensUsed < MAX_SOURCE_TOKENS
  ) {
    checkCancelled();
    iteration++;

    const budget = {
      iterationsRemaining: MAX_ITERATIONS - iteration,

      toolCallsRemaining: MAX_TOOL_CALLS - toolCallsCount,

      sourceTokensRemaining: MAX_SOURCE_TOKENS - sourceTokensUsed,
    };

    if (contextManager.needsCompaction(0, budget)) {
      await contextManager.compactWithLLM(progress);
    }

    const researchRun = completion({
      modelId: gemma4ModelId,
      history: contextManager.buildHistory(budget),
      tools: researchTools as any,
      toolDialect: 'json',
      stream: false,
      maxTokens: 2048,
      kvCache: project.id.toString(),
    });

    const researchResult = await awaitCompletion(researchRun);

    checkCancelled();

    const rawText = researchResult.raw?.fullText || researchResult.contentText || '';

    let parsedToolCalls: ParsedToolCall[] = [];

    const resolvedToolCalls = await researchResult.toolCalls;

    if (resolvedToolCalls && resolvedToolCalls.length > 0) {
      parsedToolCalls = resolvedToolCalls.map((toolCall: any) => ({
        name: toolCall.name || toolCall.function?.name || '',

        arguments: toolCall.arguments || toolCall.function?.arguments || toolCall.args || {},
      }));
    } else {
      parsedToolCalls = parseFallbackToolCalls(rawText);
    }

    if (parsedToolCalls.length === 0) {
      if (!rawText.trim()) {
        continue;
      }

      contextManager.addRecent({
        role: 'assistant',
        content: researchResult.cacheableAssistantContent || rawText,
      });

      if (rawText.includes('<execute_tool>')) {
        contextManager.addRecent({
          role: 'user',
          content: `/no_think
CRITICAL ERROR: <execute_tool> is not a supported tool-call format.

Use the configured JSON tool calling format.

Example:
{"name":"read_file","arguments":{"filePath":"src/index.ts"}}`,
        });
      } else {
        contextManager.addRecent({
          role: 'user',
          content: `/no_think
Continue researching with a tool call.

If the architectural research goals have all been investigated, call
finish_research with the required coverage object.

Do not respond with a prose summary yet.`,
        });
      }

      continue;
    }

    contextManager.addRecent({
      role: 'assistant',
      content: researchResult.cacheableAssistantContent || rawText,
    });

    const executableCalls: Array<{
      name: string;
      args: Record<string, any>;
    }> = [];

    for (const toolCall of parsedToolCalls) {
      if (toolCallsCount >= MAX_TOOL_CALLS) {
        break;
      }

      toolCallsCount++;

      const args = normalizeToolArguments(toolCall.arguments);

      if (toolCall.name === 'finish_research' || toolCall.name === 'finish') {
        const finishResult = finishResearchSchema.safeParse(args);

        if (!finishResult.success) {
          contextManager.addRecent({
            role: 'tool',
            content: JSON.stringify({
              error:
                'finish_research requires the complete coverage object and remainingUnknowns array.',
              details: finishResult.error.flatten(),
            }),
          });

          continue;
        }

        const missingCoverage = getMissingCoverage(finishResult.data.coverage);

        if (missingCoverage.length > 0) {
          contextManager.addRecent({
            role: 'tool',
            content: JSON.stringify({
              action: 'continue_research',
              error: 'Research coverage is incomplete.',
              missingCoverage,
              instruction:
                'Investigate these areas before finishing. If an area is genuinely unknown after investigation, record the uncertainty in remainingUnknowns and mark the area covered.',
            }),
          });

          continue;
        }

        if (finishResult.data.remainingUnknowns.length > 0) {
          contextManager.addRecent({
            role: 'tool',
            content: JSON.stringify({
              action: 'finish',
              remainingUnknowns: finishResult.data.remainingUnknowns,
            }),
          });
        }

        isDone = true;
        break;
      }

      if (toolCall.name === 'read_file') {
        const filePath = args.filePath || args.file_path;

        if (filePath && contextManager.hasInspected(filePath) && !args.force) {
          contextManager.addRecent({
            role: 'tool',
            content: JSON.stringify({
              error: 'This file has already been inspected. Re-reading it wastes research context.',
              alreadyInspected: true,
              filePath,
              instruction:
                'Use search or inspect another related module. Pass force=true only if re-reading this file is necessary.',
            }),
          });

          continue;
        }
      }

      executableCalls.push({
        name: toolCall.name,
        args,
      });
    }

    if (isDone) {
      break;
    }

    if (executableCalls.length === 0) {
      continue;
    }

    // Research tools are read-only, so independent calls may execute
    // concurrently.
    const toolExecutionResults: ToolExecutionResult[] = await Promise.all(
      executableCalls.map(async ({ name, args }): Promise<ToolExecutionResult> => {
        const tool = researchTools.find((candidate: any) => candidate.name === name);

        if (!tool) {
          return {
            name,
            args,
            toolResult: {
              error: `Unknown tool: ${name}`,
            },
          };
        }

        let toolMessage = `🔧 Using tool: ${name}`;

        if (name === 'read_file' && (args.file_path || args.filePath)) {
          toolMessage = `📂 Reading file: ${args.file_path || args.filePath}`;
        } else if (name === 'search_in_files' && args.keyword) {
          toolMessage = `🔎 Searching codebase for: "${args.keyword}"`;
        }

        console.log(`\n[AI Tool Execution] ${toolMessage}`);

        checkCancelled();

        try {
          let toolResult: any;

          if ('invoke' in tool && typeof (tool as any).invoke === 'function') {
            toolResult = await (tool as any).invoke(args);
          } else if ('handler' in tool && typeof (tool as any).handler === 'function') {
            toolResult = await (tool as any).handler(args);
          } else {
            toolResult = {
              error: 'Tool has no executable handler.',
            };
          }

          return {
            name,
            args,
            toolResult,
          };
        } catch (error: any) {
          console.error(`\n[AI Tool Error] ${error.message}`);

          return {
            name,
            args,
            toolResult: {
              error: error.message,
            },
          };
        }
      }),
    );

    for (const { name, args, toolResult } of toolExecutionResults) {
      console.log(
        `[AI Tool Result] Returned payload of ${Buffer.byteLength(
          JSON.stringify(toolResult) || '',
          'utf8',
        )} bytes\n`,
      );

      const estimatedToolTokens = contextManager.estimateTokens(toolResult);

      sourceTokensUsed += estimatedToolTokens;

      if (
        contextManager.needsCompaction(estimatedToolTokens, {
          iterationsRemaining: MAX_ITERATIONS - iteration,

          toolCallsRemaining: MAX_TOOL_CALLS - toolCallsCount,

          sourceTokensRemaining: MAX_SOURCE_TOKENS - sourceTokensUsed,
        })
      ) {
        await contextManager.compactWithLLM(progress);
      }

      contextManager.addRecent({
        role: 'tool',
        content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
      });

      // Research records what has already been inspected,
      // but it does NOT modify the vector database.
      if (name === 'read_file' && toolResult && !toolResult.error) {
        const filePath = args.filePath || args.file_path;

        if (filePath) {
          contextManager.markFileInspected(filePath, 'Architecture research', []);
        }
      }
    }
  }

  // ─────────────────────────────────────────────
  // PHASE 2: SYNTHESIS
  // ─────────────────────────────────────────────

  checkCancelled();

  contextManager.addRecent({
    role: 'user',
    content: `/no_think
The repository research phase is complete.

Using only information established during research and the Research Memory,
produce the final architectural manifest.

RULES:

- Use direct repository evidence.
- Do not invent technologies, secrets, routes, events, entities, or flows.
- Keep uncertain conclusions in known_unknowns.
- Preserve evidence for important architectural claims.
- data_flows should describe behavior across components rather than individual functions.
- architectural_invariants must be supported by repository behavior or configuration.
- Keep the legacy fields application_type, architecture_pattern,
  explanation, tech_stack, core_modules, folder_structure,
  important_details, key_conventions, and required_secrets populated
  because they are consumed by the existing project-summary renderer.

Output strictly valid JSON matching this schema:

\`\`\`json
${jsonSchema}
\`\`\`

Provide ONLY the JSON object.`,
  });

  const synthesisRun = completion({
    modelId: gemma4ModelId,
    history: contextManager.buildHistory(),
    stream: true,
    maxTokens: 16_384,
    kvCache: project.id.toString(),
  });

  const synthesisResult = await awaitCompletion(synthesisRun);

  const manifestResultContent = synthesisResult.contentText || '';

  try {
    const extractedFacts = extractJson(manifestResultContent);

    return {
      ...extractedFacts,

      project_name: extractedFacts.project_name || project.name,

      application_type: extractedFacts.application_type || 'Unknown',

      architecture_pattern: extractedFacts.architecture_pattern || 'Unknown',

      explanation: extractedFacts.explanation || '',

      tech_stack: extractedFacts.tech_stack || [],

      core_modules: extractedFacts.core_modules || [],

      folder_structure: extractedFacts.folder_structure || '',

      important_details: extractedFacts.important_details || '',

      key_conventions: extractedFacts.key_conventions || [],

      required_secrets: extractedFacts.required_secrets || [],

      entry_points: extractedFacts.entry_points || [],

      runtime_components: extractedFacts.runtime_components || [],

      data_flows: extractedFacts.data_flows || [],

      communication: extractedFacts.communication || [],

      persistence: extractedFacts.persistence || [],

      domain_concepts: extractedFacts.domain_concepts || [],

      architectural_invariants: extractedFacts.architectural_invariants || [],

      known_unknowns: extractedFacts.known_unknowns || [],
    };
  } catch {
    return {
      project_name: project.name,
      application_type: 'Unknown',
      architecture_pattern: 'Unknown (LLM Parse Error)',
      explanation: 'Failed to parse the architecture research output.',

      tech_stack: [],
      core_modules: [],
      folder_structure: '',
      important_details: '',
      key_conventions: [],
      required_secrets: [],

      entry_points: [],
      runtime_components: [],
      data_flows: [],
      communication: [],
      persistence: [],
      domain_concepts: [],
      architectural_invariants: [],
      known_unknowns: ['The final research manifest could not be parsed.'],
    };
  }
}
