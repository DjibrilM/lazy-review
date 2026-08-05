import chalk from 'chalk';
import ora from 'ora';

import { DataSource } from 'typeorm';
import ProjectEntity from '../server/entities/project.entity.js';
import AiProviderEntity from '../server/entities/ai-provider.entity.js';
import TerminalLogEntity from '../server/entities/terminal-log.entity.js';
import AgentTaskEntity from '../server/entities/agent-task.entity.js';
import DeploymentPlanEntity from '../server/entities/deployment-plan.entity.js';
import DeploymentPlanRevisionEntity from '../server/entities/deployment-plan-revision.entity.js';
import DeploymentPlanFeedbackEntity from '../server/entities/deployment-plan-feedback.entity.js';
import DeploymentPlanApprovalEntity from '../server/entities/deployment-plan-approval.entity.js';
import DeploymentPlanArtifactEntity from '../server/entities/deployment-plan-artifact.entity.js';
class DatabaseModule {
  appDataSource: DataSource;

  constructor() {
    this.appDataSource = new DataSource({
      type: 'better-sqlite3',
      database: 'database.sqlite',
      synchronize: true,
      logging: false,
      entities: [
        ProjectEntity,
        AiProviderEntity,
        TerminalLogEntity,
        AgentTaskEntity,
        DeploymentPlanEntity,
        DeploymentPlanRevisionEntity,
        DeploymentPlanFeedbackEntity,
        DeploymentPlanApprovalEntity,
        DeploymentPlanArtifactEntity,
      ],
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
