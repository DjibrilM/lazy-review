import { MainModule } from '../../main.module.js';
import { type Request, type Response } from 'express';
import ProjectEntity from '../entities/project.entity.js';

/**
 * A project is review-ready once it has completed at least one indexing pass.
 *
 * `indexing_version` is only incremented by the indexer AFTER a full index has
 * been built, so a value > 0 combined with a non-empty `analysis` manifest is
 * the source of truth (a freshly-created project starts at 0).
 */
export function hasCompletedIndex(project: Pick<ProjectEntity, 'analysis' | 'indexing_version'>): boolean {
  return Boolean(project?.analysis) && (project.indexing_version || 0) > 0;
}

export class ProjectServices {
  mainModule: MainModule;
  readonly projectEntity = ProjectEntity;

  constructor(mainModule: MainModule) {
    this.mainModule = mainModule;
  }

  /**
   * Guards the review endpoints. Returns `null` when the project can be
   * reviewed, or a structured 409 response explaining why it cannot:
   *
   *   - code INDEX_REQUIRED + isIndexing=true  → wait for the running index
   *   - code INDEX_REQUIRED + isIndexing=false → no index exists yet; create one
   *
   * The structured body lets the frontend react dynamically (unlock the review
   * buttons as soon as the index completes) instead of just surfacing a string.
   */
  private resolveReviewAccess(
    project: ProjectEntity,
  ): { status: number; body: Record<string, unknown> } | null {
    if (hasCompletedIndex(project)) {
      return null;
    }

    const isIndexing = project.current_task === 'indexing';

    return {
      status: 409,
      body: {
        error: isIndexing
          ? 'This repository is still being indexed. Please wait for indexing to finish before accessing the review.'
          : 'This repository has not been indexed yet. Please run an initial index before accessing the review.',
        code: 'INDEX_REQUIRED',
        isIndexing,
        isIndexed: false,
        indexingVersion: project.indexing_version || 0,
      },
    };
  }

  async createProject(req: Request, res: Response) {
    try {
      const { repository_name, repository_url } = req.body;

      if (!repository_name || !repository_url) {
        return res.status(400).json({ error: 'repository_name and repository_url are required' });
      }

      // Clone the repository
      const repositoryPath = await this.mainModule.github.cloneRepository({
        repository_name,
        repository_url,
      });

      // Save project to SQLite DB
      const project = new this.projectEntity();
      project.name = repository_name;
      project.repository_url = repository_url;
      project.repository_path = repositoryPath.repository_path;
      project.repositorySecrets = {};
      project.created_at = new Date();
      project.updated_at = new Date();
      await project.save();

      // Trigger background indexing
      this.mainModule.aiAgent.service.analyzeAndIndexProject(project.id).catch((error) => {
        console.error('Background indexing failed:', error);
      });

      return res.json({
        message: 'Project created successfully',
        data: {
          project_id: project.id,
          ...repositoryPath,
        },
      });
    } catch (error: any) {
      console.error('Failed to create project:', error);
      return res
        .status(500)
        .json({ message: 'Failed to create project', error: error.message || error });
    }
  }

  async getProjects(req: Request, res: Response) {
    try {
      const projects = await this.projectEntity.find({ order: { updated_at: 'DESC' } });
      return res.json({ data: projects });
    } catch (error: any) {
      console.error('Failed to fetch projects:', error);
      return res
        .status(500)
        .json({ message: 'Failed to fetch projects', error: error.message || error });
    }
  }

