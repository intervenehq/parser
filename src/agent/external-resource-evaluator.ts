import { JSONSchema7 } from 'json-schema';
import Zod from 'zod';

import {
  objectivePrefix,
  OperationMetdata,
  operationPrefix,
} from '../agent/index';
import { ChatCompletionModels, IChatCompletionMessage, LLM } from '../llm';
import Logger from '../utils/logger';
import { chunkSchema, getSubSchema } from '../utils/openapi/chunk-schema';
import { deepenSchema } from '../utils/openapi/deepen-schema';
import { mergeSchema } from '../utils/openapi/merge-schema';
import { t } from '../utils/template';

export default class ExternalResourceEvaluator {
  constructor(
    public logger: Logger,
    public llm: LLM<any>,
  ) {}

  async isFeasible(
    params: OperationMetdata & {
      requestSchema: {
        body?: JSONSchema7;
        query?: JSONSchema7;
        path?: JSONSchema7;
      };
    },
  ) {
    const message = t(
      [
        objectivePrefix(params),
        'I want to check if this API is the right choice for the task:',
        operationPrefix(params, true),
        '{{#if bodySchema}}body schema: {{bodySchema}}{{/if}}',
        '{{#if querySchema}}query params schema: {{querySchema}}{{/if}}',
        '{{#if pathSchema}}path params schema: {{pathSchema}}{{/if}}',
        'The schemas provided are partial. The description provided may not convey full meaning.',
        'This is preliminary feasibility check, you will have access to more data later - keep it loose',
      ],
      {
        bodySchema: JSON.stringify(params.requestSchema.body),
        querySchema: JSON.stringify(params.requestSchema.query),
        pathSchema: JSON.stringify(params.requestSchema.path),
      },
    );

    const { is_correct } = await this.llm.generateStructured({
      messages: [
        {
          content: message,
          role: 'user',
        },
      ],
      model: ChatCompletionModels.trivial,
      generatorName: 'respond',
      generatorDescription: 'Did the user pick the right API?',
      generatorOutputSchema: Zod.object({
        is_correct: Zod.boolean(),
      }),
    });

    return is_correct;
  }

  async filterInputSchema(
    params: OperationMetdata & {
      requiredInputSchema?: JSONSchema7;
      inputSchema?: JSONSchema7;
    },
  ) {
    let filteredSchema = params.requiredInputSchema ?? {};
    const chunks = chunkSchema(params.inputSchema ?? {});

    for (const { schema: chunkSchema, propertyNames } of chunks) {
      if (propertyNames.length === 0) continue;

      const messages: IChatCompletionMessage[] = [
        {
          role: 'system',
          content: t([
            "Your task is to identify and shortlist properties from the JSON schema that are relevant to the user's objective.",
            'For instance, if the objective is "list emails for label `work`", and the JSON schema has properties like email, date, limit, label, etc.,',
            'you should shortlist the "label" property because it is specifically referred to in the objective.',
            'Avoid shortlisting properties that are not directly referred to in the objective or required by the schema, such as "email", "date", or "limit".',
          ]),
        },
        {
          role: 'user',
          content: t(
            [
              objectivePrefix(params),
              operationPrefix(params),
              'The current request includes the following schema:',
              '```{{filteredSchema}}```',
              'Your task is to shortlist the properties from the following JSONSchema that are relevant to achieving the objective:',
              '```{{chunkSchema}}```',
              'A property is considered relevant if:',
              '- It is referred to in the objective',
              '- It is required by the JSON schema',
              '- Its values are mentioned in the objective or context',
              'A property is considered irrelevant if:',
              '- It is not required by the objective or JSON schema',
              '- Its values are not mentioned in the objective or context',
              'Remember to provide specific evidence for each shortlisted property. The evidence should refer to the objective or schema.',
            ],
            {
              filteredSchema: JSON.stringify(filteredSchema),
              chunkSchema: JSON.stringify(chunkSchema),
            },
          ),
        },
      ];

      const { shortlist } = await this.llm.generateStructured({
        messages: messages,
        model: ChatCompletionModels.critical,
        generatorName: 'shortlist_properties',
        generatorDescription:
          'Identify and shortlist properties from the JSON schema that are relevant to the user objective',
        generatorOutputSchema: Zod.object({
          shortlist: Zod.array(
            Zod.object({
              propertyName: Zod.enum(propertyNames as [string]),
              evidence: Zod.string().describe(
                'Provide a specific reason from the objective or schema that justifies the relevance of this property.',
              ),
            }),
          ).min(0),
        }),
      });

      await this.logger.log('input shortlist', shortlist, chunkSchema);

      const subSchema = getSubSchema(
        chunkSchema,
        shortlist.map((s) => s.propertyName),
      );
      filteredSchema = mergeSchema(filteredSchema, subSchema);
    }
    filteredSchema = deepenSchema(params.inputSchema ?? {}, filteredSchema);

    return filteredSchema;
  }
}
