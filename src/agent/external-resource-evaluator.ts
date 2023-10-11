import { JSONSchema7 } from 'json-schema';
import Zod from 'zod';

import Parser, {
  objectivePrefix,
  OperationMetdata,
  operationPrefix,
} from '~/agent/index';

import { stringifyContext } from '~/utils/context';
import { chunkSchema, getSubSchema } from '~/utils/openapi/chunk-schema';
import { deepenSchema } from '~/utils/openapi/deepen-schema';
import { mergeSchema } from '~/utils/openapi/merge-schema';
import { t } from '~/utils/template';

export default class ExternalResourceEvaluator {
  private parser: Parser;

  constructor(parser: Parser) {
    this.parser = parser;
  }

  async isFeasible(
    params: OperationMetdata & {
      requiredInputSchema: {
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
        bodySchema: JSON.stringify(params.requiredInputSchema.body),
        querySchema: JSON.stringify(params.requiredInputSchema.query),
        pathSchema: JSON.stringify(params.requiredInputSchema.path),
        context: stringifyContext(params.context),
      },
    );

    const { is_this_the_right_external_resource, reason } =
      await this.parser.chatCompletion.generateStructured({
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
      requiredInputSchema: {
        body?: JSONSchema7;
        query?: JSONSchema7;
        path?: JSONSchema7;
      };
      inputSchema: {
        body?: JSONSchema7;
        query?: JSONSchema7;
        path?: JSONSchema7;
      };
    },
  ) {
    return {
      body: await this.filterInputSchema({
        ...params,
        requiredInputSchema: params.requiredInputSchema.body,
        inputSchema: params.inputSchema.body,
      }),
      query: await this.filterInputSchema({
        ...params,
        requiredInputSchema: params.requiredInputSchema.query,
        inputSchema: params.inputSchema.query,
      }),
      path: await this.filterInputSchema({
        ...params,
        requiredInputSchema: params.requiredInputSchema.path,
        inputSchema: params.inputSchema.path,
      }),
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
      const { shortlist } = await this.parser.chatCompletion.generateStructured(
        {
          messages: [
            {
              role: 'user',
              content: t(
                [
                  objectivePrefix(params, false),
                  operationPrefix(params),
                  'And I came up with this input to the resource:',
                  '```{{filteredSchema}}```',
                  'Your task is to shortlist properties that may be relevant to achieve the objective.',
                  'You must choose from the following JSONSchema:',
                  '```{{chunkSchema}}```',
                ],
                {
                  filteredSchema: JSON.stringify(filteredSchema),
                  chunkSchema: JSON.stringify(chunkSchema),
                },
              ),
            },
          ],
          generatorName: 'shortlist_properties',
          generatorDescription:
            'Shortlist properties that are relevant given the objective',
          generatorOutputSchema: Zod.object({
            shortlist: Zod.array(Zod.enum(propertyNames as [string])),
          }),
        },
      );

      const subSchema = getSubSchema(chunkSchema, shortlist);
      filteredSchema = mergeSchema(filteredSchema, subSchema);
    }
    filteredSchema = deepenSchema(params.inputSchema ?? {}, filteredSchema);

    return filteredSchema;
  }
}
