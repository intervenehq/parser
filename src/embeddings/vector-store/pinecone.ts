import { Index, Pinecone, PineconeRecord } from '@pinecone-database/pinecone';
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
    let index = this.client.Index(getConfig()['PINECONE_INDEX']);

    return new VectorStoreCollection({
      name: name,
      object: index,
    });
  };

  createItems: CreateItems<Index> = async (collection, items) => {
    let batch: PineconeRecord[] = [];

    for (const item of items) {
      batch.push({
        id: item.id.slice(0, 511),
        values: item.embeddings,
        metadata: item.metadata,
      });

      const batchSizeInBytes = Buffer.from(JSON.stringify(batch)).length;
      if (batchSizeInBytes >= 4000000) {
        await collection.object.upsert(batch);
        batch = [];
      }
    }

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
