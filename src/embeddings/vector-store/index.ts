import BaseVectorStoreClient, {
  CreateItems,
  FindOrCreateCollection,
  QueryItems,
} from "src/embeddings/vector-store/base";
import VectraClient from "src/embeddings/vector-store/vectra";

export default class VectorStoreClient extends BaseVectorStoreClient<
  BaseVectorStoreClient<any>
> {
  client: BaseVectorStoreClient<any, any>;

  constructor() {
    super();

    if (process.env.VECTOR_STORE) {
      this.client = new VectraClient();
    } else {
      this.client = new VectraClient();
    }
  }

  async connect() {
    return this.client.connect();
  }

  findOrCreateCollection(...params: Parameters<FindOrCreateCollection>) {
    return this.client.findOrCreateCollection(...params);
  }

  createItems(...params: Parameters<CreateItems>) {
    return this.client.createItems(...params);
  }

  queryItems(...params: Parameters<QueryItems>) {
    return this.client.queryItems(...params);
  }
}
