import type { MainModule } from '../main.module.js';
import ProjectEntity from '../server/entities/project.entity.js';
import { parseDiff, createProjectManifestSummary } from './ai-agent.utils.js';
import { createGitTools } from './tools/git-tools.js';
import { createFsTools } from './tools/fs-tools.js';
import { PrReviewAgent } from './pr-review.agent.js';

const IDLE_SESSION_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export type ParsedDiffFile = { file: string; diff: string };

export interface PRReviewSession {
  projectId: string;
  pullNumber: number;
  prDiff: string;
  parsedDiffFiles: ParsedDiffFile[];
  changedFiles: string[];
  llmId: string;
  embeddingId: string;
  gitTools: ReturnType<typeof createGitTools>;
  fsTools: ReturnType<typeof createFsTools>;
  projectOverview: string;
  lastActivityAt: number;
}

export class PRReviewSessionManager {
  private sessions = new Map<string, PRReviewSession>();
  private cleanupInterval: ReturnType<typeof setInterval>;
  private modelAgent: PrReviewAgent;

  constructor(private mainModule: MainModule) {
    this.modelAgent = new PrReviewAgent(mainModule);
    this.cleanupInterval = setInterval(() => this.cleanupIdleSessions(), CLEANUP_INTERVAL_MS);
  }

  private sessionKey(projectId: string, pullNumber: number): string {
    return `${projectId}:${pullNumber}`;
  }

  async startSession(
    projectId: string,
    pullNumber: number,
    prDiff: string,
    onProgress?: (message: string) => void,
  ): Promise<PRReviewSession> {
    const key = this.sessionKey(projectId, pullNumber);
    const existing = this.sessions.get(key);

    if (existing) {
      existing.lastActivityAt = Date.now();
      existing.prDiff = prDiff;
      existing.parsedDiffFiles = prDiff ? parseDiff(prDiff) : [];
      existing.changedFiles = existing.parsedDiffFiles.map((file) => file.file);
      onProgress?.('Reusing active session…');
      this.emitProgress(projectId, pullNumber, 'Reusing active session…');
      return existing;
    }

    const progress = (message: string) => {
      onProgress?.(message);
      this.emitProgress(projectId, pullNumber, message);
    };

    progress('Loading AI models…');

    const { llmId, embeddingId } = await this.modelAgent.loadModelsWithIds();

    progress('Parsing pull request diff…');
    const parsedDiffFiles = prDiff ? parseDiff(prDiff) : [];
    const changedFiles = parsedDiffFiles.map((file) => file.file);

    progress('Loading project metadata…');
    const project = await ProjectEntity.findOneBy({ id: projectId });
    if (!project) {
      throw new Error(`Project ${projectId} not found.`);
    }
    if (!project.repository_path) {
      throw new Error(`Project repository path not set.`);
    }

    progress('Initializing repository tools…');
    const gitTools = createGitTools(project.repository_path);
    const fsTools = createFsTools(project.repository_path);

    progress('Loading codebase facts…');
    const projectOverview = project.analysis
      ? createProjectManifestSummary(project.analysis)
      : 'No project overview available.';

    const session: PRReviewSession = {
      projectId,
      pullNumber,
      prDiff,
      parsedDiffFiles,
      changedFiles,
      llmId,
      embeddingId,
      gitTools,
      fsTools,
      projectOverview,
      lastActivityAt: Date.now(),
    };

    this.sessions.set(key, session);
    progress('Session ready.');
    return session;
  }

  getSession(projectId: string, pullNumber: number): PRReviewSession | undefined {
    const session = this.sessions.get(this.sessionKey(projectId, pullNumber));
    if (session) {
      session.lastActivityAt = Date.now();
    }
    return session;
  }

  stopSession(projectId: string, pullNumber: number): boolean {
    return this.sessions.delete(this.sessionKey(projectId, pullNumber));
  }

  hasSession(projectId: string, pullNumber: number): boolean {
    return this.sessions.has(this.sessionKey(projectId, pullNumber));
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.sessions.clear();
  }

  private emitProgress(projectId: string, pullNumber: number, message: string): void {
    if (this.mainModule.socket) {
      this.mainModule.socket.emitModelProgress({ projectId, pullNumber, message });
    }
  }

  private cleanupIdleSessions(): void {
    const now = Date.now();

    for (const [key, session] of this.sessions.entries()) {
      if (now - session.lastActivityAt > IDLE_SESSION_MS) {
        this.sessions.delete(key);
        console.log(
          `[PRReviewSessionManager] Cleaned up idle session for ${session.projectId} PR #${session.pullNumber}`,
        );
      }
    }
  }
}
