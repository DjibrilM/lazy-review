import { loadModel, embed, getModelInfo } from '@qvac/sdk';
import * as qvacModels from '@qvac/sdk';
import { VectorDatabaseService } from './src/modules/database/vector-database.service.js';
import { GTE_MODEL_ID } from './src/constants.js';

async function main() {
  console.log('🚀 Initializing RAG Test...');

  // 1. Initialize Vector Database
  const db = new VectorDatabaseService('test_rag.sqlite');
  console.log('✅ Vector Database initialized (test_rag.sqlite)');

  const projectId = 'test-project-1';
  db.deleteProjectFacts(projectId); // Clear old data

  // 2. Load Embedding Model
  console.log(`\n⏳ Loading embedding model (${GTE_MODEL_ID})...`);
  const loadStart = performance.now();
  const qvacGte = (qvacModels as any)[GTE_MODEL_ID];
  let actualModelId = qvacGte?.modelId ?? GTE_MODEL_ID;

  try {
    actualModelId = await loadModel({
      modelSrc: qvacGte,
      modelConfig: {},
    });
  } catch (e: any) {
    if (e?.code !== 52200) throw e;
    const info = await getModelInfo(qvacGte);
    if (info.loadedInstances && info.loadedInstances.length > 0) {
      actualModelId = info.loadedInstances[0].registryId;
    }
  }
  console.log(`✅ Embedding model loaded in ${(performance.now() - loadStart).toFixed(2)}ms`);

  // 3. Prepare Documents
  const documents = [
    { id: 1, text: 'The capital of France is Paris. It is known for the Eiffel Tower.' },
    { id: 2, text: 'Quantum computing uses quantum bits or qubits to perform operations.' },
    {
      id: 3,
      text: 'Lazy Review is an offline-first AI code reviewer built with Node.js and SQLite.',
    },
    {
      id: 4,
      text: 'Photosynthesis is the process used by plants to convert light energy into chemical energy.',
    },
  ];

  // 4. Embed and Store Documents
  console.log('\n📝 Embedding and storing documents...');
  for (const doc of documents) {
    const start = performance.now();
    const result = await embed({ modelId: actualModelId, text: doc.text });
    await db.saveProjectFact(
      projectId,
      doc.text,
      result.embedding as number[],
      `doc_${doc.id}.txt`,
      { source: 'test' },
    );
    console.log(`  - Embedded doc ${doc.id} in ${(performance.now() - start).toFixed(2)}ms`);
  }

  // 5. Test Retrieval
  const query = 'What is the architecture of Lazy Review?';
  console.log(`\n🔍 Querying: "${query}"`);

  const queryStart = performance.now();
  const queryEmbedResult = await embed({ modelId: actualModelId, text: query });
  const embedTime = performance.now() - queryStart;

  const searchStart = performance.now();
  const results = await db.searchFacts(projectId, queryEmbedResult.embedding as number[], 2);
  const searchTime = performance.now() - searchStart;

  console.log(
    `⏱️  Embedding took ${embedTime.toFixed(2)}ms, Search took ${searchTime.toFixed(2)}ms`,
  );

  console.log('\n📊 Top Results:');
  results.forEach((r, i) => {
    console.log(`  ${i + 1}. [Distance: ${r.distance.toFixed(4)}] ${r.content}`);
  });

  process.exit(0);
}

main().catch(console.error);
