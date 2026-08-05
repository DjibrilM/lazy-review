import * as dotenv from 'dotenv';

dotenv.config();

import DatabaseModule from './database/database.module.js';
import Server from './server/server.module.js';
import SocketModule from './socket-gateway/socket-gateway.module.js';
import GithubModule from './github/github.module.js';
import QvacModule from './qvac/qvac.module.js';

export class MainModule {
  readonly server: Server;
  readonly database: DatabaseModule;
  readonly github: GithubModule;
  readonly qvac: QvacModule;
  socket: SocketModule;

  constructor() {
    this.database = new DatabaseModule();
    this.github = new GithubModule(this);
    this.qvac = new QvacModule(this);
    this.server = new Server({ mainModule: this });
  }

  async start({ port }: { port?: number }) {
    await this.database.connect();
    this.server.port = port ?? 16500;
    await this.server.start();

    if (this.server.httpServer) {
      this.socket = new SocketModule(this.server.httpServer, this);
    }
  }
}
