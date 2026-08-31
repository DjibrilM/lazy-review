import { DataSource, Repository } from 'typeorm';
import SettingsEntity from '../entities/settings.entity.js';
import type { MainModule } from '../../main.module.js';

const GITHUB_CLIENT_ID = 'Ov23liPjKTSnrwJIh8KY';

export class AuthService {
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

  async startDeviceFlow() {
    const response = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        scope: 'repo',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to start device flow: ${response.statusText}`);
    }

    return await response.json();
  }

  async pollForToken(deviceCode: string) {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to poll for token: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error !== 'authorization_pending') {
      // Do not log sensitive token data
    }

    if (data.access_token) {
      const settings = await this.getSettings();
      settings.githubToken = data.access_token;
      if (data.refresh_token) {
        settings.githubRefreshToken = data.refresh_token;
      }
      settings.githubTokenUpdatedAt = Date.now();
      await this.repository.save(settings);

      // Update GithubModule if it exists
      if (this.mainModule?.github) {
        this.mainModule.github.updateToken(data.access_token);
      }
    }

    return data;
  }

  async logout() {
    const settings = await this.getSettings();
    // Use repository.update so the null value is always persisted.
    // TypeORM's save() silently ignores properties set to `undefined`,
    // which would leave a stale token in the DB and keep users "authenticated".
    await this.repository.update(
      { id: settings.id },
      { githubToken: null, githubRefreshToken: null, githubTokenUpdatedAt: null },
    );

    if (this.mainModule?.github) {
      this.mainModule.github.updateToken('');
    }

    return { success: true };
  }

  async getStatus() {
    const settings = await this.getSettings();
    return {
      isAuthenticated: !!settings.githubToken,
    };
  }
}
