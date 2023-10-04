import BaseVectorStoreClient, {
  CreateItems,
  FindOrCreateCollection,
  QueryItems,
} from "./base";
import { IndexItem, LocalIndex } from "vectra";
import path from "path";
import { rootdir } from "../../utils/rootdir";
import VectorStoreCollection from "src/embeddings/Collection";
import VectorStoreItem, { IVectorStoreItem } from "src/embeddings/Item";

export default class VectraClient extends BaseVectorStoreClient<
  undefined,
  LocalIndex,
  IndexItem
> {
  client: any;

  async connect() {
    return Promise.resolve();
  }

  findOrCreateCollection: FindOrCreateCollection<LocalIndex> = async (name) => {
    const index = new LocalIndex(
      path.join(rootdir, "..", ".tmp", `vectra_${name}`)
    );

    if (!(await index.isIndexCreated())) {
      await index.createIndex();
    }

    return new VectorStoreCollection({ name: name, object: index });
  };

  createItems: CreateItems = async (collection, items) => {
    const itemObjects: VectorStoreItem<IndexItem>[] = [];

    for (const item of items) {
      const vectraItem = await collection.object.upsertItem({
        id: item.id,
        vector: item.embeddings,
        metadata: item.metadata,
      });

      itemObjects.push(
        new VectorStoreItem<IndexItem>({
          object: vectraItem,
          id: vectraItem.id,
          metadata: vectraItem.metadata,
          embeddings: vectraItem.vector,
        })
      );
    }

    return itemObjects;
  };

  queryItems: QueryItems<LocalIndex, IndexItem> = async (
    collection: VectorStoreCollection<LocalIndex>,
    query: number[],
    limit = 10
  ) => {
    const result = await collection.object.queryItems(query, limit);

    return result.map(({ item }) => {
      return new VectorStoreItem<IndexItem>({
        object: item,
        id: item.id,
        metadata: item.metadata,
        embeddings: item.vector,
      });
    });
  };
}
