import fs from 'fs';
import os from 'os';

import * as qvacModels from '@qvac/sdk';
import { getModelInfo, downloadAsset, unloadModel } from '@qvac/sdk';
import type { MainModule } from '../main.module.js';
import { QWEN_MODEL_ID, GTE_MODEL_ID } from '../../constants.js';

export interface QvacModelConfig {
  id: string;
  name: string;
  requiredRamGb: number;
}

export const QVAC_MODELS: QvacModelConfig[] = [
  { id: QWEN_MODEL_ID, name: 'Coding LLM (Qwen 3 4B)', requiredRamGb: 5 },
  { id: GTE_MODEL_ID, name: 'Embedding Model (GTE Large)', requiredRamGb: 2 },
];

export class QvacModule {
  mainModule: MainModule;

  constructor(mainModule?: MainModule) {
    if (mainModule) this.mainModule = mainModule;
  }

  async getAvailableModels() {
    const totalMemGb = os.totalmem() / 1024 / 1024 / 1024;

    const models = await Promise.all(
      QVAC_MODELS.map(async (model) => {
        let isCached = false;
        let expectedSize = 0;
        let actualSize = 0;
        let isLoaded = false;

        const qvacModelObject = (qvacModels as any)[model.id];
        if (!qvacModelObject) {
          console.warn(`Model object not found in SDK for ID: ${model.id}`);
          return {
            ...model,
            isCompatible: false,
            totalMemGb: 0,
            isCached,
            expectedSize,
            actualSize,
            isLoaded,
          };
        }

        try {
          const info = await getModelInfo(qvacModelObject);
          isCached = info.isCached;
          expectedSize = info.expectedSize;
          actualSize = info.actualSize || 0;
          isLoaded = info.isLoaded;
        } catch (e) {
          console.warn(`Could not get model info for ${model.id}:`, e);
        }

        const isCompatible = totalMemGb >= model.requiredRamGb;

        return {
          ...model,
          isCompatible,
          totalMemGb: Math.round(totalMemGb * 10) / 10,
          isCached,
          expectedSize,
          actualSize,
          isLoaded,
        };
      }),
    );

    return models;
  }

  async downloadModel(modelId: string, socketId: string) {
    try {
      if (this.mainModule?.socket) {
        this.mainModule.socket.emitModelProgress({
          id: socketId,
          modelId,
          status: 'starting',
          progress: 0,
          message: 'Starting download...',
        });
      }

      const qvacModelObject = (qvacModels as any)[modelId];
      if (!qvacModelObject) {
        throw new Error(`Model ${modelId} not found in qvac SDK exports`);
      }

      await downloadAsset({
        assetSrc: qvacModelObject,
        onProgress: (progress: any) => {
          if (this.mainModule?.socket) {
            this.mainModule.socket.emitModelProgress({
              id: socketId,
              modelId,
              status: 'downloading',
              progress:
                progress.percentage ||
                Math.round((progress.downloaded / progress.total) * 100) ||
                0,
              message: `Downloading: ${Math.round((progress.downloaded || 0) / 1024 / 1024)}MB / ${Math.round((progress.total || 0) / 1024 / 1024)}MB`,
            });
          }
        },
      });

      if (this.mainModule?.socket) {
        this.mainModule.socket.emitModelProgress({
          id: socketId,
          modelId,
          status: 'success',
          progress: 100,
          message: 'Download complete!',
        });
      }
    } catch (error: any) {
      if (this.mainModule?.socket) {
        this.mainModule.socket.emitModelProgress({
          id: socketId,
          modelId,
          status: 'error',
          progress: 0,
          message: 'Download failed: ' + error.message,
        });
      }
      throw error;
    }
  }

  async deleteModel(modelId: string) {
    try {
      const qvacModelObject = (qvacModels as any)[modelId];
      if (!qvacModelObject) {
        throw new Error(`Model ${modelId} not found in qvac SDK exports`);
      }

      const info = await getModelInfo(qvacModelObject);

      // Unload if it's currently loaded in memory
      if (info.isLoaded) {
        try {
          await unloadModel(qvacModelObject);
        } catch (e) {
          console.warn(`Failed to unload model ${modelId}:`, e);
        }
      }

      // Delete cache files from disk
      if (info.cacheFiles && info.cacheFiles.length > 0) {
        for (const file of info.cacheFiles) {
          if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      }

      return { success: true };
    } catch (error: any) {
      console.error(`Failed to delete model ${modelId}:`, error);
      throw new Error(`Failed to delete model: ${error.message}`);
    }
  }
}

export default QvacModule;
