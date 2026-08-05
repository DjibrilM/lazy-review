#!/usr/bin/env node
import 'reflect-metadata';

import { Command } from 'commander';
import { MainModule } from './modules/main.module.js';

const programModule = new MainModule();

const programDescription = 'Lazy Review - Offline AI Reviewer';
const programName = 'lazy-review';
const program = new Command().name(programName).description(programDescription).version('0.0.1');

program
  .command('run')
  .description('Start the Lazy Review CLI')
  .option('-p, --port <number>', 'Port to run the server on')
  .action(({ port }: { port: number }) => {
    programModule.start({ port });
  });

program.parse(process.argv);
