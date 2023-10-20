import { encode } from 'gpt-tokenizer';
import { JSONSchema7 } from 'json-schema';
import compact from 'lodash/compact';
import intersection from 'lodash/intersection';
import objecthash from 'object-hash';
import { OpenAPI, OpenAPIV2, OpenAPIV3, OpenAPIV3_1 } from 'openapi-types';
import { stripHtml } from 'string-strip-html';
import Zod from 'zod';

import Parser, { objectivePrefix } from '~/agent/index';
import {
  EmbeddingFunctions,
  InterveneParserItemMetadata,
  StorableInterveneParserItem,
} from '~/embeddings';
import Logger from '~/utils/logger';
import { $deref, OperationObject } from '~/utils/openapi';
import { getDefaultContentType } from '~/utils/openapi/content-type';
import { dereferencePath } from '~/utils/openapi/dereference-path';
import { t } from '~/utils/template';

export type ExternalResourcePath = string & {
  ____: never;
  split(separator: '#'): [string, string, OpenAPIV2.HttpMethods];
  split(separator: string): string[];
};

export default class ExternalResourceDirectory {
  private parser: Parser;
  private embeddingFunctions: EmbeddingFunctions;
  private logger: Logger;

  constructor(parser: Parser, embeddingFunctions: EmbeddingFunctions) {
    this.embeddingFunctions = embeddingFunctions;
    this.parser = parser;
    this.logger = parser.logger;
  }

  embed = async (api: OpenAPI.Document) => {
    this.logger.log('Preparing OpenAPI specs for embedding');

    // <keywords>: [<api1>, <api2>]
    const pathMapping = new Map<string, Set<string>>();

    // Iterate over all paths in the API
    for (const path in api.paths) {
      // Iterate over all HTTP methods for the current path
      for (const httpMethod of intersection(
        Object.values(OpenAPIV2.HttpMethods),
        Object.keys(api.paths[path]!),
      )) {
        const fullPath = [api.info.title, path, httpMethod].join('#');

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

    this.logger.log(
      'Embedding OpenAPI specs... (This might take a while for Pinecone)',
    );

    // Process keys in batches
    await this.processKeysInBatches(pathMapping, api);

    this.logger.log('All done with embedding, completed without errors.');
  };

  private async processKeysInBatches(
    pathMapping: Map<string, Set<string>>,
    api: OpenAPI.Document,
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
        api,
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

      this.logger.log('Embedding', keysToEmbed.length, 'keys');
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

      this.logger.log(
        'Storing',
        embeddingsToStore.length,
        'embeddings to store',
      );

      await this.embeddingFunctions.upsertItems(embeddingsToStore);
    }
  }

  search = async (objective: string, providers: string[]) => {
    this.logger.info('Search called with objective:', objective);

    const embedding = await this.embeddingFunctions.createEmbeddings([
      objective,
    ]);

    const matches = await this.embeddingFunctions.searchItems(
      objective,
      embedding[0][1],
      10,
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

    for (const match of matches) {
      const matchPaths = match.metadata?.paths;

      for (const path of matchPaths) {
        const score = pathScores.get(path) ?? 0;
        pathScores.set(path, score + (1 - (match.distance ?? 0)));
      }
    }

    const sortedPaths = Array.from(pathScores.entries()).sort(
      (a, b) => b[1] - a[1],
    );

    return sortedPaths
      .map((entry) => entry[0])
      .splice(0, 15) as ExternalResourcePath[];
  };

  shortlist = async (
    objective: string,
    context: Record<string, JSONSchema7>,
    openapis: OpenAPI.Document[],
  ) => {
    const providers = openapis.map((openapi) => openapi.info.title);

    const matches = await this.search(objective, providers);
    const matchDetails: {
      provider: string;
      method: OpenAPIV2.HttpMethods;
      path: string;
      description: string;
    }[] = [];

    for (const match of matches) {
      const [provider, path, method] = match.split('#');

      const openapi = openapis.find((o) => o.info.title === provider);
      const operationObject = openapi?.paths?.[path]?.[method];
      if (!operationObject) continue;

      matchDetails.push({
        provider,
        method,
        path,
        description: stripHtml(
          operationObject.description ??
            operationObject.summary ??
            operationObject.operationId ??
            match,
        ).result,
      });
    }

    const matchesStr = matchDetails.map(
      ({ provider, method, path, description }) => {
        return `${provider}: ${method.toUpperCase()} ${path}\n'${description}'`;
      },
    );

    const message = t(
      [
        objectivePrefix({ objective, context }),
        'I want to figure out what external resources (APIs) need to be called to achieve this objective.',
        'Your task is to shortlist APIs for me, here is the list:',
        '{{#each matchesStr}}',
        '{{@index}}. {{this}}',
        '{{/each}}',
        'Rules:',
        '1. It is important that you take note of the index.',
        '2. You must choose at lest one API.',
        '3. You can choose multiple APIs.',
        '4. Keep the list liberal.',
        '5. The order of the list matters, start with the best fit.',
      ],
      {
        matchesStr,
      },
    );

    this.logger.log('Asking LLMs to shortlist the correct APIs');

    const { indexes } = await this.parser.llm.generateStructured({
      messages: [
        {
          content: message,
          role: 'user',
        },
      ],
      generatorName: 'api_shortlist',
      generatorDescription:
        'Shortlist APIs that might work out for the objective.',
      generatorOutputSchema: Zod.object({
        indexes: Zod.array(
          Zod.number()
            .min(0)
            .max(matchesStr.length - 1)
            .describe('The index of API in the given list'),
        ),
      }),
    });

    return matchDetails.filter((_, index) => {
      return indexes.includes(index);
    });
  };
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
  operationObject: any,
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
        properties ||= $deref(requestBodySchema.items[0]).properties;
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
  operationObject: any,
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
  api: OpenAPI.Document,
): Record<string, InterveneParserItemMetadata> {
  return Object.fromEntries(
    Object.entries(trimmedToOriginalKeyMap).map(([trimmedKey, originalKey]) => [
      trimmedKey,
      {
        paths: Array.from(pathMapping.get(originalKey)!),
        provider: api.info.title,
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
