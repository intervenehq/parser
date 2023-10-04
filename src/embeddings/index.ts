import flatten from "lodash/flatten";
import { EmbeddingFunction } from "~/embeddings/functions";
import { openaiEmbeddingFunction } from "~/embeddings/functions/openai";

export function createEmbeddings(
  $text: string,
  embeddingFunction?: EmbeddingFunction
): Promise<number[]>;

export function createEmbeddings(
  $text: string[],
  embeddingFunction?: EmbeddingFunction
): Promise<number[][]>;

export async function createEmbeddings(
  $text: string | string[],
  embeddingFunction: EmbeddingFunction = openaiEmbeddingFunction
) {
  const text = flatten([$text]);

  const embeddings = await embeddingFunction(text);

  if (typeof $text === "string") {
    return embeddings[0];
  } else {
    return embeddings;
  }
}
