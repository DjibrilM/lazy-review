import { Router, type Request, type Response } from 'express';
import { SettingsService } from '../services/settings.service.js';

export class SettingsController {
  public router: Router;

  constructor(private settingsService: SettingsService) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get('/', this.getSettings.bind(this));
    this.router.get('/hardware', this.getHardwareInfo.bind(this));
    this.router.get('/storage', this.getStorageInfo.bind(this));
    this.router.get('/models', this.getModelInfo.bind(this));
    this.router.put('/', this.updateSettings.bind(this));
  }

  private async getSettings(req: Request, res: Response) {
    try {
      const settings = await this.settingsService.getSettings();
      res.json({ success: true, data: settings });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  private async getHardwareInfo(req: Request, res: Response) {
    try {
      const hardwareInfo = await this.settingsService.getHardwareInfo();
      res.json({ success: true, data: hardwareInfo });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  private async getStorageInfo(req: Request, res: Response) {
    try {
      const storageInfo = await this.settingsService.getStorageInfo();
      res.json({ success: true, data: storageInfo });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  private async getModelInfo(req: Request, res: Response) {
    try {
      const modelInfo = await this.settingsService.getModelInfo();
      res.json({ success: true, data: modelInfo });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  private async updateSettings(req: Request, res: Response) {
    try {
      const { useExperimentalGpu } = req.body;
      const settings = await this.settingsService.updateSettings({ useExperimentalGpu });
      res.json({ success: true, data: settings });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
