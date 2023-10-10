import { encode } from 'gpt-3-encoder';
import { JSONSchema7 } from 'json-schema';
import compact from 'lodash/compact';
import intersection from 'lodash/intersection';
import objecthash from 'object-hash';
import { OpenAPI, OpenAPIV2, OpenAPIV3, OpenAPIV3_1 } from 'openapi-types';
import Zod from 'zod';

import VectorStoreCollection from '~/embeddings/Collection';
import { createEmbeddings } from '~/embeddings/index';
import { IVectorStoreItem } from '~/embeddings/Item';
import EmbeddingStore from '~/embeddings/Store';
import vectorStore from '~/embeddings/vector-store';
import Parser, { objectivePrefix } from '~/agent/index';
import { ChatCompletionModels } from '~/chat-completion/base';

import { EmbeddingsTable } from '~/utils/kysley';
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
  private embeddingStore: EmbeddingStore;

  constructor(parser: Parser) {
    this.parser = parser;
    this.embeddingStore = new EmbeddingStore();
  }

  embed = async (api: OpenAPI.Document) => {
    console.log('embed called with openapi');

    // <keywords>: [<api1>, <api2>]
    const pathMapping = new Map<string, Set<string>>();
    const collection = await vectorStore.findOrCreateCollection('openapi');

    // Iterate over all paths in the API
    for (const path in api.paths) {
      // Iterate over all HTTP methods for the current path
      for (const httpMethod of intersection(
        Object.values(OpenAPIV2.HttpMethods),
        Object.keys(api.paths[path]!),
      )) {
        const fullPath = [api.info.title, path, httpMethod].join('#');

        const operationObject = $deref(
          dereferencePath(
            api as OpenAPIV3.Document,
            httpMethod as OpenAPIV2.HttpMethods,
            path,
          ) as OperationObject,
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

    // Process keys in batches
    await this.processKeysInBatches(pathMapping, api, collection);

    console.log('All done with embedding, completed without errors.');
  };

  private async processKeysInBatches(
    pathMapping: Map<string, Set<string>>,
    api: OpenAPI.Document,
    collection: VectorStoreCollection,
  ) {
    const allKeys = Array.from(pathMapping.keys());
    const batchSize = 1000;

    // Process keys in batches
    for (let i = 0; i < allKeys.length; i += batchSize) {
      const batchKeys = allKeys.slice(i, i + batchSize).filter((key) => !!key);

      // Create a map of trimmed keys to original keys
      const trimmedToOriginalKeyMap = Object.fromEntries(
        batchKeys.map((originalKey) => {
          let trimmedKey = originalKey;
          while (encode(trimmedKey).length > 8000) {
            trimmedKey = trimmedKey.slice(0, -100);
          }
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
      const storedEmbeddings = await this.embeddingStore.retrieveEmbeddings(
        Object.keys(trimmedToOriginalKeyMap),
      );

      // Determine which keys need to be embedded
      const keysToEmbed = getKeysToEmbed(
        trimmedToOriginalKeyMap,
        storedEmbeddings,
        metadataHashMap,
      );

      // Create vector store items and embeddings to store
      const vectorStoreItems: IVectorStoreItem[] = [];
      const embeddingsToStore: EmbeddingsTable[] = [];

      const embeddings = await createEmbeddings(keysToEmbed);

      for (const trimmedKey of Object.keys(trimmedToOriginalKeyMap)) {
        if (keysToEmbed.includes(trimmedKey)) {
          const embedding = storedEmbeddings.find(
            (embedding) => embedding.input === trimmedKey,
          );
          if (embedding) {
            vectorStoreItems.push({
              id: trimmedKey,
              embeddings: embedding.vectors,
              metadata: metadataMap[trimmedKey],
            });
          }

          embeddingsToStore.push({
            input: trimmedKey,
            vectors: JSON.stringify(embeddings[trimmedKey]),
            metadata_object_hash: metadataHashMap[trimmedKey],
          });
        }

        vectorStoreItems.push({
          id: trimmedKey,
          embeddings:
            embeddings[trimmedKey] ??
            storedEmbeddings.find(({ input }) => input === trimmedKey)?.vectors,
          metadata: metadataMap[trimmedKey],
        });
      }

      // Store embeddings and create vector store items
      await this.embeddingStore.storeEmbeddings(embeddingsToStore);
      await vectorStore.createItems(collection, vectorStoreItems);
    }
  }

  search = async (objective: string, providers: string[]) => {
    console.log('search called with objective:', objective);

    const collection = await vectorStore.findOrCreateCollection('openapi');
    console.log('Collection created or fetched:', collection);

    const embedding = await createEmbeddings(objective);
    console.log('Created embedding for objective:', embedding);

    const matches = await vectorStore.queryItems(
      collection,
      embedding,
      providers.length > 1
        ? {
            $or: providers.map((provider) => ({
              provider: {
                $eq: provider,
              },
            })),
          }
        : {
            provider: {
              $eq: providers[0],
            },
          },
    );
    console.log('Found matches:', matches);

    const pathScores: Map<string, number> = new Map();

    for (const match of matches) {
      const matchPaths = JSON.parse((match.metadata?.paths as string) ?? '[]');

      for (const path of matchPaths) {
        const score = pathScores.get(path) ?? 0;
        pathScores.set(path, score + (1 - match.distance));
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
        description:
          operationObject.description ??
          operationObject.summary ??
          operationObject.operationId ??
          match,
      });
    }

    const matchesStr = matchDetails.map(
      ({ provider, method, path, description }) => {
        return `${provider}: ${method.toUpperCase()} ${path}\n'${description}'`;
      },
    );

    const message = t(
      [
        ...objectivePrefix({ objective, context }),
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

    const { indexes } = await this.parser.chatCompletion.generateStructured({
      model: ChatCompletionModels.critical,
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
): Record<string, any> {
  return Object.fromEntries(
    Object.entries(trimmedToOriginalKeyMap).map(([trimmedKey, originalKey]) => [
      trimmedKey,
      {
        paths: JSON.stringify(Array.from(pathMapping.get(originalKey)!)),
        provider: api.info.title,
      },
    ]),
  );
}

function createMetadataHashMap(
  metadataMap: Record<string, any>,
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
  storedEmbeddings: any[],
  metadataHashMap: Record<string, string>,
): string[] {
  return Object.keys(trimmedToOriginalKeyMap).filter((key) => {
    if (!key) return false;

    const storedEmbedding = storedEmbeddings.find(
      (embedding) => embedding.input === key,
    );
    if (storedEmbedding) {
      const hash = metadataHashMap[key];
      if (storedEmbedding.metadata_object_hash === hash) {
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
