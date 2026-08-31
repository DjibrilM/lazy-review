import { DataSource, Repository } from 'typeorm';
import si from 'systeminformation';
import os from 'os';
import fs from 'fs';
import SettingsEntity from '../entities/settings.entity.js';
import type { MainModule } from '../../main.module.js';
import { LLM_MODEL_ID, EMBEDDING_MODEL_ID } from '../../../constants.js';
import { getDatabasePath } from '../../storage-paths.js';

export class SettingsService {
  private repository: Repository<SettingsEntity>;

  constructor(
    private dataSource: DataSource,
    private mainModule?: MainModule,
  ) {
    this.repository = this.dataSource.getRepository(SettingsEntity);
  }

  async getSettings(): Promise<SettingsEntity> {
    let settings = await this.repository.findOneBy({ id: 1 });
    if (!settings) {
      settings = this.repository.create({ id: 1, useExperimentalGpu: false });
      await this.repository.save(settings);
    }
    return settings;
  }

  async getHardwareInfo() {
    const totalRamGb = Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10;
    const availableRamGb = Math.round((os.freemem() / 1024 / 1024 / 1024) * 10) / 10;
    const cpuCores = os.cpus().length;

    const graphics = await si.graphics();

    let gpuRamGb = 0;
    if (graphics.controllers && graphics.controllers.length > 0) {
      // Get the total dedicated VRAM from all GPUs
      gpuRamGb =
        Math.round(
          (graphics.controllers.reduce((total, gpu) => total + (gpu.vram || 0), 0) /
            1024 /
            1024 /
            1024) *
            10,
        ) / 10;
    }

    return {
      cpuCores,
      totalRamGb,
      availableRamGb,
      gpuRamGb,
    };
  }

  async getModelInfo() {
    const qvacModule = this.mainModule?.qvac;
    if (qvacModule) {
      const models = await qvacModule.getAvailableModels();
      const llmModel = models.find((m) => m.id === LLM_MODEL_ID);
      const embeddingModel = models.find((m) => m.id === EMBEDDING_MODEL_ID);

      const llmSize = llmModel?.actualSize || 0;
      const embeddingSize = embeddingModel?.actualSize || 0;
      const totalModelSize = llmSize + embeddingSize;

      return {
        llmModel: llmModel
          ? {
              id: llmModel.id,
              name: llmModel.name,
              requiredRamGb: llmModel.requiredRamGb,
              expectedSize: llmModel.expectedSize,
              actualSize: llmModel.actualSize,
              isLoaded: llmModel.isLoaded,
              isCompatible: llmModel.isCompatible,
            }
          : null,
        embeddingModel: embeddingModel
          ? {
              id: embeddingModel.id,
              name: embeddingModel.name,
              requiredRamGb: embeddingModel.requiredRamGb,
              expectedSize: embeddingModel.expectedSize,
              actualSize: embeddingModel.actualSize,
              isLoaded: embeddingModel.isLoaded,
              isCompatible: embeddingModel.isCompatible,
            }
          : null,
        totalModelSize,
        models,
      };
    }
    return {
      llmModel: null,
      embeddingModel: null,
      totalModelSize: 0,
      models: [],
    };
  }

  async getStorageInfo() {
    const settings = await this.getSettings();
    const modelInfo = await this.getModelInfo();

    const totalModelSize = modelInfo.totalModelSize || 0;

    // Calculate SQLite database size
    let sqliteDbSize = 0;
    try {
      const dbPath = getDatabasePath();
      if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        sqliteDbSize = stats.size;
      }
    } catch (e) {
      console.warn('Could not get SQLite database size:', e);
    }

    // Application storage = embedding model + LLM + SQLite database
    const applicationStorageBytes = totalModelSize + sqliteDbSize;

    return {
      storageUsedGb: settings.storageUsedGb,
      storageTotalGb: settings.storageTotalGb,
      contextSizeLimit: settings.contextSizeLimit,
      totalModelSize,
      sqliteDbSize,
      applicationStorageBytes,
    };
  }

  async updateSettings(data: { useExperimentalGpu?: boolean }): Promise<SettingsEntity> {
    const settings = await this.getSettings();
    if (data.useExperimentalGpu !== undefined) {
      settings.useExperimentalGpu = data.useExperimentalGpu;
    }
    return await this.repository.save(settings);
  }
}
