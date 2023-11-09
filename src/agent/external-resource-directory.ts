import { encode } from 'gpt-tokenizer';
import compact from 'lodash/compact';
import intersection from 'lodash/intersection';
import uniq from 'lodash/uniq';
import objecthash from 'object-hash';
import { OpenAPI, OpenAPIV2, OpenAPIV3, OpenAPIV3_1 } from 'openapi-types';
import { stripHtml } from 'string-strip-html';
import { JsonObject } from 'type-fest';
import Zod from 'zod';

import { objectivePrefix } from '../agent/index';
import {
  EmbeddingFunctions,
  InterveneParserItemMetadata,
  StorableInterveneParserItem,
} from '../embeddings';
import { ChatCompletionModels, LLM } from '../llm';
import { ALPHABET } from '../utils/alphabet';
import Logger from '../utils/logger';
import { $deref, OperationObject } from '../utils/openapi';
import { getDefaultContentType } from '../utils/openapi/content-type';
import { dereferencePath } from '../utils/openapi/dereference-path';
import { extractOperationSchemas } from '../utils/openapi/operation';
import { extractRequiredSchema } from '../utils/openapi/required-schema';
import { t } from '../utils/template';

export type OperationPath = string & {
  ____: never;
  split(separator: '#' | '|'): [string, string, OpenAPIV2.HttpMethods];
  split(separator: string): string[];
};

export type APIMatch = {
  specId: string;
  httpMethod: OpenAPIV2.HttpMethods;
  path: string;
  description: string;
  provider: string;
};

export default class ExternalResourceDirectory {
  constructor(
    public logger: Logger,
    public embeddingFunctions: EmbeddingFunctions,
    public llm: LLM<any>,
  ) {}

  /**
   * @param api the openapi document
   * @param id a unique identifier for the api document
   * @param provider the service provider (product/company) whom this api belongs to
   */
  embed = async (api: OpenAPI.Document, id: string, provider: string) => {
    await this.logger.log('Preparing OpenAPI specs for embedding');

    // <keywords>: [<api1>, <api2>]
    const pathMapping = new Map<string, Set<string>>();

    // Iterate over all paths in the API
    for (const path in api.paths) {
      // Iterate over all HTTP methods for the current path
      for (const httpMethod of intersection(
        Object.values(OpenAPIV2.HttpMethods),
        Object.keys(api.paths[path]!),
      )) {
        const fullPath = [id, path, httpMethod].join('#');

        const operationObject = $deref(
          await dereferencePath(
            api as OpenAPIV3.Document,
            httpMethod as OpenAPIV2.HttpMethods,
            path,
          ),
        )!;

        // Add parameters to keyPathMap
        addParametersToPathMapping(operationObject, pathMapping, fullPath);

        // Add request body properties to keyPathMap
        addRequestBodyPropertiesToPathMapping(
          operationObject,
          pathMapping,
          fullPath,
        );

        // Add operation object to keyPathMap
        addOperationObjectToPathMapping(operationObject, pathMapping, fullPath);
      }
    }

    await this.logger.log(
      'Embedding OpenAPI specs... (This might take a while for Pinecone)',
    );

    // Process keys in batches
    await this.processKeysInBatches(pathMapping, provider);

    await this.logger.log('All done with embedding, completed without errors.');
  };

