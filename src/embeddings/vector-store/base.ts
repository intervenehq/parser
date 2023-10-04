import VectorStoreItem, { IVectorStoreItem } from "src/embeddings/Item";
import VectorStoreCollection from "../Collection";

export type FindOrCreateCollection<CollectionT = any> = (
  name: string
) => Promise<VectorStoreCollection<CollectionT>>;

export type CreateItems<CollectionT = any, ItemT = any> = (
  collection: VectorStoreCollection<CollectionT>,
  items: IVectorStoreItem[]
) => Promise<VectorStoreItem<ItemT>[]>;

export type QueryItems<CollectionT = any, ItemT = any> = (
  collection: VectorStoreCollection<CollectionT>,
  query: number[],
  limit: number
) => Promise<VectorStoreItem<ItemT>[]>;

export default abstract class BaseVectorStoreClient<
  ClientT,
  CollectionT = any,
  ItemT = any
> {
  abstract client: ClientT;

  abstract connect(): Promise<void>;

  abstract findOrCreateCollection(
    ...params: Parameters<FindOrCreateCollection<CollectionT>>
  ): Promise<VectorStoreCollection<CollectionT>>;

  abstract createItems(
    ...params: Parameters<CreateItems<CollectionT, ItemT>>
  ): Promise<VectorStoreItem<ItemT>[]>;

  abstract queryItems(
    ...params: Parameters<QueryItems<CollectionT, ItemT>>
  ): Promise<VectorStoreItem<ItemT>[]>;
}
