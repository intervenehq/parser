import BaseVectorStoreClient, {
  CreateItems,
  FindOrCreateCollection,
  QueryItems,
} from "./base";
import { Collection, ChromaClient } from "chromadb";
import VectorStoreCollection from "src/embeddings/Collection";
import VectorStoreItem from "src/embeddings/Item";

export default class ChromaDBClient extends BaseVectorStoreClient<
  ChromaClient,
  Collection
> {
  client: ChromaClient;

  constructor(...params: ConstructorParameters<typeof ChromaClient>) {
    super();

    this.client = new ChromaClient(...params);
  }

  async connect() {
    return Promise.resolve();
  }

  findOrCreateCollection: FindOrCreateCollection<Collection> = async (
    name: string
  ) => {
    const collection = await this.client.getOrCreateCollection({ name });

    return new VectorStoreCollection({ name: name, object: collection });
  };

  createItems: CreateItems<Collection> = async (collection, items) => {
    const chromaItems = await collection.object.add({
      ids: items.map((item) => item.id),
      embeddings: items.map((item) => item.embeddings),
      metadatas: items.map((item) => item.metadata),
    });

    if (chromaItems.error) {
      throw new Error(chromaItems.error);
    }

    return;
  };

  queryItems: QueryItems<Collection> = async (
    collection,
    query,
    where,
    limit = 10
  ) => {
    const result = await collection.object.query({
      queryEmbeddings: query,
      nResults: limit,
      include: ["embeddings", "metadatas", "distances"] as any,
      where,
    });

    return result.ids[0].map((_, index) => {
      return new VectorStoreItem({
        id: result.ids[0][index]!,
        embeddings: result.embeddings![0][index]!,
        metadata: result.metadatas![0][index]!,
        distance: result.distances![0][index]!,
      });
    });
  };
}
