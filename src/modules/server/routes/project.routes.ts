import type { Express } from 'express';
import { MainModule } from '../../main.module.js';
import { ProjectServices } from '../services/project.services.js';

export default class ProjectRouts {
  app: Express;
  mainModule: MainModule;
  projectServices: ProjectServices;

  constructor(app: Express, mainModule: MainModule) {
    this.app = app;
    this.mainModule = mainModule;
    this.projectServices = new ProjectServices(this.mainModule);
  }

  init() {
    this.app.post('/projects', (req, res) => {
      return this.projectServices.createProject(req, res);
    });

    this.app.get('/projects', (req, res) => {
      return this.projectServices.getProjects(req, res);
    });

    this.app.get('/projects/:id', (req, res) => {
      return this.projectServices.getProjectById(req, res);
    });

    this.app.post('/projects/:id/reindex', (req, res) => {
      return this.projectServices.reindexProject(req, res);
    });

    this.app.delete('/projects/:id/indexing', (req, res) => {
      return this.projectServices.cancelIndexing(req, res);
    });

    // AI-powered PR review generation
    this.app.post('/projects/:id/review', async (req: any, res: any) => {
      try {
        const projectId = req.params.id as string;
        const { prDiff, prTitle, prBody } = req.body;
        if (!prDiff) return res.status(400).json({ error: 'prDiff is required' });

        // Fire off in background so socket events stream to client
        this.mainModule.aiAgent.review
          .generatePRReview(projectId, prDiff, prTitle || 'Untitled PR', prBody || '')
          .then((review) => res.json({ data: review }))
          .catch((err: any) => {
            console.error('Review generation failed:', err);
            if (!res.headersSent) res.status(500).json({ error: err.message });
          });
      } catch (error: any) {
        console.error('Failed to start review:', error);
        return res.status(500).json({ error: error.message });
      }
    });

    // Single-turn AI chat with project context
    this.app.post('/projects/:id/chat', async (req: any, res: any) => {
      try {
        const projectId = req.params.id as string;
        const { history, message, prDiff } = req.body;
        if (!message) return res.status(400).json({ error: 'message is required' });

        const reply = await this.mainModule.aiAgent.review.chat(
          projectId,
          history || [],
          message,
          prDiff,
        );
        return res.json({ data: { reply } });
      } catch (error: any) {
        console.error('Chat failed:', error);
        return res.status(500).json({ error: error.message });
      }
    });
  }
}

