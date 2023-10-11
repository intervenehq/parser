import { ChromaClient, Collection } from 'chromadb/dist/main';

import VectorStoreCollection from '~/embeddings/Collection';
import VectorStoreItem from '~/embeddings/Item';

import BaseVectorStoreClient, {
  CreateItems,
  FindOrCreateCollection,
  PurgeCollection,
  QueryItems,
} from './base';

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
    name,
    metadata,
  ) => {
    const collection = await this.client.getOrCreateCollection({
      name,
      metadata,
    });

    return new VectorStoreCollection({
      name: name,
      object: collection,
      metadata: collection.metadata,
    });
  };

  createItems: CreateItems<Collection> = async (collection, items) => {
    if (!items.length) {
      return;
    }

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
    limit = 10,
  ) => {
    const result = await collection.object.query({
      queryEmbeddings: query,
      nResults: limit,
      include: ['embeddings', 'metadatas', 'distances'] as any,
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

  purgeCollection: PurgeCollection<Collection> = async (collection) => {
    await this.client.deleteCollection(collection);

    return this.findOrCreateCollection(collection.name, collection.metadata);
  };
}
