import { z } from 'zod';

export type ToolEffect = 'read' | 'write' | 'destructive';

export interface ConfirmationPreview {
  title: string;
  description?: string;
  request?: {
    method: string;
    endpoint?: string;
    payload: unknown;
  };
}

export interface AgentConfirmationRequest {
  sessionId: string;
  toolCallId: string;
  action: {
    type: string;
    title: string;
    description?: string;
  };
  tool: {
    name: string;
    arguments: Record<string, unknown>;
  };
  target?: {
    provider: 'github';
    owner: string;
    repo: string;
    pullNumber?: number;
  };
  request?: {
    method: string;
    endpoint?: string;
    payload: unknown;
  };
  conversation?: {
    messages: Array<{ role: string; content: string }>;
  };
}

export type GitHubMeta = {
  owner: string;
  repo: string;
  pull_number: number;
  creator?: string;
  additions?: number;
  deletions?: number;
  changed_files?: number;
};

export interface ToolContext {
  githubMeta?: GitHubMeta;
  projectId: string;
  socketId?: string;
  sessionId: string;
  conversation?: Array<{ role: string; content: string }>;
}

export interface RuntimeTool {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
  effect?: ToolEffect;
  confirmation?: {
    required: boolean;
    buildPreview?: (args: Record<string, unknown>, context: ToolContext) => ConfirmationPreview;
  };
  handler?: (args: any, context: ToolContext) => Promise<any> | any;
}