  private async processKeysInBatches(
    pathMapping: Map<string, Set<string>>,
    provider: string,
  ) {
    const allKeys = Array.from(pathMapping.keys());
    const batchSize = 1000;

    // Process keys in batches
    for (let i = 0; i < allKeys.length; i += batchSize) {
      const batchKeys = allKeys.slice(i, i + batchSize).filter((key) => !!key);

      // Create a map of trimmed keys to original keys
      const trimmedToOriginalKeyMap = Object.fromEntries(
        batchKeys.map((originalKey) => {
          let trimmedKey = stripHtml(originalKey).result;

          while (encode(trimmedKey).length > 8000) {
            trimmedKey = trimmedKey.slice(0, -100);
          }

          // eslint-disable-next-line no-control-regex
          trimmedKey = trimmedKey.replace(/[^\x00-\x7F]/g, '');

          return [trimmedKey, originalKey];
        }),
      );

      // Create metadata map and metadata hash map
      const metadataMap = createMetadataMap(
        trimmedToOriginalKeyMap,
        pathMapping,
        provider,
      );
      const metadataHashMap = createMetadataHashMap(metadataMap);

      // Retrieve stored embeddings
      const storedEmbeddings = await this.embeddingFunctions.retrieveItems(
        Object.keys(trimmedToOriginalKeyMap),
      );

      // Determine which keys need to be embedded
      const keysToEmbed = getKeysToEmbed(
        trimmedToOriginalKeyMap,
        storedEmbeddings,
        metadataHashMap,
      );

      const embeddingsToStore: StorableInterveneParserItem[] = [];

      await this.logger.log('Embedding', keysToEmbed.length, 'keys');
      const embeddingsResponse = keysToEmbed.length
        ? await this.embeddingFunctions.createEmbeddings(keysToEmbed)
        : [];
      const embeddingsMap = Object.fromEntries(embeddingsResponse);

      for (const trimmedKey of Object.keys(trimmedToOriginalKeyMap)) {
        if (keysToEmbed.includes(trimmedKey)) {
          embeddingsToStore.push({
            id: trimmedKey,
            embeddings: embeddingsMap[trimmedKey],
            metadataHash: metadataHashMap[trimmedKey],
            metadata: metadataMap[trimmedKey],
          });
        }
      }

      await this.logger.log(
        'Storing',
        embeddingsToStore.length,
        'embeddings to store',
      );

      await this.embeddingFunctions.upsertItems(embeddingsToStore);
    }
  }

  /**
   *
   * @param apiMap a map of api spec identifier to openapi document
   * @param providerMap a map of api spec identifier to service provider
   * @param objective the objective
   */
  identify = async (
    apiMap: Record<string, OpenAPI.Document>,
    providerMap: Record<string, string>,
    objective: string,
    context: JsonObject | null,
  ): Promise<APIMatch[]> => {
    const matches = await this.query(apiMap, providerMap, objective);
    await this.logger.log('Matches:', matches);
    const shortlist = await this.shortlist(matches, apiMap, context, objective);
    await this.logger.log('Shortlist:', shortlist);

    return shortlist;
  };

  private query = async (
    apiMap: Record<string, OpenAPI.Document>,
    providerMap: Record<string, string>,
    objective: string,
  ): Promise<APIMatch[]> => {
    await this.logger.info('Search called with objective:', objective);
    const providers = uniq(Object.values(providerMap));

    const embedding = await this.embeddingFunctions.createEmbeddings([
      objective,
    ]);

    const matches = await this.embeddingFunctions.searchItems(
      objective,
      embedding[0][1],
      20,
      providers.length > 1
        ? {
            provider: {
              $in: providers,
            },
          }
        : {
            provider: {
              $eq: providers[0],
            },
          },
    );

    const pathScores: Map<string, number> = new Map();

    // Iterate over each match
    for (const match of matches) {
      const matchPaths = match.metadata?.paths;

      // Iterate over each path in the match
      for (const path of matchPaths) {
        // Get the current score of the path or default to 0 if it doesn't exist
        const score = pathScores.get(path) ?? 0;
        // Update the score of the path
        pathScores.set(path, score + (1 - (match.distance ?? 0)));
      }
    }

    // Sort the paths based on their scores
    const sortedPaths = Array.from(pathScores.entries()).sort(
      (a, b) => b[1] - a[1],
    );

    // Get the top 15 paths
    const matchingPaths = sortedPaths
      .map((entry) => entry[0])
      .splice(0, 7) as OperationPath[];

    return compact(
      matchingPaths.map((path) => {
        const [apiSpecId, pathName, httpMethod] = path.split('#');
        const operationObject =
          apiMap[apiSpecId].paths?.[pathName]?.[httpMethod];

        if (!operationObject) return;

        const description =
          operationObject.description ??
          operationObject.summary ??
          operationObject.operationId ??
          path;

        return {
          specId: apiSpecId,
          httpMethod: httpMethod,
          path: pathName,
          description,
          provider: providerMap[apiSpecId],
        } as APIMatch;
      }),
    );
  };

