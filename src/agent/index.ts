import { JSONSchema7 } from 'json-schema';
import { OpenAPI } from 'openapi-types';
import { JsonObject } from 'type-fest';

import CodeGenerator, { CodeGenLanguage } from '../agent/code-gen';
import ContextProcessor from '../agent/context-processor';
import ExternalResourceDirectory from '../agent/external-resource-directory';
import ExternalResourceEvaluator from '../agent/external-resource-evaluator';
import { EmbeddingFunctions } from '../embeddings';
import { LLM } from '../llm';
import { stringifyContext } from '../utils/context';
import Logger from '../utils/logger';
import { dereferencePath } from '../utils/openapi/dereference-path';
import { extractRequiredSchema } from '../utils/openapi/required-schema';
import { t } from '../utils/template';

export const objectivePrefix = (
  params: Pick<OperationMetdata, 'objective' | 'context'>,
  withContext = true,
) =>
  t(
    [
      'I am a backend engineer. I want to make an API call to achieve the following objective:',
      '```{{objective}}```.',
      '{{#if showContext}}Here is some historical context in JSON: ```{{context}}```{{/if}}',
    ],
    {
      ...params,
      context: stringifyContext(params.context),
      showContext:
        withContext && params.context && !!Object.keys(params.context).length,
    },
  );

export const operationPrefix = (
  params: Pick<
    OperationMetdata,
    'provider' | 'path' | 'httpMethod' | 'description'
  >,
  skipFirstLine = false,
) =>
  t(
    [
      skipFirstLine ? '' : 'Chosen API:',
      'Provider: {{provider}}',
      'Path: {{path}}',
      'Method: {{httpMethod}}',
      '{{#if description}}Description: {{description}}{{/if}}',
    ],
    params,
  );

export interface OperationMetdata {
  objective: string;
  context: JsonObject | null;
  provider: string;
  path: string;
  httpMethod: string;
  description: string;
}

export default class Parser {
  externalResourceDirectory: ExternalResourceDirectory;
  externalResourceEvaluator: ExternalResourceEvaluator;
  contextProcessor: ContextProcessor;
  codeGen: CodeGenerator;
  logger: Logger;

  constructor(args: {
    llm: LLM<any>;
    logger: Logger;
    language?: CodeGenLanguage;
    embeddingFunctions: EmbeddingFunctions;
  }) {
    const { language = CodeGenLanguage.javascript, embeddingFunctions } = args;

    this.logger = args.logger;

    this.externalResourceDirectory = new ExternalResourceDirectory(
      args.logger,
      embeddingFunctions,
      args.llm,
    );
    this.externalResourceEvaluator = new ExternalResourceEvaluator(
      args.logger,
      args.llm,
    );
    this.contextProcessor = new ContextProcessor(args.logger, args.llm);
    this.codeGen = new CodeGenerator(args.logger, args.llm, language);
  }

  parse = async (
    objective: string,
    context: Record<string, JSONSchema7>,
    openAPIs: OpenAPI.Document[],
  ) => {
    const shortlist = await this.externalResourceDirectory.identify(
      objective,
      context,
      openAPIs,
    );

    await this.logger.info('Here are the APIs we are shortlisting for you: \n');
    await this.logger.log(shortlist);

    for (const api of shortlist) {
      const openapi = openAPIs.find((o) => o.info.title === api.provider)!;
      const operationObject = await dereferencePath(
        openapi,
        api.httpMethod,
        api.path,
      );
      if (!operationObject) continue;

      const operationMetadata: OperationMetdata = {
        objective,
        context,
        provider: api.provider,
        path: api.path,
        method: api.httpMethod,
        description: api.description,
      };

      const {
        bodySchema,
        querySchema,
        pathSchema,
        requestContentType,
        responseContentType,
        responseSchema,
      } = operationSchemas(operationObject);
      const requiredBodySchema = extractRequiredSchema(bodySchema);
      const requiredQuerySchema = extractRequiredSchema(querySchema);
      const requiredPathSchema = extractRequiredSchema(pathSchema);

      const [isFeasible, reason] =
        await this.externalResourceEvaluator.isFeasible({
          ...operationMetadata,
          requiredInputSchema: {
            body: requiredBodySchema,
            query: requiredQuerySchema,
            path: requiredPathSchema,
          },
        });

      if (!isFeasible) {
        await this.logger.warn(
          `chosen API (${api.provider}: ${api.httpMethod} ${api.path}) is not feasible, moving on to the next API. reason: '${reason}'`,
        );
        continue;
      }

      await this.logger.log(
        `Chosen API (${api.provider}: ${api.httpMethod} ${api.path}) is feasible, evaluating it further.`,
      );

      await this.logger.log(
        'Narrowing down the parameter schemas for the API...',
      );

      const {
        body: filteredBodySchema,
        query: filteredQuerySchema,
        path: filteredPathSchema,
      } = await this.externalResourceEvaluator.filterInputSchemas({
        ...operationMetadata,
        requiredInputSchema: {
          body: requiredBodySchema,
          query: requiredQuerySchema,
          path: requiredPathSchema,
        },
        inputSchema: {
          body: bodySchema,
          query: querySchema,
          path: pathSchema,
        },
      });

      await this.logger.info({
        filteredBodySchema,
        filteredQuerySchema,
        filteredPathSchema,
      });

      await this.logger.log(
        'Narrowing down the historical context that can be used in the API call...',
      );

      const {
        filteredContextForBody,
        filteredContextForQuery,
        filteredContextForPath,
      } = await this.contextProcessor.filter({
        ...operationMetadata,
        inputSchema: {
          body: filteredBodySchema,
          query: filteredQuerySchema,
          path: filteredPathSchema,
        },
      });

      await this.logger.info({
        filteredContextForBody,
        filteredContextForQuery,
        filteredContextForPath,
      });

      await this.logger.log('Generating the input parameters...');

      const generatedCode = (
        await Promise.allSettled([
          this.codeGen.generateInputParamCode({
            ...operationMetadata,
            inputSchema: filteredBodySchema,
            context: filteredContextForBody,
            name: 'body',
          }),
          this.codeGen.generateInputParamCode({
            ...operationMetadata,
            inputSchema: filteredQuerySchema,
            context: filteredContextForQuery,
            name: 'query',
          }),
          this.codeGen.generateInputParamCode({
            ...operationMetadata,
            inputSchema: filteredPathSchema,
            context: filteredContextForPath,
            name: 'path',
          }),
        ])
      ).map((r) => {
        if (r.status === 'rejected')
          throw `couldnt generate code, reason: ${r.reason}`;

        return r.value;
      });

      await this.logger.log(
        `Generating the ${this.codeGen.language} expression...`,
      );

      return {
        provider: api.provider,
        method: api.httpMethod,
        path: api.path,
        bodyParams: generatedCode[0],
        queryParams: generatedCode[1],
        pathParams: generatedCode[2],
        servers: 'servers' in openapi ? openapi.servers : undefined,
        requestContentType,
        responseContentType,
        responseSchema,
      };
    }

    throw 'couldnt find a feasible API';
  };
}
