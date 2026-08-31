#!/usr/bin/env node
import 'reflect-metadata';

import { Command } from 'commander';

const programDescription = 'Lazy Review - Offline AI Reviewer';
const programName = 'lazy-review';
const program = new Command().name(programName).description(programDescription).version('0.0.1');

program
  .command('run')
  .description('Start the Lazy Review CLI')
  .action(async () => {
    const { MainModule } = await import('./modules/main.module.js');
    const programModule = new MainModule();
    programModule.start({});
  });

program
  .command('list-projects')
  .description('List all tracked projects')
  .action(async () => {
    const { default: DatabaseModule } = await import('./modules/database/database.module.js');
    const { default: ProjectEntity } = await import('./modules/server/entities/project.entity.js');
    const db = new DatabaseModule();
    await db.connect();
    const projects = await db.appDataSource.getRepository(ProjectEntity).find();
    console.table(projects.map((p) => ({ ID: p.id, Name: p.name, URL: p.repository_url })));
    process.exit(0);
  });

program
  .command('delete-project <id>')
  .description('Delete a tracked project by its ID')
  .action(async (id: string) => {
    const { default: DatabaseModule } = await import('./modules/database/database.module.js');
    const { default: ProjectEntity } = await import('./modules/server/entities/project.entity.js');
    const db = new DatabaseModule();
    await db.connect();
    const repo = db.appDataSource.getRepository(ProjectEntity);
    const project = await repo.findOneBy({ id: id });
    if (!project) {
      console.error(`Project with ID ${id} not found.`);
      process.exit(1);
    }
    await repo.remove(project);
    console.log(`Project ${id} deleted successfully.`);
    process.exit(0);
  });

program.parse(process.argv);
