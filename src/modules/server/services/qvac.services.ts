import type { Request, Response } from 'express';
import { MainModule } from '../../main.module.js';

export class QvacServices {
  mainModule: MainModule;

  constructor(mainModule: MainModule) {
    this.mainModule = mainModule;
  }

  async getAvailableModels(req: Request, res: Response) {
    try {
      if (!this.mainModule.qvac) {
        return res.status(500).json({ error: 'Qvac module not initialized' });
      }
      const models = await this.mainModule.qvac.getAvailableModels();
      return res.status(200).json({ data: models });
    } catch (error: any) {
      console.error('Error fetching QVAC models:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  async downloadModel(req: Request, res: Response) {
    try {
      const { modelId, socketId } = req.body;
      if (!modelId) {
        return res.status(400).json({ error: 'modelId is required' });
      }
      if (!this.mainModule.qvac) {
        return res.status(500).json({ error: 'Qvac module not initialized' });
      }

      // We do not await this so it runs in background and streams via socket
      this.mainModule.qvac.downloadModel(modelId, socketId).catch((error) => {
        console.error(`Error downloading model ${modelId}:`, error);
      });

      return res.status(202).json({ message: 'Download started' });
    } catch (error: any) {
      console.error('Error starting model download:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  async deleteModel(req: Request, res: Response) {
    try {
      const { id: modelId } = req.params;
      if (!modelId) {
        return res.status(400).json({ error: 'modelId is required' });
      }
      if (!this.mainModule.qvac) {
        return res.status(500).json({ error: 'Qvac module not initialized' });
      }

      await this.mainModule.qvac.deleteModel(modelId as string);
      return res.status(200).json({ message: 'Model deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting model:', error);
      return res.status(500).json({ error: error.message });
    }
  }
}
