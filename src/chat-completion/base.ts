import OpenAI from "openai";
import { SomeZodObject } from "zod";

export interface IChatCompletionMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface IChatCompletionResponse {
  content: string;
  usage?: any;
}

export enum ChatCompletionModels {
  trivial,
  critical,
}

export type GenerateStructuredChatCompletion<
  $O extends SomeZodObject = SomeZodObject,
> = <O extends $O>(
  params: {
    model: ChatCompletionModels;
    messages: IChatCompletionMessage[];
    generatorName: string;
    generatorDescription: string;
    generatorOutputSchema: O;
  },
  extraArgs?: Omit<OpenAI.Chat.ChatCompletionCreateParams, "model" | "messages">
) => Promise<Zod.infer<O>>;

export type GenerateChatCompletion = (
  params: {
    model: ChatCompletionModels;
    messages: IChatCompletionMessage[];
  },
  extraArgs?: Omit<OpenAI.Chat.ChatCompletionCreateParams, "model" | "messages">
) => Promise<IChatCompletionResponse>;

export default abstract class BaseChatCompletion<ClientT> {
  abstract client: ClientT;

  abstract generateStructured: GenerateStructuredChatCompletion;

  abstract generate: GenerateChatCompletion;
}
