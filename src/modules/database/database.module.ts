import chalk from 'chalk';
import ora from 'ora';

import { DataSource } from 'typeorm';
import ProjectEntity from '../server/entities/project.entity.js';
import SettingsEntity from '../server/entities/settings.entity.js';
import { VectorDatabaseService } from './vector-database.service.js';
import { DATABASE_PATH } from '../../paths.js';

class DatabaseModule {
  appDataSource: DataSource;
  vectorDatabase: VectorDatabaseService;

  constructor() {
    this.vectorDatabase = new VectorDatabaseService();
    this.appDataSource = new DataSource({
      type: 'better-sqlite3',
      database: DATABASE_PATH,
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
