import path from 'path';
import { IndexItem, LocalIndex } from 'vectra';

import VectorStoreCollection from '~/embeddings/Collection';
import VectorStoreItem from '~/embeddings/Item';

import { getCurrentDirectory } from '~/utils/current-directory';

import BaseVectorStoreClient, {
  CreateItems,
  FindOrCreateCollection,
  QueryItems,
} from './base';

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
      path.join(getCurrentDirectory(), '..', '..', '.tmp', `vectra_${name}`),
    );

    if (!(await index.isIndexCreated())) {
      await index.createIndex();
    }

    return new VectorStoreCollection({ name: name, object: index });
  };

  createItems: CreateItems<LocalIndex> = async (collection, items) => {
    for (const item of items) {
      await collection.object.upsertItem({
        id: item.id,
        vector: item.embeddings,
        metadata: item.metadata,
      });
    }

    return;
  };

  queryItems: QueryItems<LocalIndex, IndexItem> = async (
    collection,
    query,
    where,
    limit = 10,
  ) => {
    const result = await collection.object.queryItems(query, limit, where);

    return result.map(({ item }) => {
      return new VectorStoreItem<IndexItem>({
        object: item,
        id: item.id,
        metadata: item.metadata,
        embeddings: item.vector,
        distance: item.norm,
      });
    });
  };
}
