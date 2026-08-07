import { DataSource, Repository } from 'typeorm';
import SettingsEntity from '../entities/settings.entity.js';

export class SettingsService {
  private repository: Repository<SettingsEntity>;

  constructor(private dataSource: DataSource) {
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

  async updateSettings(data: { useExperimentalGpu?: boolean }): Promise<SettingsEntity> {
    const settings = await this.getSettings();
    if (data.useExperimentalGpu !== undefined) {
      settings.useExperimentalGpu = data.useExperimentalGpu;
    }
    return await this.repository.save(settings);
  }
}
