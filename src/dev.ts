import 'reflect-metadata';
import { MainModule } from './modules/main.module.js';

const programModule = new MainModule();

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 16500;

console.log(`Starting Lazy Review in development mode on port ${port}...`);

programModule.start({ port }).catch((error) => {
  console.error('Failed to start MainModule:', error);
  process.exit(1);
});
