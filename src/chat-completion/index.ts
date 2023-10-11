import BaseChatCompletion, {
  ChatCompletionModels,
  GenerateChatCompletion,
  GenerateStructuredChatCompletion,
} from '~/chat-completion/base';
import OpenAIChatCompletion from '~/chat-completion/openai';

export default class ChatCompletion extends BaseChatCompletion<any> {
  client: BaseChatCompletion<any>;
  defaultModel = ChatCompletionModels.critical;

  constructor(useTrivialModelsByDefault: boolean) {
    super();

    this.client = new OpenAIChatCompletion({}, useTrivialModelsByDefault);
  }

  generateStructured: GenerateStructuredChatCompletion = (...params) => {
    return this.client.generateStructured(...params);
  };

  generate: GenerateChatCompletion = (...params) => {
    return this.client.generate(...params);
  };
}
