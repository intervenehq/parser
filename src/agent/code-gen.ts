import { JSONSchema7 } from 'json-schema';

import Parser, {
  objectivePrefix,
  OperationMetdata,
  operationPrefix,
} from '~/agent/index';
import { IChatCompletionMessage } from '~/llm';
import Logger from '~/utils/logger';
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
  private logger: Logger;
  public language: CodeGenLanguage;

  constructor(parser: Parser, language: CodeGenLanguage) {
    this.parser = parser;
    this.logger = parser.logger;
    this.language = language;
  }

  async generateInput(
    params: OperationMetdata & {
      inputSchema: JSONSchema7;
      filteredContext: OperationMetdata['context'];
      name: string;
    },
  ) {
    const boilerplate = functionBoilerplate(`get_${params.name}_params`)[
      this.language
    ];

    const message = t(
      [
        objectivePrefix(params, false),
        operationPrefix(params),
        '{{#if needsContext}}',
        'Here are some variables you can use to construct the output:',
        '{{#each context}}`{{@key}}`: ```{{this}}```\n{{/each}}',
        '{{/if}}',
        'Your task is to generate a function in {{language}} that follows exactly this format:',
        '```' + boilerplate + '```',
        'Replace <expression>, with a value that satisfies the following JSON schema (call it returnSchema):',
        '```{{inputSchema}}```',
        'Rules:',
        '1. You can only use data hidden in the objective. You must use it directly.',
        '2. You must not assume or imagine any piece of data.',
        '3. You must reply only with the JS expression. No comments or explanations.',
        '4. The generated function must return a value that complies with the given returnSchema.',
        "5. You are going to reply with code that is directly eval'd on a server. Do not wrap it with markdown or '```'.",
        '6. The generated function must NOT take in any arguments.',
        '{{#if needsContext}}7. You can use any of the variables by their names directly in the gnerated code. They will be available in the context during execution. {{/if}}',
      ],
      {
        inputSchema: JSON.stringify(params.inputSchema),
        needsContext: !!Object.keys(params.filteredContext).length,
        context: Object.fromEntries(
          Object.entries(params.filteredContext).map(([key, schema]) => {
            return [key, JSON.stringify(schema)];
          }),
        ),
        language: this.language,
      },
    );

    const messages: IChatCompletionMessage[] = [
      {
        role: 'user',
        content: message,
      },
      {
        role: 'system',
        content: t([
          'This is NOT correct response:',
          `\`\`\`${boilerplate}\`\`\``,
          'This is also NOT correct response:',
          `\`\`\`${this.language} ${boilerplate}\`\`\``,
          'This is correct response:',
          boilerplate,
          'IN SHORT: no markdown, no tildes',
        ]),
      },
    ];

    let generatedCode = await this.parser.llm.generate(
      {
        messages,
      },
      {
        logit_bias: {
          '15506': -1,
        },
      },
    );

    if (generatedCode.content.match(/^[\s\n]*```(.|\n|\s)*```[\s\n]*$/)) {
      generatedCode = await this.parser.llm.generate(
        {
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
