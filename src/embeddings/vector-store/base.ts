import VectorStoreItem, {
  IVectorStoreItem,
  ItemMetadata,
} from "src/embeddings/Item";
import VectorStoreCollection from "../Collection";
import { Collection } from "chromadb";

export type FindOrCreateCollection<CollectionT = any> = (
  name: string
) => Promise<VectorStoreCollection<CollectionT>>;

export type CreateItems<CollectionT = any> = (
  collection: VectorStoreCollection<CollectionT>,
  items: IVectorStoreItem[]
) => Promise<void>;

export type QueryItems<CollectionT = any, ItemT = any> = (
  collection: VectorStoreCollection<CollectionT>,
  query: number[],
  where?: Parameters<Collection["query"]>[0]["where"],
  limit?: number
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
  ): ReturnType<FindOrCreateCollection<CollectionT>>;

  abstract createItems(
    ...params: Parameters<CreateItems<CollectionT>>
  ): ReturnType<CreateItems<CollectionT>>;

  abstract queryItems(
    ...params: Parameters<QueryItems<CollectionT, ItemT>>
  ): ReturnType<QueryItems<CollectionT, ItemT>>;
}
