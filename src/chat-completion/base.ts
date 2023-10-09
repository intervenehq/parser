import { SomeZodObject } from "zod";

export interface IChatCompletionMessage {
  role: "user" | "assistant";
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
  $O extends SomeZodObject = SomeZodObject
> = <O extends $O>(params: {
  model: ChatCompletionModels;
  messages: IChatCompletionMessage[];
  name: string;
  description: string;
  outputSchema: O;
}) => Promise<Zod.infer<O>>;

export type GenerateChatCompletion = (params: {
  model: ChatCompletionModels;
  messages: IChatCompletionMessage[];
}) => Promise<IChatCompletionResponse>;

export default abstract class BaseChatCompletion<ClientT> {
  abstract client: ClientT;

  abstract generateStructured: GenerateStructuredChatCompletion;

  abstract generate: GenerateChatCompletion;
}
