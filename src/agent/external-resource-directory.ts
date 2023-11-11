import compact from 'lodash/compact';
import objecthash from 'object-hash';
import { OpenAPI, OpenAPIV2 } from 'openapi-types';
import { stripHtml } from 'string-strip-html';
import { JsonObject } from 'type-fest';
import Zod from 'zod';

import { objectivePrefix } from '../agent/index';
import { EmbeddingFunctions, StorableInterveneParserItem } from '../embeddings';
import { ChatCompletionModels, LLM } from '../llm';
import { ALPHABET } from '../utils/alphabet';
import Logger from '../utils/logger';
import { dereferencePath } from '../utils/openapi/dereference-path';
import {
  extractOperationSchemas,
  getOauthSecuritySchemeName,
  getOperationScopes,
} from '../utils/openapi/operation';
import { extractRequiredSchema } from '../utils/openapi/required-schema';
import { OpenAPITokenizer, TokenMap } from '../utils/openapi/tokenizer';
import { t } from '../utils/template';

export type OperationPath = string & {
  ____: never;
  split(separator: '|'): [string, string, OpenAPIV2.HttpMethods];
  split(separator: string): string[];
};

export type APIMatch = {
  apiSpecId: string;
  scopes: string[];
  httpMethod: OpenAPIV2.HttpMethods;
  path: string;
  description: string;
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
  embed = async (api: OpenAPI.Document, id: string) => {
    await this.logger.log('Preparing embedding items for the openapi spec');

    const tokenizer = new OpenAPITokenizer(id, api);
    const tokenMap = await tokenizer.tokenize();

    await this.logger.log(
      `Embedding OpenAPI specs... ${tokenMap.size} items to embed`,
    );

    // Process keys in batches
    await this.processKeysInBatches(tokenMap);

    await this.logger.log('All done with embedding, completed without errors.');
  };

  private async processKeysInBatches(tokenMap: TokenMap) {
    const itemIds = Array.from(tokenMap.keys());
    const batchSize = 1000;

    // Process keys in batches
    for (let i = 0; i < itemIds.length; i += batchSize) {
      const idsBatch = itemIds.slice(i, i + batchSize).filter((key) => !!key);

      // Retrieve stored embeddings
      const storedEmbeddings =
        await this.embeddingFunctions.retrieveItems(idsBatch);
      const existingItemIds = storedEmbeddings.map((embedding) => embedding.id);

      // Determine which keys need to be embedded
      const idsToEmbed = idsBatch.filter((id) => !existingItemIds.includes(id));
      const tokensToEmbed = idsToEmbed
        .map((id) => tokenMap.get(id)!.tokens)
        .filter((t) => !!t);

      const embeddingsToStore: StorableInterveneParserItem[] = [];

      await this.logger.log('Embedding', tokensToEmbed.length, 'keys');
      const embeddingsResponse = tokensToEmbed.length
        ? await this.embeddingFunctions.createEmbeddings(tokensToEmbed)
        : [];
      const embeddingsMap = Object.fromEntries(embeddingsResponse);

      for (const id of idsToEmbed) {
        const item = tokenMap.get(id)!;
        const embedding = embeddingsMap[item.tokens];

        const metadata = {
          paths: Array.from(tokenMap.get(id)!.paths),
          scopes: Array.from(tokenMap.get(id)!.scopes),
          apiSpecId: tokenMap.get(id)!.apiSpecId,
          tokens: item.tokens,
        };

        embeddingsToStore.push({
          id: id,
          embeddings: embedding,
          metadataHash: objecthash(metadata),
          metadata,
        });
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
   * @param scopes the scopes available to the user
   * @param objective the objective to accomplish
   * @param context the context of the objective
   */
  identify = async (
    apiMap: Record<string, OpenAPI.Document>,
    scopes: string[],
    objective: string,
    context: JsonObject | null,
  ): Promise<APIMatch[]> => {
    const matches = await this.query(apiMap, scopes, objective);
    await this.logger.log('Matches:', matches);
    const shortlist = await this.shortlist(matches, apiMap, context, objective);
    await this.logger.log('Shortlist:', shortlist);

    return shortlist;
  };

  private query = async (
    apiMap: Record<string, OpenAPI.Document>,
    scopes: string[],
    objective: string,
  ): Promise<APIMatch[]> => {
    const { shortObjective } = await this.llm.generateStructured({
      messages: [
        {
          content: t(
            [
              'My client told me to do this: ',
              '```{{objective}}```',
              'Help me summarize the task in a paragarh so that I can create a line item in the invoice',
              'Rules:',
              '1. It should be generic enough so that similar tasks can be combined.',
              '2. It should not have any data specific to the task. Replace the data with their description.',
            ],
            { objective },
          ),
          role: 'user',
        },
      ],
      model: ChatCompletionModels.trivial,
      generatorName: 'summary_generator',
      generatorDescription: 'The summary of the given task',
      generatorOutputSchema: Zod.object({
        shortObjective: Zod.string(),
      }),
    });

    await this.logger.info('Vector search called:', {
      shortObjective,
      scopes,
    });

    const embedding = await this.embeddingFunctions.createEmbeddings([
      shortObjective,
    ]);

    const matches = await this.embeddingFunctions.searchItems(
      shortObjective,
      embedding[0][1],
      20,
      {
        scopes: {
          $in: scopes,
        },
      },
    );

    const pathScores: Map<string, number> = new Map();
    const pathScopeMap = new Map<string, string[]>();

    // Iterate over each match
    for (const match of matches) {
      const matchPaths = match.metadata?.paths;

      // Iterate over each path in the match
      for (const path of matchPaths) {
        const [apiSpecId, urlPath, httpMethod] = path.split('|');
        const openapi = apiMap[apiSpecId];
        const oauthSecuritySchemeName = getOauthSecuritySchemeName(openapi);
        const pathScopes = getOperationScopes(
          apiSpecId,
          openapi.paths![urlPath]![httpMethod]!,
          oauthSecuritySchemeName,
        );
        const matchedScopes = scopes.filter((scope) =>
          pathScopes.includes(scope),
        );
        if (!matchedScopes.length) continue;

        // Get the current score of the path or default to 0 if it doesn't exist
        const score = pathScores.get(path) ?? 0;
        // Update the score of the path
        pathScores.set(path, score + (1 - (match.distance ?? 0)));
        pathScopeMap.set(path, matchedScopes);
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
        const [apiSpecId, pathName, httpMethod] = path.split('|');
        const operationObject =
          apiMap[apiSpecId].paths?.[pathName]?.[httpMethod];

        if (!operationObject) return;

        const description =
          operationObject.description ??
          operationObject.summary ??
          operationObject.operationId ??
          path;

        return {
          apiSpecId,
          scopes: pathScopeMap.get(path)!,
          httpMethod: httpMethod,
          path: pathName,
          description,
        } satisfies APIMatch;
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
      const openapi = apiMap[match.apiSpecId];
      const operationObject = openapi?.paths?.[match.path]?.[match.httpMethod];
      if (!operationObject) continue;

      matchDetails.push({
        provider: openapi.info.title,
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
