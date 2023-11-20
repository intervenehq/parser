import { BasicValueQuery } from 'sift';
import { Simplify } from 'type-fest';

export type InterveneParserItemMetadata = {
  tokens: string;
  apiSpecId: string;
  paths: string;
} & Record<string, boolean | number | string>;

export type InterveneParserItemMetadataWhere = Exclude<
  BasicValueQuery<Omit<InterveneParserItemMetadata, 'paths'>>,
  RegExp
>;

export type InterveneParserItem = {
  id: string;
  metadata: InterveneParserItemMetadata;
  distance?: number;
  embeddings?: number[];
};

export type StorableInterveneParserItem = {
  id: string;
  metadata: InterveneParserItemMetadata;
  embeddings: number[];
  metadataHash: string;
};

export type CreateEmbeddingResponse = [string, number[]][];
export type CreateEmbeddingsFunction = (
  input: string[],
) => Promise<Simplify<CreateEmbeddingResponse>>;

export type SearchEmbeddingsFunction = (
  input: string,
  embedding: number[],
  limit: number,
  where: InterveneParserItemMetadataWhere,
) => Promise<InterveneParserItem[]>;

export type UpsertEmbeddingsFunction = (
  embeddings: StorableInterveneParserItem[],
) => Promise<void>;

export type RetrieveEmbeddingsFunction = (
  input: string[],
) => Promise<StorableInterveneParserItem[]>;

export type VectorStoreFunctions = {
  searchItems: SearchEmbeddingsFunction;
  retrieveItems: RetrieveEmbeddingsFunction;
  upsertItems: UpsertEmbeddingsFunction;
};

export type EmbeddingFunctions = {
  createEmbeddings: CreateEmbeddingsFunction;
} & VectorStoreFunctions;
