import { Collection as ChromaCollection } from 'chromadb';

import VectorStoreItem, { IVectorStoreItem } from '~/embeddings/Item';

import VectorStoreCollection from '../Collection';

export type FindOrCreateCollection<CollectionT = any> = (
  name: string,
  /**
   * use this carefully, not all vector stores support metadata
   */
  metadata?: Record<string, any>,
) => Promise<VectorStoreCollection<CollectionT>>;

export type CreateItems<CollectionT = any> = (
  collection: VectorStoreCollection<CollectionT>,
  items: IVectorStoreItem[],
) => Promise<void>;

export type PurgeCollection<CollectionT = any> = (
  collection: VectorStoreCollection<CollectionT>,
) => Promise<VectorStoreCollection<CollectionT>>;

export type QueryItems<CollectionT = any, ItemT = any> = (
  collection: VectorStoreCollection<CollectionT>,
  query: number[],
  where?: Parameters<ChromaCollection['query']>[0]['where'],
  limit?: number,
) => Promise<VectorStoreItem<ItemT>[]>;

export default abstract class BaseVectorStoreClient<
  ClientT,
  CollectionT = any,
  ItemT = any,
> {
  abstract client: ClientT;

  abstract connect(): Promise<void>;

  abstract findOrCreateCollection: FindOrCreateCollection<CollectionT>;

  abstract createItems: CreateItems<CollectionT>;

  abstract queryItems: QueryItems<CollectionT, ItemT>;

  abstract purgeCollection: PurgeCollection<CollectionT>;
}
