import { EmbeddingFunction, EmbeddingResponse } from "~/embeddings/functions";
import { openaiEmbeddingFunction } from "~/embeddings/functions/openai";

export function createEmbeddings(
  $text: string,
  embeddingFunction?: EmbeddingFunction
): Promise<number[]>;

export function createEmbeddings(
  $text: string[] | Iterable<string>,
  embeddingFunction?: EmbeddingFunction
): Promise<EmbeddingResponse>;

export async function createEmbeddings(
  $text: string | string[] | Iterable<string>,
  embeddingFunction: EmbeddingFunction = openaiEmbeddingFunction
) {
  if (Array.isArray($text) && !$text.length) return {};

  const text = typeof $text === "string" ? [$text] : Array.from($text);

  const embeddings = await embeddingFunction(text);

  if (typeof $text === "string") {
    return embeddings[$text];
  } else {
    return embeddings;
  }
}
