import type { MainModule } from '../main.module.js';
import { CodeBaseIndexerAgent } from './code-base-indexer.agent.js';
import { PrReviewAgent } from './pr-review.agent.js';
import { ChatAgent } from './chat.agent.js';
import { PRReviewSessionManager } from './pr-review-session.manager.js';

export class AiAgentModule {
  mainModule: MainModule;
  service: CodeBaseIndexerAgent;
  prReviewAgent: PrReviewAgent;
  chatAgent: ChatAgent;
  sessionManager: PRReviewSessionManager;

  constructor(mainModule: MainModule) {
    this.mainModule = mainModule;
    this.service = new CodeBaseIndexerAgent(mainModule);
    this.prReviewAgent = new PrReviewAgent(mainModule);
    this.chatAgent = new ChatAgent(mainModule);
    this.sessionManager = new PRReviewSessionManager(mainModule);
  }

  /** Cancel an in-progress indexing run. Returns false if none is running. */
  cancelIndexing(projectId: string): boolean {
    return this.service.cancelIndexing(projectId);
  }
}

export default AiAgentModule;
