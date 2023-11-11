import { JSONSchema7 } from 'json-schema';

import {
  objectivePrefix,
  OperationMetdata,
  operationPrefix,
} from '../agent/index';
import { IChatCompletionMessage, LLM } from '../llm';
import Logger from '../utils/logger';
import { t } from '../utils/template';

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

export default class CodeGenerator {
  constructor(
    public logger: Logger,
    public llm: LLM<any>,
    public language: CodeGenLanguage,
  ) {}

  async generateInputParamCode(
    params: OperationMetdata & {
      inputSchema: JSONSchema7;
      context: OperationMetdata['context'];
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
        'Here is some data that can be used to construct the output:',
        '{{#each context}}`{{@key}}`: ```{{this}}```\n{{/each}}',
        '{{/if}}',
        'Your task is to generate a function in {{language}} that follows exactly this format:',
        '```' + boilerplate + '```',
        'Replace <expression>, with a value that satisfies the following JSON schema (call it returnSchema):',
        '```{{inputSchema}}```',
        'Rules:',
        '1. You can only use data hidden in the objective and context. You must use it directly.',
        '2. You must not assume or imagine any piece of data.',
        '3. You must reply only with the function definition. No comments or explanations.',
        '4. The generated function must return a value that complies with the given returnSchema.',
        "5. You are going to reply with code that is directly eval'd on a server. Do not wrap it with markdown or '```'.",
        '6. The generated function MUST have EXACTLY 0 arguments.',
        '7. You do not have access to any external libraries or window or document objects.',
        '8. You can use any global variables present in a typical nodejs environment.',
        // '{{#if needsContext}}7. You can use any of the variables by their names directly in the gnerated code. They will be available in the context during execution. {{/if}}',
      ],
      {
        inputSchema: JSON.stringify(params.inputSchema),
        needsContext: params.context && !!Object.keys(params.context).length,
        context: Object.fromEntries(
          Object.entries(params.context || {}).map(([key, schema]) => {
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

    let generatedCode = await this.llm.generate(
      {
        messages,
      },
      {
        logit_bias: {
          // GPT specific, telling GPT to not have ``` in the output (forcing it to not generate markdown)
          '15506': -1,
        },
      },
    );

    if (generatedCode.content.match(/^[\s\n]*```(.|\n|\s)*```[\s\n]*$/)) {
      generatedCode = await this.llm.generate(
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

    await this.logger.info(
      `Generated code for ${params.name}`,
      generatedCode.content,
    );

    return generatedCode.content;
  }
}
