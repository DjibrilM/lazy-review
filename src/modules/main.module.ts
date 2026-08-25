import * as dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

import DatabaseModule from './database/database.module.js';
import Server from './server/server.module.js';
import SocketModule from './socket-gateway/socket-gateway.module.js';
import GithubModule from './github/github.module.js';
import QvacModule from './qvac/qvac.module.js';
import AiAgentModule from './ai-agent/ai-agent.module.js';

export class MainModule {
  readonly server: Server;
  readonly database: DatabaseModule;
  readonly github: GithubModule;
  readonly qvac: QvacModule;
  readonly aiAgent: AiAgentModule;
  socket: SocketModule;

  constructor() {
    this.database = new DatabaseModule();
    this.github = new GithubModule(this);
    this.qvac = new QvacModule(this);
    this.aiAgent = new AiAgentModule(this);
    this.server = new Server({ mainModule: this });
  }

  async start({ port }: { port?: number }) {
    console.log(chalk.blue.bold('\n🚀 Booting up QVAC backend (Lazy Review)...\n'));

    await this.database.connect();
    this.server.port = port ?? 16500;

    console.log(chalk.cyan('Initializing API and services...'));
    await this.server.start();
    await this.github.init();

    if (this.server.httpServer) {
      this.socket = new SocketModule(this.server.httpServer, this);
      console.log(chalk.cyan('Socket Gateway initialized ✅'));
    }

    console.log(
      chalk.green.bold(
        `\n✨ Boot-up complete! QVAC Server is running on port ${this.server.port}\n`,
      ),
    );
  }
}
