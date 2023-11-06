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
        'I want to check feasibility of the following external resource to achieve the objective:',
        operationPrefix(params, true),
        '{{#if bodySchema}}body schema: {{bodySchema}}{{/if}}',
        '{{#if querySchema}}query params schema: {{querySchema}}{{/if}}',
        '{{#if pathSchema}}path params schema: {{pathSchema}}{{/if}}',
        'Did I pick an inappropriate external resource for the job?',
        'The schemas provided are partial. The description provided will not convey full meaning.',
        'This is preliminary feasibility check, you will have access to more data later - keep it loose',
      ],
      {
        bodySchema: JSON.stringify(params.requestSchema.body),
        querySchema: JSON.stringify(params.requestSchema.query),
        pathSchema: JSON.stringify(params.requestSchema.path),
      },
    );

    const { is_this_the_right_external_resource, reason } =
      await this.llm.generateStructured({
        messages: [
          {
            content: message,
            role: 'user',
          },
        ],
        generatorName: 'did_the_user_pick_inappropriate_external_resource',
        generatorDescription:
          'Did the user pick the inappropriate external resource?',
        generatorOutputSchema: Zod.object({
          is_this_the_right_external_resource: Zod.boolean().describe(
            'true if the chosen resource is inappropriate, false if it is appropriate',
          ),
          reason: Zod.string()
            .describe(
              'reason why the resource is not correct, need to be a valid reason',
            )
            .min(10),
        }),
      });

    return [!is_this_the_right_external_resource, reason] as const;
  }

  async filterInputSchemas(
    params: OperationMetdata & {
      requestSchema: {
        body?: JSONSchema7;
        query?: JSONSchema7;
        path?: JSONSchema7;
        required: {
          body?: JSONSchema7;
          query?: JSONSchema7;
          path?: JSONSchema7;
        };
      };
    },
  ) {
    const filterPromises = (
      await Promise.allSettled([
        await this.filterInputSchema({
          ...params,
          requiredInputSchema: params.requestSchema.required.body,
          inputSchema: params.requestSchema.body,
        }),
        await this.filterInputSchema({
          ...params,
          requiredInputSchema: params.requestSchema.required.query,
          inputSchema: params.requestSchema.query,
        }),
        await this.filterInputSchema({
          ...params,
          requiredInputSchema: params.requestSchema.required.path,
          inputSchema: params.requestSchema.path,
        }),
      ])
    ).map((result) => {
      if (result.status === 'rejected')
        throw `couldnt shortlist input, error ${result.reason}`;

      return result.value;
    });

    return {
      body: filterPromises[0],
      query: filterPromises[1],
      path: filterPromises[2],
    };
  }

  private async filterInputSchema(
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
