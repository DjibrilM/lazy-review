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

    this.app.delete('/projects/:id', (req, res) => {
      return this.projectServices.deleteProject(req, res);
    });

    this.app.post('/projects/:id/reindex', (req, res) => {
      return this.projectServices.reindexProject(req, res);
    });

    this.app.delete('/projects/:id/indexing', (req, res) => {
      return this.projectServices.cancelIndexing(req, res);
    });

    this.app.get('/projects/:id/review/:pull_number', (req, res) => {
      return this.projectServices.getReview(req, res);
    });

    this.app.delete('/projects/:id/review/:pull_number', (req, res) => {
      return this.projectServices.deleteReview(req, res);
    });

    this.app.post('/projects/:id/review/models/load', (req, res) => {
      return this.projectServices.loadModels(req, res);
    });

    this.app.post('/projects/:id/review/models/unload', (req, res) => {
      return this.projectServices.unloadModels(req, res);
    });

    this.app.post('/projects/:id/review/:pull_number/session/start', (req, res) => {
      return this.projectServices.startPRSession(req, res);
    });

    this.app.post('/projects/:id/review/:pull_number/session/stop', (req, res) => {
      return this.projectServices.stopPRSession(req, res);
    });

    // AI-powered PR review generation
    this.app.post('/projects/:id/review', (req, res) => {
      return this.projectServices.generateReview(req, res);
    });

    // Single-turn AI chat with project context
    this.app.post('/projects/:id/chat', async (req: any, res: any) => {
      const { id } = req.params;
      const {
        history,
        message,
        prDiff,
        owner,
        repo,
        pull_number,
        creator,
        additions,
        deletions,
        changed_files,
        socketId,
      } = req.body;

      try {
        const stream = await this.mainModule.aiAgent.chatAgent.chatStream(
          id,
          history || [],
          message,
          prDiff,
          { owner, repo, pull_number, creator, additions, deletions, changed_files },
          socketId,
        );

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        for await (const chunk of stream) {
          res.write(chunk);
        }
        res.end();
      } catch (error: any) {
        console.error('Chat failed:', error);
        if (!res.headersSent) {
          return res.status(500).json({ error: error.message });
        } else {
          res.end();
        }
      }
    });
  }
}