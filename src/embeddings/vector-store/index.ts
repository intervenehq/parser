import BaseVectorStoreClient, {
  CreateItems,
  FindOrCreateCollection,
  QueryItems,
} from "src/embeddings/vector-store/base";
import VectraClient from "src/embeddings/vector-store/vectra";

class VectorStore extends BaseVectorStoreClient<BaseVectorStoreClient<any>> {
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

  findOrCreateCollection: FindOrCreateCollection = (...params) => {
    return this.client.findOrCreateCollection(...params);
  };

  createItems: CreateItems = (...params) => {
    return this.client.createItems(...params);
  };

  queryItems: QueryItems = (...params) => {
    return this.client.queryItems(...params);
  };
}

const vectorStore = new VectorStore();

export default vectorStore;
