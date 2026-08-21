import express, { type Express } from 'express';
import cors from 'cors';

import { Server as HttpServer } from 'http';
import open from 'open';
import chalk from 'chalk';
import path from 'path';
import ora from 'ora';
import { MainModule } from '../main.module.js';
import Routes from './routes/routes.js';

export interface ServerStartOptions {
  port?: number;
}

export class Server {
  readonly mainModule: MainModule;
  app?: Express;
  httpServer?: HttpServer;
  private routes: Routes;
  port: number;

  constructor({ port = 16500, mainModule }: ServerStartOptions & { mainModule: MainModule }) {
    this.port = port;
    this.mainModule = mainModule;
  }

  async start() {
    try {
      const spinner = ora({
        text: 'opening up browser.....',
        color: 'gray',
        interval: 200,
      });

      const clientPath = path.join(process.cwd(), 'dist', 'client');

      this.app = express();
      this.app.use(express.json({ limit: '50mb' }));
      this.app.use(express.urlencoded({ extended: true }));

      spinner.start();

      await open(`http://localhost:${this.port}/`).then(() => {
        spinner.succeed(chalk.green('browser opened successfully ✅'));
      });

      this.app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }));

      this.app.use('/', express.static(clientPath));

      const frontendRoutes = ['/repo/:id', '/repo/:id/review/:prId', '/settings'];
      frontendRoutes.forEach((route) => {
        this?.app?.get(route, (req, res, next) => {
          if (req.headers.accept?.includes('text/html')) {
            res.sendFile(path.join(clientPath, 'index.html'));
          } else {
            next();
          }
        });
      });

      this.httpServer = this.app.listen(this.port, () => {
        console.log(
          chalk.green(`[LAZY-REVIEW] Express server listening at `) +
            chalk.bold.blue(`http://localhost:${this.port}`),
        );
      });

      //Init routes
      this.routes = new Routes(this.app, this.mainModule);
      this.routes.init();
    } catch (error) {
      console.log(error);
      console.log(chalk.red('System crashed ❌'));
    }
  }
}

export default Server;
