import chalk from 'chalk';
import ora from 'ora';

import { DataSource } from 'typeorm';
import ProjectEntity from '../server/entities/project.entity.js';
import SettingsEntity from '../server/entities/settings.entity.js';
import { VectorDatabaseService } from './vector-database.service.js';
import { ensureAppDataDir, getDatabasePath } from '../storage-paths.js';

class DatabaseModule {
  appDataSource: DataSource;
  vectorDatabase: VectorDatabaseService;

  constructor() {
    this.vectorDatabase = new VectorDatabaseService();
    const databasePath = getDatabasePath();
    if (!databasePath.includes(process.cwd())) {
      // New-style per-user data dir: make sure it exists before TypeORM opens it.
      ensureAppDataDir();
    }
    this.appDataSource = new DataSource({
      type: 'better-sqlite3',
      database: databasePath,
      synchronize: true,
      logging: false,
      entities: [ProjectEntity, SettingsEntity],
      migrations: [],
      subscribers: [],
    });
  }

  async connect() {
    const spinner = ora({
      text: 'connecting to database.....',
      color: 'gray',
      interval: 200,
    }).start();

    await this.appDataSource.initialize().catch((err) => {
      spinner.fail(chalk.red('Database connection failed: ') + err);

      throw new Error('Database connection failed');
    });

    spinner.succeed(chalk.green('Database connected successfully'));
  }
}

export default DatabaseModule;
