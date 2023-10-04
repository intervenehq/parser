import vectorStore from "src/embeddings/vector-store";
import { JsonObject } from "type-fest";
import { createEmbeddings } from "~/embeddings/index";

export default class ExternalResourcesDirectory {
  constructor() {}

  embed = (openapiDocs: JsonObject[]) => {};

  search = async (objective: string) => {
    const collection = await vectorStore.findOrCreateCollection("openapi");

    const embedding = await createEmbeddings(objective);

    const matches = vectorStore.queryItems(collection, embedding);
  };
}
