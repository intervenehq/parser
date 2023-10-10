import BaseVectorStoreClient, {
  CreateItems,
  FindOrCreateCollection,
  QueryItems,
} from "src/embeddings/vector-store/base";
import VectraClient from "src/embeddings/vector-store/vectra";
import ChromaDBClient from "~/embeddings/vector-store/chromadb";
import PineconeClient from "~/embeddings/vector-store/pinecone";
import { getConfig } from "~/utils/config";

class VectorStore extends BaseVectorStoreClient<BaseVectorStoreClient<any>> {
  client: BaseVectorStoreClient<any, any>;

  constructor() {
    super();

    const config = getConfig();

    switch (config.VECTOR_STORE) {
      case "chromadb":
        this.client = new ChromaDBClient({ path: "http://0.0.0.0:8000" });
        break;

      case "pinecone":
        this.client = new PineconeClient({
          apiKey: config.PINECONE_API_KEY,
          environment: config.PINECONE_ENVIRONMENT,
        });
        break;
      default:
        this.client = new VectraClient();
        break;
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
