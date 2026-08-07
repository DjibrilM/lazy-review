import type { MainModule } from '../main.module.js';
import { AiAgentService } from './ai-agent.service.js';
import { ReviewService } from './review.service.js';

export class AiAgentModule {
  mainModule: MainModule;
  service: AiAgentService;
  review: ReviewService;

  constructor(mainModule: MainModule) {
    this.mainModule = mainModule;
    this.service = new AiAgentService(mainModule);
    this.review = new ReviewService(mainModule);
  }

  /** Cancel an in-progress indexing run. Returns false if none is running. */
  cancelIndexing(projectId: string): boolean {
    return this.service.cancelIndexing(projectId);
  }
}

export default AiAgentModule;