  async getProjectById(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const project = await this.projectEntity.findOne({ where: { id } });
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }
      return res.json({ data: project });
    } catch (error: any) {
      console.error('Failed to fetch project:', error);
      return res
        .status(500)
        .json({ message: 'Failed to fetch project', error: error.message || error });
    }
  }

  async reindexProject(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const project = await this.projectEntity.findOne({ where: { id } });

      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }

      // Trigger background indexing
      this.mainModule.aiAgent.service.analyzeAndIndexProject(project.id).catch((error) => {
        console.error('Background re-indexing failed:', error);
      });

      return res.json({ message: 'Re-indexing started successfully' });
    } catch (error: any) {
      console.error('Failed to start re-indexing:', error);
      return res
        .status(500)
        .json({ message: 'Failed to start re-indexing', error: error.message || error });
    }
  }

  async cancelIndexing(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const wasCancelled = this.mainModule.aiAgent.cancelIndexing(id);

      // Resilient fallback: Force reset database state just in case it is stuck in sqlite
      const project = await ProjectEntity.findOne({ where: { id } });
      let dbUnlocked = false;
      if (project && project.current_task === 'indexing') {
        project.current_task = null;
        await project.save();
        dbUnlocked = true;
      }

      if (!wasCancelled) {
        if (dbUnlocked) {
          return res.json({ message: 'Indexing state force-reset and unlocked successfully' });
        }
        return res.status(404).json({ message: 'No active indexing found for this project' });
      }
      return res.json({ message: 'Indexing cancelled successfully' });
    } catch (error: any) {
      console.error('Failed to cancel indexing:', error);
      return res
        .status(500)
        .json({ message: 'Failed to cancel indexing', error: error.message || error });
    }
  }

  async loadModels(req: Request, res: Response) {
    try {
      await this.mainModule.aiAgent.prReviewAgent.loadModels();
      return res.status(200).json({ message: 'Model loaded successfully' });
    } catch (err: any) {
      console.error('Failed to load models:', err);
      return res.status(500).json({ error: 'Failed to load models' });
    }
  }

  async unloadModels(req: Request, res: Response) {
    try {
      await this.mainModule.aiAgent.prReviewAgent.unloadModels();
      return res.json({ message: 'Models unloaded successfully' });
    } catch (error: any) {
      console.error('Failed to unload models:', error);
      return res.status(500).json({ error: error.message || 'Failed to unload models' });
    }
  }

  async startPRSession(req: Request, res: Response) {
    try {
      const projectId = req.params.id as string;
      const pullNumber = Number(req.params.pull_number);
      const { prDiff } = req.body;

      if (!prDiff) {
        return res.status(400).json({ error: 'prDiff is required' });
      }

      if (!Number.isFinite(pullNumber)) {
        return res.status(400).json({ error: 'pull_number must be a valid number' });
      }

      const project = await ProjectEntity.findOne({ where: { id: projectId } });
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }

      // Require the project to have been indexed at least once before starting
      // a review session. Fails with a structured 409 when the index is missing
      // or still building so the UI can react dynamically.
      const access = this.resolveReviewAccess(project);
      if (access) {
        return res.status(access.status).json(access.body);
      }

      await this.mainModule.aiAgent.sessionManager.startSession(
        projectId,
        pullNumber,
        prDiff,
        (message) => {
          if (this.mainModule.socket) {
            this.mainModule.socket.emitModelProgress({ projectId, pullNumber, message });
          }
        },
      );

      return res.status(200).json({ message: 'PR review session started successfully' });
    } catch (error: any) {
      console.error('Failed to start PR session:', error);
      return res.status(500).json({ error: error.message || 'Failed to start PR session' });
    }
  }

  async stopPRSession(req: Request, res: Response) {
    try {
      const projectId = req.params.id as string;
      const pullNumber = Number(req.params.pull_number);

      if (!Number.isFinite(pullNumber)) {
        return res.status(400).json({ error: 'pull_number must be a valid number' });
      }

      const stopped = this.mainModule.aiAgent.sessionManager.stopSession(projectId, pullNumber);

      if (stopped) {
        // Models are intentionally kept loaded in memory after a session ends to
        // avoid a massive delay when opening the next PR review screen.
      }

      return res.json({
        message: stopped ? 'PR review session stopped successfully' : 'No active session found',
      });
    } catch (error: any) {
      console.error('Failed to stop PR session:', error);
      return res.status(500).json({ error: error.message || 'Failed to stop PR session' });
    }
  }

  async getReview(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const pull_number = req.params.pull_number as string;
      const project = await ProjectEntity.findOne({ where: { id } });
      if (!project) return res.status(404).json({ message: 'Project not found' });

      const prReviews = project.pr_reviews || {};
      const reviewState = prReviews[pull_number] || { status: 'idle' };

      return res.json({ data: reviewState });
    } catch (error: any) {
      console.error('Failed to fetch review:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch review' });
    }
  }

  async deleteReview(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const pull_number = req.params.pull_number as string;
      const project = await ProjectEntity.findOne({ where: { id } });
      if (!project) return res.status(404).json({ message: 'Project not found' });

      const prReviews = { ...(project.pr_reviews || {}) };
      if (prReviews[pull_number]) {
        delete prReviews[pull_number];
        project.pr_reviews = prReviews;
        await project.save();
      }

      return res.json({ message: 'Review session deleted successfully' });
    } catch (error: any) {
      console.error('Failed to delete review session:', error);
      return res.status(500).json({ error: error.message || 'Failed to delete review session' });
    }
  }

  async generateReview(req: Request, res: Response) {
    try {
      const projectId = req.params.id as string;
      const { prDiff, prTitle, prBody, prNumber } = req.body;

      if (!prDiff) return res.status(400).json({ error: 'prDiff is required' });
      if (!prNumber) return res.status(400).json({ error: 'prNumber is required' });

      const project = await ProjectEntity.findOne({ where: { id: projectId } });
      if (!project) return res.status(404).json({ message: 'Project not found' });

      // Same dynamic index gate as startPRSession: no completed index → 409
      // with a structured body telling the UI whether to wait or to index first.
      const access = this.resolveReviewAccess(project);
      if (access) {
        return res.status(access.status).json(access.body);
      }

      // Initialize state to running
      const prReviews = { ...(project.pr_reviews || {}) };
      prReviews[prNumber] = { status: 'running' };
      project.pr_reviews = prReviews;
      await project.save();

      console.log('PR Review Details : ', { projectId, prTitle, prBody, prNumber });

      // Fire off in background
      this.mainModule.aiAgent.prReviewAgent
        .generatePRReview(
          projectId,
          prDiff,
          prTitle || 'Untitled PR',
          prBody || '',
          Number(prNumber),
        )
        .then(async (review) => {
          // Re-fetch project to avoid race conditions with other updates
          const p = await ProjectEntity.findOne({ where: { id: projectId } });
          if (p) {
            const currentReviews = { ...(p.pr_reviews || {}) };
            currentReviews[prNumber] = { status: 'success', review };
            p.pr_reviews = currentReviews;
            await p.save();
          }
          if (this.mainModule.socket) {
            this.mainModule.socket.emitReviewProgress({
              projectId,
              status: 'success',
              review,
            });
          }
        })
        .catch(async (err: any) => {
          console.error('Review generation failed:', err);
          const p = await ProjectEntity.findOne({ where: { id: projectId } });
          if (p) {
            const currentReviews = { ...(p.pr_reviews || {}) };
            currentReviews[prNumber] = { status: 'error', message: err.message };
            p.pr_reviews = currentReviews;
            await p.save();
          }
          if (this.mainModule.socket) {
            this.mainModule.socket.emitReviewProgress({
              projectId,
              status: 'error',
              message: err.message,
            });
          }
        });

      return res.status(202).json({ message: 'Review generation started' });
    } catch (error: any) {
      console.error('Failed to start review:', error);
      return res.status(500).json({ error: error.message || 'Failed to start review' });
    }
  }
  async deleteProject(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      if (!id) return res.status(400).json({ error: 'Project ID is required' });

      const project = await ProjectEntity.findOne({ where: { id } });
      if (!project) return res.status(404).json({ message: 'Project not found' });

      // Delete vector facts
      this.mainModule.database.vectorDatabase.deleteProjectFacts(id);

      // Finally delete the project itself
      await ProjectEntity.delete({ id });

      return res.status(200).json({ message: 'Project successfully deleted' });
    } catch (error: any) {
      console.error('Failed to delete project:', error);
      return res.status(500).json({ error: error.message || 'Failed to delete project' });
    }
  }
}
