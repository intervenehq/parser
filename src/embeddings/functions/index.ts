export type EmbeddingResponse = Record<string, number[]>;

export type EmbeddingFunction = (input: string[]) => Promise<EmbeddingResponse>;
