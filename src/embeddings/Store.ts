import path from 'path';
import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';

import { getCurrentDirectory } from '~/utils/current-directory';
import { EmbeddingsDatabase, EmbeddingsTable } from '~/utils/kysley';

export default class EmbeddingStore {
  private dialect: SqliteDialect;
  private kysely: Kysely<EmbeddingsDatabase>;

  constructor() {
    this.dialect = new SqliteDialect({
      database: new SQLite(
        path.join(getCurrentDirectory(), '../../.tmp/embeddings.sqlite'),
        { fileMustExist: false },
      ),
    });

    this.kysely = new Kysely({
      dialect: this.dialect,
    });
  }

  async setup() {
    await this.kysely.schema
      .createTable('embeddings')
      .ifNotExists()
      .addColumn('input', 'text')
      .addColumn('vectors', 'text')
      .addColumn('metadata_object_hash', 'text')
      .execute();

    await this.kysely.schema
      .createIndex('embeddings_input')
      .on('embeddings')
      .ifNotExists()
      .column('input')
      .execute();
  }

  async retrieveEmbeddings(input: string[]) {
    await this.setup();

    const rows = await this.kysely
      .selectFrom('embeddings')
      .selectAll()
      .where('embeddings.input', 'in', input)
      .execute();

    return rows.map((row) => ({
      input: row.input,
      vectors: JSON.parse(row.vectors),
      metadata_object_hash: row.metadata_object_hash,
    }));
  }

  async storeEmbeddings(embeddings: EmbeddingsTable[]) {
    await this.setup();
    if (!embeddings.length) return;

    const existingEmbeddings = (
      await this.kysely
        .selectFrom('embeddings')
        .select('embeddings.input')
        .where(
          'embeddings.input',
          'in',
          embeddings.map((e) => e.input),
        )
        .execute()
    ).map((e) => e.input);

    const toUpdate = embeddings.filter(
      (e) => !existingEmbeddings.includes(e.input),
    );

    for (const embedding of toUpdate) {
      await this.kysely
        .updateTable('embeddings')
        .set({
          vectors: embedding.vectors,
          metadata_object_hash: embedding.metadata_object_hash,
        })
        .where('input', '=', embedding.input)
        .execute();
    }

    await this.kysely
      .insertInto('embeddings')
      .values(embeddings.filter((e) => !existingEmbeddings.includes(e.input)))
      .execute();
  }
}
