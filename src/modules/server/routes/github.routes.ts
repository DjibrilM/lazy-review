import type { Express } from 'express';
import { type Request, type Response } from 'express';
import GithubServices from '../services/github.services.js';
import { ProjectServices } from '../services/project.services.js';
import type { MainModule } from '../../main.module.js';

class GithubRoutes {
  app: Express;
  githubServices: GithubServices;
  projectServices: ProjectServices;
  mainModule: MainModule;

  constructor(app: Express, mainModule: MainModule) {
    this.mainModule = mainModule;
    this.githubServices = new GithubServices();
    this.projectServices = new ProjectServices(mainModule);
    this.app = app;
  }

  init() {
    this.app.post('/github/operation', (req: Request, res: Response) => {
      return this.githubServices.handleOperation(req, res);
    });

    this.app.post('/github/clone', (req: Request, res: Response) => {
      return this.githubServices.cloneRepository(req, res);
    });

    this.app.get('/github/repositories', async (req: Request, res: Response) => {
      try {
        const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
        const data = await this.githubServices.getUserRepositories({ page });
        return res.json(data);
      } catch (error) {
        console.error('Error fetching repositories:', error);
        return res.status(500).json({ error: 'Failed to fetch repositories' });
      }
    });

    this.app.get('/github/search', async (req: Request, res: Response) => {
      try {
        const query = req.query.q as string;
        const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
        if (!query) {
          return res.status(400).json({ error: 'Query parameter "q" is required' });
        }
        const data = await this.githubServices.searchRepository({ query, page });
        return res.json(data);
      } catch (error) {
        console.error('Error searching repositories:', error);
        return res.status(500).json({ error: 'Failed to search repositories' });
      }
    });

    this.app.get('/github/users/:username', async (req: Request, res: Response) => {
      try {
        const data = await this.githubServices.getUserByUser();
        return res.json(data);
      } catch (error) {
        console.error('Error fetching user:', error);
        return res.status(500).json({ error: 'Failed to fetch user' });
      }
    });

    this.app.get('/github/repos/:owner/:repo/pulls', async (req: Request, res: Response) => {
      try {
        const owner = req.params.owner as string;
        const repo = req.params.repo as string;
        const data = await this.githubServices.getPullRequests({ owner, repo });
        return res.json(data);
      } catch (error) {
        console.error('Error fetching pull requests:', error);
        return res.status(500).json({ error: 'Failed to fetch pull requests' });
      }
    });
  }
}

export default GithubRoutes;
