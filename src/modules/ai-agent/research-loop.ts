import { completion } from '@qvac/sdk';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createGitTools } from './tools/git-tools.js';
import { createFsTools } from './tools/fs-tools.js';
import { extractJson } from './ai-agent.utils.js';
import { AgentContextManager } from './agent-context-manager.js';
import ProjectEntity from '../server/entities/project.entity.js';
import { z } from 'zod';

export async function runResearchAgentLoop(
  project: ProjectEntity,
  absoluteRoot: string,
  gemma4ModelId: string,
  orientationFileContents: string[],
  progress: (msg: string) => void,
  checkCancelled: () => void,
  awaitCompletion: (run: any) => Promise<any>,
  embedAndSaveFact: (...args: any[]) => any,
) {
  const gitTools = createGitTools(absoluteRoot);
  const fsTools = createFsTools(absoluteRoot);

  // Filter out duplicate read_file from gitTools in favor of fsTools
  const filteredGitTools = gitTools.filter((t: any) => t.name !== 'read_file');

  const finishTool = {
    name: 'finish_research',
    description:
      'Call this tool when you have gathered enough information and are ready to synthesize the final architectural manifest.',
    parameters: z.object({}),
    handler: () => ({ action: 'finish' }),
  };

  const researchTools = [...filteredGitTools, ...fsTools, finishTool];

  const MAX_ITERATIONS = 10;
  const MAX_TOOL_CALLS = 15;
  const MAX_SOURCE_TOKENS = 12000;
  let iteration = 0;
  let toolCallsCount = 0;
  let sourceTokensUsed = 0;
  let isDone = false;
  let manifestResultContent = '';

  const jsonSchema = `{
            "project_name": "<string: exact project name>",
            "application_type": "<string: type of application, e.g., web app, cli tool>",
            "architecture_pattern": "<string: architectural pattern observed>",
            "explanation": "<string: 1 short paragraph describing purpose, layers, and data flows>",
            "tech_stack": ["<string: technology name>"],
            "core_modules": [
              { "path": "<string: module path>", "desc": "<string: what the module handles>", "evidence": ["<string: file path and line number>"] }
            ],
            "folder_structure": "<string: brief overview of key directories>",
            "important_details": "<string: critical info about setup or dev flows>",
            "key_conventions": [
              "<string: coding convention observed>"
            ],
            "required_secrets": [
              { "key": "<string: env var key>", "description": "<string: what it is>" }
            ]
          }`;

  let topLevelFiles = '';
  try {
    const entries = await fs.readdir(absoluteRoot, { withFileTypes: true });
    const filtered = entries.filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules');
    topLevelFiles = filtered
      .map((e) => (e.isDirectory() ? `[DIR]  ${e.name}/` : `[FILE] ${e.name}`))
      .join('\n');
  } catch {
    topLevelFiles = 'Could not read directory structure.';
  }

  const systemPrompt = `You are an expert code reviewer exploring a repository.
Your mission is to deeply understand this repository's architecture.

CRITICAL INSTRUCTIONS:
1. Use your tools to investigate the codebase.
2. Rely primarily on the provided repository tree and orientation files.
3. Do not exhaustively read files. Prefer searching, reading outlines, or reading specific symbols.
4. When you have enough context to describe the architecture, tech stack, and core modules, call the 'finish_research' tool.
5. Do NOT generate the final JSON manifest in this step. Just explore.`;

  const contextManager = new AgentContextManager(
    systemPrompt,
    gemma4ModelId,
    128000,
    2500,
    project.id.toString(),
  );

  contextManager.addRecent({
    role: 'user',
    content: `/no_think\n## Repository: ${project.name}\n\nHere is the top-level directory structure to get you started:\n${topLevelFiles}\n\nOrientation file contents found:\n${orientationFileContents.join('\n')}\n\nExplore the codebase using your tools.`,
  });

  try {
    const dumpPath = path.join(absoluteRoot, 'prompt_dump.txt');
    await fs.writeFile(dumpPath, JSON.stringify(contextManager.buildHistory(), null, 2), 'utf-8');
  } catch (err: any) {
    console.warn(`Failed to write prompt dump to ${absoluteRoot}:`, err.message);
  }

  // PHASE: RESEARCH
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

    const history = contextManager.buildHistory(budget);

    const researchRun = completion({
      modelId: gemma4ModelId,
      history,
      tools: researchTools as any,
      toolDialect: 'json',
      stream: false,
      maxTokens: 2048,
      kvCache: project.id.toString(),
    });
    const researchResult = await awaitCompletion(researchRun);
    checkCancelled();

    const rawText = researchResult.raw?.fullText || researchResult.contentText || '';
    let parsedToolCalls: any[] = [];

    const resolvedToolCalls = await researchResult.toolCalls;
    if (resolvedToolCalls && resolvedToolCalls.length > 0) {
      parsedToolCalls = resolvedToolCalls.map((tc: any) => ({
        name: tc.name || tc.function?.name,
        arguments: tc.arguments || tc.function?.arguments || tc.args,
      }));
    } else {
      try {
        const regex = /\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}/g;
        let match;
        while ((match = regex.exec(rawText)) !== null) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed.name && parsed.arguments) {
              parsedToolCalls.push({ name: parsed.name, arguments: parsed.arguments });
            } else if (parsed.name && parsed.args) {
              parsedToolCalls.push({ name: parsed.name, arguments: parsed.args });
            }
          } catch {
            // ignore
          }
        }

        const agRegex = /<\|tool_call\|>?:?call:([a-zA-Z0-9_-]+)\{(.*?)\}/g;
        let agMatch;
        while ((agMatch = agRegex.exec(rawText)) !== null) {
          try {
            let parsedArgs = {};
            if (agMatch[2] && agMatch[2].trim()) {
              parsedArgs = JSON.parse('{' + agMatch[2] + '}');
            }
            parsedToolCalls.push({ name: agMatch[1] || '', arguments: parsedArgs });
          } catch {
            try {
              const parsedArgs = JSON.parse(agMatch[2] || '{}');
              parsedToolCalls.push({ name: agMatch[1] || '', arguments: parsedArgs });
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }
    }

    if (parsedToolCalls.length > 0) {
      contextManager.addRecent({
        role: 'assistant',
        content: researchResult.cacheableAssistantContent || rawText,
      });

      for (const parsedToolCall of parsedToolCalls) {
        toolCallsCount++;
        if (parsedToolCall.name === 'finish_research' || parsedToolCall.name === 'finish') {
          isDone = true;
          break;
        }

        const tool = researchTools.find((t: any) => t.name === parsedToolCall.name);
        if (tool) {
          let args = parsedToolCall.arguments;
          if (typeof args === 'string') {
            try {
              args = JSON.parse(args);
            } catch {
              // ignore
            }
          }
          args = args || {};

          if (parsedToolCall.name === 'read_file') {
            const filePath = args.filePath || args.file_path;
            if (contextManager.hasInspected(filePath) && !args.force) {
              const warningMsg = `Warning: You have already inspected this file. Repeated inspections waste context window. If you really need to re-read it, pass { "force": true } in your arguments.`;

              contextManager.addRecent({
                role: 'tool',
                content: JSON.stringify({ error: warningMsg, alreadyInspected: true }),
              });
              continue;
            }
          }

          let toolMsg = `🔧 Using tool: ${parsedToolCall.name}`;
          if (parsedToolCall.name === 'read_file' && args.file_path) {
            toolMsg = `📂 Reading file: ${args.file_path}`;
          } else if (parsedToolCall.name === 'search_in_files' && args.keyword) {
            toolMsg = `🔎 Searching codebase for: "${args.keyword}"`;
          }
          console.log(`\n[AI Tool Execution] ${toolMsg}`);

          checkCancelled();
          let toolResult;
          try {
            if ('invoke' in tool && typeof (tool as any).invoke === 'function') {
              toolResult = await (tool as any).invoke(args);
            } else if ('handler' in tool && typeof (tool as any).handler === 'function') {
              toolResult = await (tool as any).handler(args);
            }
          } catch (err: any) {
            toolResult = { error: err.message };
            console.error(`\n[AI Tool Error] ${err.message}`);
          }

          console.log(
            `[AI Tool Result] Returned payload of ${Buffer.byteLength(JSON.stringify(toolResult) || '', 'utf8')} bytes\n`,
          );

          const estimatedToolTokens = contextManager.estimateTokens(toolResult);
          sourceTokensUsed += estimatedToolTokens;

          if (contextManager.needsCompaction(estimatedToolTokens, budget)) {
            await contextManager.compactWithLLM(progress);
          }

          contextManager.addRecent({
            role: 'tool',
            content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
          });

          if (
            parsedToolCall.name === 'read_file' &&
            toolResult &&
            !toolResult.error &&
            (typeof toolResult === 'string' || typeof toolResult.content === 'string')
          ) {
            const filePath = args.filePath || args.file_path;
            const contentToEmbed = typeof toolResult === 'string' ? toolResult : toolResult.content;

            contextManager.markFileInspected(filePath, 'General codebase exploration', []);

            try {
              embedAndSaveFact(contentToEmbed, filePath, {
                source: 'discovered_file',
                version: project.indexing_version,
              });
            } catch {
              // ignore
            }
          }
        }
      }
    } else {
      if (rawText.trim().length > 0) {
        contextManager.addRecent({
          role: 'assistant',
          content: researchResult.cacheableAssistantContent || rawText,
        });
        if (rawText.includes('<execute_tool>')) {
          contextManager.addRecent({
            role: 'user',
            content: `/no_think\nCRITICAL ERROR: You used <execute_tool>. This format is STRICTLY FORBIDDEN. You must output ONLY a JSON object to use a tool. Example: {"name": "read_file", "arguments": {"filePath": "src/index.ts"}}`,
          });
        } else {
          contextManager.addRecent({
            role: 'user',
            content: `/no_think\nYou outputted text instead of making a tool call. You MUST use a tool to continue investigating, or call the 'finish_research' tool if you are done.`,
          });
        }
      } else {
        // text is empty
      }
    }
  }

  // PHASE: SYNTHESIS

  contextManager.addRecent({
    role: 'user',
    content: `/no_think\nThe research phase is complete. Based on the Research Memory and State, output the final JSON manifest strictly following this schema:\n\`\`\`json\n${jsonSchema}\n\`\`\`\nProvide ONLY the JSON output.`,
  });

  const synthesisRun = completion({
    modelId: gemma4ModelId,
    history: contextManager.buildHistory(),
    stream: true,
    maxTokens: 16384,
    kvCache: project.id.toString(),
  });

  const synthesisResult = await awaitCompletion(synthesisRun);
  manifestResultContent = synthesisResult.contentText || '';

  let extractedFacts;
  try {
    extractedFacts = extractJson(manifestResultContent);
    extractedFacts.project_name = extractedFacts.project_name || project.name;
    extractedFacts.architecture_pattern = extractedFacts.architecture_pattern || 'Unknown';
    extractedFacts.core_modules = extractedFacts.core_modules || [];
    extractedFacts.key_conventions = extractedFacts.key_conventions || [];
    extractedFacts.tech_stack = extractedFacts.tech_stack || [];
    extractedFacts.application_type = extractedFacts.application_type || 'Unknown';
    extractedFacts.required_secrets = extractedFacts.required_secrets || [];
    extractedFacts.explanation = extractedFacts.explanation || '';
  } catch {
    extractedFacts = {
      project_name: project.name,
      architecture_pattern: 'Unknown (LLM Parse Error)',
      core_modules: [],
      key_conventions: [],
      tech_stack: [],
      application_type: 'Unknown',
      required_secrets: [],
      explanation: 'Failed to parse AI output.',
    };
  }

  return extractedFacts;
}
