import { SomeZodObject } from 'zod';

import Logger from '../utils/logger';

export enum LLMs {
  OpenAI = 'openai',
}

export interface IChatCompletionMessage {
  role: 'user' | 'assistant' | 'system';
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
    model?: ChatCompletionModels;
    messages: IChatCompletionMessage[];
    generatorName: string;
    generatorDescription: string;
    generatorOutputSchema: O;
  },
  extraArgs?: object,
) => Promise<Zod.infer<O>>;

export type GenerateChatCompletion = (
  params: {
    model?: ChatCompletionModels;
    messages: IChatCompletionMessage[];
  },
  extraArgs?: object,
) => Promise<IChatCompletionResponse>;

export abstract class LLM<ClientT> {
  abstract client: ClientT;
  abstract defaultModel: ChatCompletionModels;
  abstract logger: Logger;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_logger: Logger, _useLessCapableModel: boolean) {}

  abstract generateStructured: GenerateStructuredChatCompletion;

  abstract generate: GenerateChatCompletion;
}
