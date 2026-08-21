const { DataSource } = require('typeorm');
const path = require('path');
// Import SettingsEntity
const SettingsEntity = require('./dist/modules/server/entities/settings.entity.js').default;

async function test() {
  const dataSource = new DataSource({
    type: 'sqlite',
    database: path.join(require('os').homedir(), 'lazy-review', 'qvac.sqlite'),
    entities: [SettingsEntity],
    synchronize: false,
  });
  await dataSource.initialize();
  const repo = dataSource.getRepository(SettingsEntity);
  let settings = await repo.findOneBy({ id: 1 });
  console.log('Before save (undefined):', settings.githubToken ? 'HAS_TOKEN' : 'NO_TOKEN');

  settings.githubToken = undefined;
  await repo.save(settings);

  let check1 = await repo.findOneBy({ id: 1 });
  console.log('After save (undefined):', check1.githubToken ? 'HAS_TOKEN' : 'NO_TOKEN');

  settings.githubToken = null;
  await repo.save(settings);

  let check2 = await repo.findOneBy({ id: 1 });
  console.log('After save (null):', check2.githubToken ? 'HAS_TOKEN' : 'NO_TOKEN');

  await dataSource.destroy();
}
test().catch(console.error);
