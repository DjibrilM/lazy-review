import express, { type Express } from 'express';
import cors from 'cors';
import os from 'os';

import { Server as HttpServer } from 'http';
import open from 'open';
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';
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

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const clientPath = path.join(__dirname, '..', '..', 'client');

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

      this.httpServer = this.app.listen(this.port, '0.0.0.0', () => {
        console.log(chalk.green(`\n[LAZY-REVIEW] Express server listening at:`));
        console.log(
          chalk.green(`  ➜  Local:   `) + chalk.bold.cyan(`http://localhost:${this.port}`),
        );

        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
          for (const iface of interfaces[name]!) {
            if (iface.family === 'IPv4' && !iface.internal) {
              console.log(
                chalk.green(`  ➜  Network: `) +
                  chalk.bold.cyan(`http://${iface.address}:${this.port}`),
              );
            }
          }
        }
        console.log('');
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

//open -na "Microsoft Edge" --args --app=http://localhost:16500
// open -na "Brave Browser" --args --app=http://localhost:16500
