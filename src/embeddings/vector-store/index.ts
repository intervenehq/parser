import BaseVectorStoreClient, {
  CreateItems,
  FindOrCreateCollection,
  QueryItems,
} from "src/embeddings/vector-store/base";
import VectraClient from "src/embeddings/vector-store/vectra";
import ChromaDBClient from "~/embeddings/vector-store/chromadb";
import { getConfig } from "~/utils/config";

class VectorStore extends BaseVectorStoreClient<BaseVectorStoreClient<any>> {
  client: BaseVectorStoreClient<any, any>;

  constructor() {
    super();

    if (getConfig().VECTOR_STORE === "chromadb") {
      this.client = new ChromaDBClient({ path: "http://0.0.0.0:8000" });
    } else {
      this.client = new VectraClient();
    }
  }

  async connect() {}

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
