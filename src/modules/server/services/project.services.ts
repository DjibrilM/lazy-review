import { MainModule } from '../../main.module.js';
import { type Request, type Response } from 'express';
import ProjectEntity from '../entities/project.entity.js';

export class ProjectServices {
  mainModule: MainModule;
  readonly projectEntity = ProjectEntity;

  constructor(mainModule: MainModule) {
    this.mainModule = mainModule;
  }

  async createProject(req: Request, res: Response) {
    try {
      const { repository_name, repository_url, owner } = req.body;

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

      return res.json({
        message: 'Project created successfully',
        data: {
          project_id: project.id,
          ...repositoryPath,
        },
      });
    } catch (error: any) {
      console.error('Failed to create project:', error);
      return res.status(500).json({ message: 'Failed to create project', error: error.message || error });
    }
  }

  async getProjects(req: Request, res: Response) {
    try {
      const projects = await this.projectEntity.find({ order: { updated_at: 'DESC' } });
      return res.json({ data: projects });
    } catch (error: any) {
      console.error('Failed to fetch projects:', error);
      return res.status(500).json({ message: 'Failed to fetch projects', error: error.message || error });
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
      return res.status(500).json({ message: 'Failed to fetch project', error: error.message || error });
    }
  }
}
