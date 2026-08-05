import type { Express } from 'express';
import { MainModule } from '../../main.module.js';
import { QvacServices } from '../services/qvac.services.js';

export default class QvacRoutes {
  app: Express;
  mainModule: MainModule;
  qvacServices: QvacServices;

  constructor(app: Express, mainModule: MainModule) {
    this.app = app;
    this.mainModule = mainModule;
    this.qvacServices = new QvacServices(this.mainModule);
  }

  init() {
    this.app.get('/qvac/models', (req, res) => {
      return this.qvacServices.getAvailableModels(req, res);
    });

    this.app.post('/qvac/models/download', (req, res) => {
      return this.qvacServices.downloadModel(req, res);
    });

    this.app.delete('/qvac/models/:id', (req, res) => {
      return this.qvacServices.deleteModel(req, res);
    });
  }
}
