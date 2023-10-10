import { Index, Pinecone } from '@pinecone-database/pinecone';
import VectorStoreCollection from '~/embeddings/Collection';
import VectorStoreItem, { ItemMetadata } from '~/embeddings/Item';

import { getConfig } from '~/utils/config';

import BaseVectorStoreClient, {
  CreateItems,
  FindOrCreateCollection,
  QueryItems,
} from './base';

export default class PineconeClient extends BaseVectorStoreClient<
  Pinecone,
  Index
> {
  client: Pinecone;

  constructor(...params: ConstructorParameters<typeof Pinecone>) {
    super();

    this.client = new Pinecone(...params);
  }

  async connect() {
    return Promise.resolve();
  }

  findOrCreateCollection: FindOrCreateCollection<Index> = async (
    name: string,
  ) => {
    // pincone does not have a concept of collections, use namespace which is similar
    const index = this.client
      .Index(getConfig()['PINECONE_INDEX'])
      .namespace(name);

    return new VectorStoreCollection({
      name: name,
      object: index,
    });
  };

  createItems: CreateItems<Index> = async (collection, items) => {
    await collection.object.upsert(
      items.map((item) => ({
        id: item.id,
        values: item.embeddings,
        metadata: item.metadata,
      })),
    );

    return;
  };

  queryItems: QueryItems<Index> = async (
    collection,
    query,
    where,
    limit = 10,
  ) => {
    const result = await collection.object.query({
      vector: query,
      topK: limit,
      filter: where,
      includeMetadata: true,
    });

    return (
      result.matches?.map((match) => {
        return new VectorStoreItem({
          id: match.id,
          embeddings: match.values,
          metadata: match.metadata as ItemMetadata,
          distance: match.score!,
        });
      }) ?? []
    );
  };
}
