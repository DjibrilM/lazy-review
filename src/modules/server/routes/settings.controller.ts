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
