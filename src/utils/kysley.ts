export interface EmbeddingsTable {
  input: string;
  vectors: string;
  metadata_object_hash: string;
}

export interface EmbeddingsDatabase {
  embeddings: EmbeddingsTable;
}
