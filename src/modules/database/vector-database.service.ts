import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
export class VectorDatabaseService {
  private db: Database.Database;

  constructor(databasePath: string = 'database.sqlite') {
    this.db = new Database(databasePath);
    sqliteVec.load(this.db);
    this.initTables();
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        content TEXT NOT NULL,
        file_path TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_project_facts USING vec0(
        fact_id INTEGER PRIMARY KEY,
        embedding float[1024]
      );
    `);
  }

  public async saveProjectFact(
    projectId: string,
    content: string,
    embeddingArray: number[],
    filePath?: string,
    metadata?: any,
  ) {
    const embeddingFloat32 = new Float32Array(embeddingArray);
    const serializedEmbedding = Buffer.from(embeddingFloat32.buffer);

    const transaction = this.db.transaction(() => {
      const insertFact = this.db.prepare(`
        INSERT INTO project_facts (project_id, content, file_path, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      const result = insertFact.run(
        projectId,
        content,
        filePath || null,
        metadata ? JSON.stringify(metadata) : null,
      );

      const factId = result.lastInsertRowid;

      const insertVec = this.db.prepare(`
        INSERT INTO vec_project_facts (fact_id, embedding)
        VALUES (?, ?)
      `);

      insertVec.run(BigInt(factId), serializedEmbedding);

      return Number(factId);
    });

    return transaction();
  }

  public async searchFacts(projectId: string, queryEmbedding: number[], limit: number = 5) {
    const queryFloat32 = new Float32Array(queryEmbedding);
    const serializedQuery = Buffer.from(queryFloat32.buffer);

    const searchStmt = this.db.prepare(`
      SELECT 
        pf.id,
        pf.project_id,
        pf.content,
        pf.file_path,
        pf.metadata,
        pf.created_at,
        pf.updated_at,
        vec_distance_cosine(vpf.embedding, ?) AS distance
      FROM vec_project_facts vpf
      JOIN project_facts pf ON pf.id = vpf.fact_id
      WHERE pf.project_id = ?
      ORDER BY distance ASC
      LIMIT ?
    `);

    const results = searchStmt.all(serializedQuery, projectId, limit);
    return results.map((row: any) => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));
  }

  public deleteProjectFacts(projectId: string) {
    const transaction = this.db.transaction(() => {
      const deleteVec = this.db.prepare(`
        DELETE FROM vec_project_facts 
        WHERE fact_id IN (
          SELECT id FROM project_facts WHERE project_id = ?
        )
      `);
      deleteVec.run(projectId);

      const deleteFacts = this.db.prepare(`
        DELETE FROM project_facts WHERE project_id = ?
      `);
      deleteFacts.run(projectId);
    });

    transaction();
  }

  public deleteFactsForFile(projectId: string, filePath: string) {
    const transaction = this.db.transaction(() => {
      const deleteVec = this.db.prepare(`
        DELETE FROM vec_project_facts 
        WHERE fact_id IN (
          SELECT id FROM project_facts WHERE project_id = ? AND file_path = ?
        )
      `);
      deleteVec.run(projectId, filePath);

      const deleteFacts = this.db.prepare(`
        DELETE FROM project_facts WHERE project_id = ? AND file_path = ?
      `);
      deleteFacts.run(projectId, filePath);
    });

    transaction();
  }

  public async replaceFactsForFile(
    projectId: string,
    filePath: string,
    facts: { content: string; embedding: number[]; metadata?: any }[],
  ) {
    // Delete existing
    this.deleteFactsForFile(projectId, filePath);

    // Insert new in a single transaction for speed
    if (facts.length === 0) return;

    const transaction = this.db.transaction(
      (items: { content: string; embedding: number[]; metadata?: any }[]) => {
        const insertFact = this.db.prepare(`
        INSERT INTO project_facts (project_id, content, file_path, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

        const insertVec = this.db.prepare(`
        INSERT INTO vec_project_facts (fact_id, embedding)
        VALUES (?, ?)
      `);

        for (const fact of items) {
          const embeddingFloat32 = new Float32Array(fact.embedding);
          const serializedEmbedding = Buffer.from(embeddingFloat32.buffer);

          const result = insertFact.run(
            projectId,
            fact.content,
            filePath,
            fact.metadata ? JSON.stringify(fact.metadata) : null,
          );

          const factId = result.lastInsertRowid;
          insertVec.run(BigInt(factId), serializedEmbedding);
        }
      },
    );

    transaction(facts);
  }

  /**
   * Batch save facts across multiple files in a single transaction.
   * Much faster than calling replaceFactsForFile repeatedly.
   */
  public async batchReplaceFacts(
    projectId: string,
    fileFacts: {
      filePath: string;
      facts: { content: string; embedding: number[]; metadata?: any }[];
    }[],
  ) {
    const transaction = this.db.transaction((items: typeof fileFacts) => {
      const deleteVec = this.db.prepare(`
        DELETE FROM vec_project_facts 
        WHERE fact_id IN (
          SELECT id FROM project_facts WHERE project_id = ? AND file_path = ?
        )
      `);

      const deleteFacts = this.db.prepare(`
        DELETE FROM project_facts WHERE project_id = ? AND file_path = ?
      `);

      const insertFact = this.db.prepare(`
        INSERT INTO project_facts (project_id, content, file_path, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      const insertVec = this.db.prepare(`
        INSERT INTO vec_project_facts (fact_id, embedding)
        VALUES (?, ?)
      `);

      for (const { filePath, facts } of items) {
        // Delete existing facts for this file
        deleteVec.run(projectId, filePath);
        deleteFacts.run(projectId, filePath);

        // Insert new facts
        for (const fact of facts) {
          const embeddingFloat32 = new Float32Array(fact.embedding);
          const serializedEmbedding = Buffer.from(embeddingFloat32.buffer);

          const result = insertFact.run(
            projectId,
            fact.content,
            filePath,
            fact.metadata ? JSON.stringify(fact.metadata) : null,
          );

          const factId = result.lastInsertRowid;
          insertVec.run(BigInt(factId), serializedEmbedding);
        }
      }
    });

    transaction(fileFacts);
  }
}
