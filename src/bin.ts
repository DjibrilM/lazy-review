#!/usr/bin/env node
import 'reflect-metadata';

import { Command } from 'commander';

const programDescription = 'Lazy Review - Offline AI Reviewer';
const programName = 'lazy-review';
const program = new Command().name(programName).description(programDescription).version('0.0.1');

program
  .command('run')
  .description('Start the Lazy Review CLI')
  .option('-p, --port <number>', 'Port to run the server on')
  .action(async ({ port }: { port: number }) => {
    const { MainModule } = await import('./modules/main.module.js');
    const programModule = new MainModule();
    programModule.start({ port });
  });

program.parse(process.argv);
