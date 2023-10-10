import { ChatCompletionCreateParamsBase } from 'node_modules/openai/resources/chat/completions';
import OpenAI, { ClientOptions } from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import BaseChatCompletion, {
  ChatCompletionModels,
  GenerateChatCompletion,
  GenerateStructuredChatCompletion,
} from '~/chat-completion/base';

const MODELS = {
  [ChatCompletionModels.critical]: 'gpt-4-0613',
  [ChatCompletionModels.trivial]: 'gpt-3.5-turbo-0613',
};

export default class OpenAIChatCompletion extends BaseChatCompletion<OpenAI> {
  client: OpenAI;

  constructor(clientOptions: ClientOptions = {}) {
    super();
    this.client = new OpenAI(clientOptions);
  }

  generate: GenerateChatCompletion = async (params, extraArgs) => {
    const response = await this.client.chat.completions.create({
      model: MODELS[params.model],
      messages: params.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      temperature: 0,
      ...extraArgs,
      stream: false,
    });

    return {
      content: response.choices[0].message.content!,
      usage: response.usage,
    };
  };

  generateStructured: GenerateStructuredChatCompletion = async (
    params,
    extraArgs,
  ) => {
    const messages: ChatCompletionCreateParamsBase['messages'] = [
      ...params.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      {
        role: 'user',
        content: 'always call one of the provided functions',
      },
    ];

    const response = await this.client.chat.completions.create({
      model: MODELS[params.model],
      messages,
      function_call: { name: params.generatorName },
      functions: [
        {
          name: params.generatorName,
          description: params.generatorDescription,
          parameters: zodToJsonSchema(params.generatorOutputSchema),
        },
      ],
      temperature: 0,
      ...extraArgs,
      stream: false,
    });

    const parseResult = params.generatorOutputSchema.safeParse(
      JSON.parse(response.choices[0].message.function_call?.arguments ?? '{}'),
    );

    if (parseResult.success) {
      return parseResult.data as Zod.infer<typeof params.generatorOutputSchema>;
    }

    messages.push({
      role: 'assistant',
      function_call: response.choices[0].message.function_call!,
      content: null,
    });
    messages.push({
      role: 'user',
      content:
        'You have not supplied correct parameters to the function. Try again. The error was: \n ```' +
        JSON.stringify(parseResult.error.errors) +
        '```',
    });

    const response2 = await this.client.chat.completions.create({
      model: MODELS[params.model],
      messages,
      function_call: { name: params.generatorName },
      functions: [
        {
          name: params.generatorName,
          description: params.generatorDescription,
          parameters: zodToJsonSchema(params.generatorOutputSchema),
        },
      ],
      temperature: 0,
      ...extraArgs,
      stream: false,
    });

    const parseResult2 = params.generatorOutputSchema.safeParse(
      JSON.parse(response2.choices[0].message.function_call?.arguments ?? '{}'),
    );

    if (parseResult2.success) {
      return parseResult2.data as Zod.infer<
        typeof params.generatorOutputSchema
      >;
    }

    throw new Error(
      'GPT could not call a function even after retrying: ' +
        JSON.stringify(parseResult2.error.errors),
    );
  };
}
