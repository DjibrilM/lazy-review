import type { Express } from 'express';
import ProjectRouts from './project.routes.js';
import GithubRoutes from './github.routes.js';
import QvacRoutes from './qvac.routes.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from '../services/settings.service.js';
import { MainModule } from '../../main.module.js';

class Routes {
  app: Express;
  projectRouts: ProjectRouts;
  githubRoutes: GithubRoutes;
  qvacRoutes: QvacRoutes;
  settingsController: SettingsController;
  mainModule: MainModule;

  constructor(app: Express, mainModule: MainModule) {
    this.app = app;
    this.mainModule = mainModule;
    this.projectRouts = new ProjectRouts(this.app, this.mainModule);
    this.githubRoutes = new GithubRoutes(this.app, this.mainModule);
    this.qvacRoutes = new QvacRoutes(this.app, this.mainModule);

    const settingsService = new SettingsService(this.mainModule.database.appDataSource);
    this.settingsController = new SettingsController(settingsService);
  }

  init() {
    this.projectRouts.init();
    this.githubRoutes.init();
    this.qvacRoutes.init();

    this.app.use('/settings', this.settingsController.router);
  }
}

export default Routes;
