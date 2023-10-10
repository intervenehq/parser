import { JSONSchema7 } from 'json-schema';
import Parser, {
  objectivePrefix,
  OperationMetdata,
  operationPrefix,
} from '~/agent/index';
import {
  ChatCompletionModels,
  IChatCompletionMessage,
} from '~/chat-completion/base';

import { stringifyContext } from '~/utils/context';
import { t } from '~/utils/template';

export enum CodeGenLanguage {
  javascript = 'javascript',
  python = 'python',
  ruby = 'ruby',
  php = 'php',
}

const functionBoilerplate = (name: string) => ({
  [CodeGenLanguage.javascript]: `
function ${name}() {
  // any additional logic here
  return <expression>;
}`,

  [CodeGenLanguage.python]: `
def ${name}():
  # any additional logic here
  return <expression>`,

  [CodeGenLanguage.ruby]: `
def ${name}
  # any additional logic here
  return <expression>
end`,

  [CodeGenLanguage.php]: `
function ${name}() {
  // any additional logic here
  return <expression>;
}`,
});

export default class CodeGen {
  private parser: Parser;
  private langauge: CodeGenLanguage;

  constructor(parser: Parser, language: CodeGenLanguage) {
    this.parser = parser;
    this.langauge = language;
  }

  async generateInput(
    params: OperationMetdata & {
      inputSchema: JSONSchema7;
      filteredContext: OperationMetdata['context'];
      name: string;
    },
  ) {
    const boilerplate = functionBoilerplate('get_' + params.name + '_params')[
      this.langauge
    ];

    const messages: IChatCompletionMessage[] = [
      {
        role: 'user',
        content: t(
          [
            ...objectivePrefix(params, false),
            ...operationPrefix(params),
            '{{#if needsContext}}',
            'Here are the JSONSchemas representing variables from the steps that occurred before:',
            '{{#each context}}{{@key}}: ```{{this}}```\n{{/each}}',
            '{{/if}}',
            'Your task is to generate a function in {{langauge}} that follows exactly this format:',
            '```' + boilerplate + '```',
            'Where it says <expression>, this function needs to return a value that satisfies the following JSON schema:',
            '```{{inputSchema}}```',
            'Rules:',
            '1. You can only use data hidden in the plan or use any of the variables.',
            '2. You must not assume or imagine any piece of data.',
            '3. You must reply with null if the expression can not be generated.',
            '4. You must reply only with the JS expression. No comments or explanation.',
            "5. You are going to reply with code that is directly eval'd on a server. Do not wrap it with markdown or '```'.",
          ],
          {
            inputSchema: JSON.stringify(params.inputSchema),
            needsContext: !!Object.keys(params.filteredContext).length,
            context: stringifyContext(params.filteredContext),
            langauge: this.langauge,
          },
        ),
      },
      {
        role: 'system',
        content: t([
          'This is NOT correct response:',
          `\`\`\`${boilerplate}\`\`\``,
          'This is also NOT correct response:',
          `\`\`\`${this.langauge} ${boilerplate}\`\`\``,
          'This is correct response:',
          boilerplate,
          'IN SHORT: no markdown, no tildes',
        ]),
      },
    ];

    let generatedCode = await this.parser.chatCompletion.generate(
      {
        model: ChatCompletionModels.critical,
        messages,
      },
      {
        logit_bias: {
          '15506': -1,
        },
      },
    );

    if (generatedCode.content.match(/^[\s\n]*```(.|\n|\s)*```[\s\n]*$/)) {
      generatedCode = await this.parser.chatCompletion.generate(
        {
          model: ChatCompletionModels.critical,
          messages: [
            ...messages,
            {
              role: 'assistant',
              content: generatedCode.content,
            },
            {
              role: 'user',
              content:
                'You did not follow the instructions properly. I specifically asked you not to generate markdown. Please try again.',
            },
          ],
        },
        {
          logit_bias: {
            '15506': -1,
          },
        },
      );
    }

    return generatedCode.content;
  }
}
