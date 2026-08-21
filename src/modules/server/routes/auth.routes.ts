import { Router } from 'express';
import { AuthService } from '../services/auth.services.js';
import { DataSource } from 'typeorm';
import type { MainModule } from '../../main.module.js';

export class AuthRoutes {
  router: Router = Router();
  authService: AuthService;

  constructor(
    private dataSource: DataSource,
    private mainModule?: MainModule,
  ) {
    this.authService = new AuthService(this.dataSource, this.mainModule);
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.post('/device', async (req, res) => {
      try {
        const result = await this.authService.startDeviceFlow();
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.router.post('/device/poll', async (req, res) => {
      try {
        const { device_code } = req.body;
        if (!device_code) {
          res.status(400).json({ error: 'device_code is required' });
          return;
        }

        const result = await this.authService.pollForToken(device_code);
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.router.get('/status', async (req, res) => {
      try {
        const status = await this.authService.getStatus();
        res.json(status);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.router.post('/logout', async (req, res) => {
      try {
        const result = await this.authService.logout();
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  }
}
