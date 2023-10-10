import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import path from "path";
import { getCurrentDirectory } from "~/utils/current-directory";
import { EmbeddingsDatabase, EmbeddingsTable } from "~/utils/kysley";

export default class EmbeddingStore {
  private dialect: SqliteDialect;
  private kysely: Kysely<EmbeddingsDatabase>;

  constructor() {
    this.dialect = new SqliteDialect({
      database: new SQLite(
        path.join(getCurrentDirectory(), "../../.tmp/embeddings.sqlite"),
        { fileMustExist: false }
      ),
    });

    this.kysely = new Kysely({
      dialect: this.dialect,
    });
  }

  async setup() {
    await this.kysely.schema
      .createTable("embeddings")
      .ifNotExists()
      .addColumn("input", "text")
      .addColumn("vectors", "text")
      .addColumn("metadata_object_hash", "text")
      .execute();
  }

  async retrieveEmbeddings(input: string[]) {
    await this.setup();

    const rows = await this.kysely
      .selectFrom("embeddings")
      .selectAll()
      .where("embeddings.input", "in", input)
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

    await this.kysely.insertInto("embeddings").values(embeddings).execute();
  }
}