  private shortlist = async (
    matches: APIMatch[],
    apiMap: Record<string, OpenAPI.Document>,
    context: JsonObject | null,
    objective: string,
  ) => {
    const matchDetails: {
      provider: string;
      httpMethod: OpenAPIV2.HttpMethods;
      path: string;
      description: string;
    }[] = [];

    for (const match of matches) {
      const openapi = apiMap[match.specId];
      const operationObject = openapi?.paths?.[match.path]?.[match.httpMethod];
      if (!operationObject) continue;

      matchDetails.push({
        provider: match.provider,
        httpMethod: match.httpMethod,
        path: match.path,
        description: stripHtml(
          operationObject.description ??
            operationObject.summary ??
            operationObject.operationId ??
            match.path,
        ).result,
      });
    }

    const matchesStr = matchDetails.map(
      ({ provider, httpMethod, path, description }) => {
        return `${provider}: ${httpMethod.toUpperCase()} ${path}\n'${description}'`;
      },
    );

    const message = t(
      [
        objectivePrefix({ objective, context }),
        'Your task is to shortlist APIs that can be used to accomplish the objective',
        'Here is a list of possible choices for the API call (in randomized order):',
        '{{#each matchesStr}}',
        '{{getAlphabet @index}}. {{this}}\n',
        '{{/each}}',
        'Your task is to shortlist at most 5 APIs in descending order of fittingness.',
        'Rules:',
        '1. The most probable API should be at the top of the list.',
        '2. You must choose at least one API.',
        '3. Provide reasoning for each choice and how it will help with the objective',
      ],
      {
        matchesStr,
      },
    );

    await this.logger.log('Asking LLMs to shortlist the correct APIs', message);

    const { indexes: shortlistedIndexes } = await this.llm.generateStructured({
      messages: [
        {
          content: message,
          role: 'user',
        },
      ],
      model: ChatCompletionModels.trivial,
      generatorName: 'api_shortlist',
      generatorDescription:
        'Shortlist APIs that might work out for the objective.',
      generatorOutputSchema: Zod.object({
        indexes: Zod.array(
          Zod.object({
            index: Zod.enum(
              ALPHABET.slice(0, matchesStr.length) as [string],
            ).describe('The index of API in the given list'),
            reason: Zod.string().describe(
              'The reasoning for choosing the API, less than 10 words',
            ),
          }),
        ),
      }),
    });
    await this.logger.log('Shortlisted indexes', shortlistedIndexes);

    const filteredMatches: APIMatch[] = [];

    for (const matchI of shortlistedIndexes) {
      const match = matches[ALPHABET.indexOf(matchI.index)];
      if (match) filteredMatches.push(match);
    }

    return filteredMatches;
  };

  async extractOperationComponents(
    api: OpenAPI.Document,
    pathName: string,
    httpMethod: OpenAPIV2.HttpMethods,
  ) {
    const operationObject = await dereferencePath(api, httpMethod, pathName);
    if (!operationObject) {
      throw `Could not find operation object for ${httpMethod.toUpperCase()} ${pathName}`;
    }

    const {
      bodySchema,
      querySchema,
      pathSchema,
      requestContentType,
      responseContentType,
      responseSchema,
    } = extractOperationSchemas(operationObject);

    const requiredBodySchema = extractRequiredSchema(bodySchema);
    const requiredQuerySchema = extractRequiredSchema(querySchema);
    const requiredPathSchema = extractRequiredSchema(pathSchema);

    return {
      operationObject,
      requestSchema: {
        body: bodySchema,
        query: querySchema,
        path: pathSchema,
        contentType: requestContentType,
        required: {
          body: requiredBodySchema,
          query: requiredQuerySchema,
          path: requiredPathSchema,
        },
      },
      response: {
        contentType: responseContentType,
        schema: responseSchema,
      },
    };
  }
}

