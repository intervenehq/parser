import OpenAI from "openai";
import { EmbeddingFunction } from "src/embeddings/functions";

export const openaiEmbeddingFunction: EmbeddingFunction = async (input) => {
  const openaiClient = new OpenAI();

  const response = await openaiClient.embeddings.create({
    input,
    model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-ada-002",
  });

  return Object.fromEntries(
    response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => [input[item.index], item.embedding]),
  );
};
