import { JSONSchema7 } from 'json-schema';
import Zod from 'zod';

import {
  objectivePrefix,
  OperationMetdata,
  operationPrefix,
} from '../agent/index';
import { LLM } from '../llm';
import Logger from '../utils/logger';
import { chunkSchema, getSubSchema } from '../utils/openapi/chunk-schema';
import { deepenSchema, shallowSchema } from '../utils/openapi/deepen-schema';
import { mergeSchema } from '../utils/openapi/merge-schema';
import { t } from '../utils/template';

export default class ContextProcessor {
  constructor(
    public logger: Logger,
    public llm: LLM<any>,
  ) {}

  async filter(
    params: OperationMetdata & {
      inputSchema: {
        body: JSONSchema7;
        query: JSONSchema7;
        path: JSONSchema7;
      };
    },
  ) {
    const contextShortlist = (
      await Promise.allSettled([
        await this.shortlist({
          ...params,
          inputSchema: params.inputSchema.body,
        }),
        await this.shortlist({
          ...params,
          inputSchema: params.inputSchema.query,
        }),
        await this.shortlist({
          ...params,
          inputSchema: params.inputSchema.path,
        }),
      ])
    ).map((result) => {
      if (result.status === 'rejected')
        throw `couldnt shortlist context, error ${result.reason}`;

      return result.value;
    });

    const filteredContextForBody = await this.filterSchema({
      ...params,
      inputSchema: params.inputSchema.body,
      contextShortlist: contextShortlist[0],
    });
    const filteredContextForQuery = await this.filterSchema({
      ...params,
      inputSchema: params.inputSchema.query,
      contextShortlist: contextShortlist[1],
    });
    const filteredContextForPath = await this.filterSchema({
      ...params,
      inputSchema: params.inputSchema.path,
      contextShortlist: contextShortlist[2],
    });

    return {
      filteredContextForBody,
      filteredContextForQuery,
      filteredContextForPath,
    };
  }

  private async filterSchema(
    params: OperationMetdata & {
      inputSchema: JSONSchema7;
      contextShortlist: string[];
    },
  ) {
    const filteredContext: Record<string, JSONSchema7> = {};

    for (const key of params.contextShortlist) {
      let filteredSchema = shallowSchema(params.context?.[key]);
      const chunks = chunkSchema(params.context?.[key], true);

      for (const { schema: chunkSchema, propertyNames } of chunks) {
        if (!propertyNames.length) {
          filteredSchema = mergeSchema(filteredSchema, chunkSchema);
          continue;
        }

        const { shortlist } = await this.llm.generateStructured({
          messages: [
            {
              role: 'user',
              content: t(
                [
                  objectivePrefix(params, false),
                  operationPrefix(params),
                  'And I came up with this input JSON schema to the resource:',
                  '```{{inputSchema}}```',
                  'Here is a JSON schema of a variable named `{{key}}`:',
                  '```{{chunkSchema}}```',
                  "Your task is to shortlist a conservative set of properties from {{key}}'s" +
                    ' JSON schema which may be relevant to generate an input compliant to the input schema.',
                ],
                {
                  inputSchema: JSON.stringify(params.inputSchema),
                  key,
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
        });

        const subSchema = getSubSchema(chunkSchema, shortlist);
        filteredSchema = mergeSchema(filteredSchema, subSchema);
      }

      filteredContext[key] = deepenSchema(params.context[key], filteredSchema);
    }

    return filteredContext;
  }

  private async shortlist(
    params: OperationMetdata & {
      inputSchema: JSONSchema7;
    },
  ) {
    if (!params.context || Object.keys(params.context).length === 0) {
      return [];
    }

    const { shortlist } = await this.llm.generateStructured({
      messages: [
        {
          role: 'user',
          content: t(
            [
              objectivePrefix(params),
              operationPrefix(params),
              'And this is the input JSON schema to the resource:',
              '```{{inputSchema}}```',
            ],
            {
              description: params.description,
              inputSchema: JSON.stringify(params.inputSchema),
            },
          ),
        },
      ],
      generatorName: 'shortlist_context',
      generatorDescription:
        'Shortlist context datum that are relevant given the objective',
      generatorOutputSchema: Zod.object({
        shortlist: Zod.array(Zod.enum(Object.keys(params.context) as [string])),
      }),
    });

    return shortlist;
  }
}