function addParametersToPathMapping(
  operationObject: OperationObject,
  keyPathMap: Map<string, Set<string>>,
  fullPath: string,
) {
  const parameters = operationObject.parameters?.map((p) => $deref(p)) ?? [];
  for (const parameter of parameters) {
    const key = compact([parameter.name, parameter.description]).join(': ');
    addKeyToPathMapping(key, keyPathMap, fullPath);
  }
}

function addRequestBodyPropertiesToPathMapping(
  operationObject: OperationObject,
  pathMapping: Map<string, Set<string>>,
  fullPath: string,
) {
  const requestBody =
    'requestBody' in operationObject
      ? $deref(operationObject.requestBody)
      : undefined;
  const defaultContentType = getDefaultContentType(
    Object.keys(requestBody?.content ?? []),
  );
  const requestBodySchema = $deref(
    requestBody?.content?.[defaultContentType]?.schema,
  );
  if (requestBodySchema) {
    let properties:
      | OpenAPIV2.SchemaObject['properties']
      | OpenAPIV3.SchemaObject['properties']
      | OpenAPIV3_1.SchemaObject['properties'];
    if (requestBodySchema?.properties) {
      properties = $deref(requestBodySchema.properties);
    }
    if ('items' in requestBodySchema && requestBodySchema.items) {
      if (Array.isArray(requestBodySchema.items)) {
        properties ||= $deref(
          requestBodySchema.items[0] as OpenAPIV3.SchemaObject,
        ).properties;
      } else {
        properties ||= $deref(requestBodySchema.items).properties ?? {};
      }
    }
    properties ||= {};
    for (const propertyName in properties) {
      const property = $deref(properties[propertyName]);
      const key = compact([propertyName, property.description]).join(': ');
      addKeyToPathMapping(key, pathMapping, fullPath);
    }
  }
}

function addOperationObjectToPathMapping(
  operationObject: OperationObject,
  pathMapping: Map<string, Set<string>>,
  fullPath: string,
) {
  const key =
    operationObject.description ??
    operationObject.summary ??
    operationObject.operationId ??
    fullPath;
  addKeyToPathMapping(key, pathMapping, fullPath);
}

function createMetadataMap(
  trimmedToOriginalKeyMap: Record<string, string>,
  pathMapping: Map<string, Set<string>>,
  provider: string,
): Record<string, InterveneParserItemMetadata> {
  return Object.fromEntries(
    Object.entries(trimmedToOriginalKeyMap).map(([trimmedKey, originalKey]) => [
      trimmedKey,
      {
        paths: Array.from(pathMapping.get(originalKey)!),
        provider,
        id: originalKey,
      },
    ]),
  );
}

function createMetadataHashMap(
  metadataMap: Record<string, InterveneParserItemMetadata>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadataMap).map(([trimmedKey, metadata]) => [
      trimmedKey,
      objecthash(metadata),
    ]),
  );
}

function getKeysToEmbed(
  trimmedToOriginalKeyMap: Record<string, string>,
  storedEmbeddings: StorableInterveneParserItem[],
  metadataHashMap: Record<string, string>,
): string[] {
  return Object.keys(trimmedToOriginalKeyMap).filter((key) => {
    if (!key) return false;

    const storedEmbedding = storedEmbeddings.find(
      (embedding) => embedding.id === key,
    );
    if (storedEmbedding) {
      const hash = metadataHashMap[key];
      if (storedEmbedding.metadataHash === hash) {
        return false;
      }
    }
    return true;
  });
}

function addKeyToPathMapping(
  key: string,
  pathMapping: Map<string, Set<string>>,
  fullPath: string,
) {
  if (!pathMapping.has(key)) pathMapping.set(key, new Set<string>());
  pathMapping.get(key)?.add(fullPath);
}
