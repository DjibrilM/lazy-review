import type { Express } from 'express';
import { MainModule } from '../../main.module.js';
import { ProjectServices } from '../services/project.services.js';
import { DeploymentPlanServices } from '../services/deployment-plan.services.js';

export default class ProjectRouts {
  app: Express;
  mainModule: MainModule;
  projectServices: ProjectServices;
  deploymentPlanServices: DeploymentPlanServices;

  constructor(app: Express, mainModule: MainModule) {
    this.app = app;
    this.mainModule = mainModule;
    this.projectServices = new ProjectServices(this.mainModule);
    this.deploymentPlanServices = new DeploymentPlanServices(this.mainModule);
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
  }
}
