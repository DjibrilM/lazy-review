import { type Request, type Response } from 'express';
import GithubModule from '../../github/github.module.js';

class GithubServices {
  githubModule: GithubModule;

  constructor() {
    this.githubModule = new GithubModule();
  }

  async getUserRepositories({ page = 1 }: { page?: number }) {
    return this.githubModule.listRepositories({ page });
  }

  async cloneRepository(req: Request, res: Response) {
    try {
      const { repository_name, repository_url } = req.body;
      if (!repository_name || !repository_url) {
        return res.status(400).json({ error: 'repository_name and repository_url are required' });
      }
      const data = await this.githubModule.cloneRepository({ repository_name, repository_url });
      return res.json(data);
    } catch (error: any) {
      console.error('Error cloning repository:', error);
      return res.status(500).json({ error: error.message || 'Failed to clone repository' });
    }
  }

  async searchRepository({ query, page = 1 }: { query: string; page?: number }) {
    return this.githubModule.searchRepository({ query, page });
  }

  async getUserByUser() {
    return this.githubModule.getUserByUser();
  }

  async getPullRequests({ owner, repo }: { owner: string; repo: string }) {
    return this.githubModule.getPullRequests({ owner, repo });
  }

  async handleOperation(req: Request, res: Response) {}
}

export default GithubServices;
