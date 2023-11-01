import { JSONSchema7 } from 'json-schema';
import { OpenAPI } from 'openapi-types';

import CodeGen, { CodeGenLanguage } from '../agent/code-gen';
import ContextProcessor from '../agent/context-processor';
import ExternalResourceDirectory from '../agent/external-resource-directory';
import ExternalResourceEvaluator from '../agent/external-resource-evaluator';
import { EmbeddingFunctions } from '../embeddings';
import { LLM } from '../llm';
import { stringifyContext } from '../utils/context';
import Logger from '../utils/logger';
import { dereferencePath } from '../utils/openapi/dereference-path';
import { operationSchemas } from '../utils/openapi/operation';
import { extractRequiredSchema } from '../utils/openapi/required-schema';
import { t } from '../utils/template';

export const objectivePrefix = (
  params: Pick<OperationMetdata, 'objective' | 'context'>,
  withContext = true,
) =>
  t(
    [
      "I have this objective: '''{{objective}}'''",
      '{{#if showContext}}I also have some historical contextual data, think of these as variables that can be used to achieve the given objective.',
      'This context is represented as the following JSON schema:',
      '```{{context}}```{{/if}}',
    ],
    {
      ...params,
      context: stringifyContext(params.context),
      showContext: withContext && !!Object.keys(params.context).length,
    },
  );

export const operationPrefix = (
  params: Pick<
    OperationMetdata,
    'provider' | 'path' | 'method' | 'description'
  >,
  skipFirstLine = false,
) =>
  t(
    [
      skipFirstLine ? '' : 'I have decided to call this external resource:',
      'Provider: {{provider}}',
      'HTTP path: {{path}}',
      'HTTP method: {{method}}',
      '{{#if description}}description: {{description}}{{/if}}',
    ],
    params,
  );

export interface OperationMetdata {
  objective: string;
  context: Record<string, any>;
  provider: string;
  path: string;
  method: string;
  description: string;
}

export default class Parser {
  externalResourceDirectory: ExternalResourceDirectory;
  externalResourceEvaluator: ExternalResourceEvaluator;
  contextProcessor: ContextProcessor;
  codeGen: CodeGen;
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
    this.codeGen = new CodeGen(args.logger, args.llm, language);
  }

  parse = async (
    objective: string,
    context: Record<string, JSONSchema7>,
    openAPIs: OpenAPI.Document[],
  ) => {
    const shortlist = await this.externalResourceDirectory.shortlist(
      objective,
      context,
      openAPIs,
    );

    this.logger.info('Here are the APIs we are shortlisting for you: \n');
    this.logger.log(shortlist);

    for (const api of shortlist) {
      const openapi = openAPIs.find((o) => o.info.title === api.provider)!;
      const operationObject = await dereferencePath(
        openapi,
        api.method,
        api.path,
      );
      if (!operationObject) continue;

      const operationMetadata: OperationMetdata = {
        objective,
        context,
        provider: api.provider,
        path: api.path,
        method: api.method,
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
        this.logger.warn(
          `chosen API (${api.provider}: ${api.method} ${api.path}) is not feasible, moving on to the next API. reason: '${reason}'`,
        );
        continue;
      }

      this.logger.log(
        `Chosen API (${api.provider}: ${api.method} ${api.path}) is feasible, evaluating it further.`,
      );

      this.logger.log('Narrowing down the parameter schemas for the API...');

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

      this.logger.info({
        filteredBodySchema,
        filteredQuerySchema,
        filteredPathSchema,
      });

      this.logger.log(
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

      this.logger.info({
        filteredContextForBody,
        filteredContextForQuery,
        filteredContextForPath,
      });

      this.logger.log('Generating the input parameters...');

      const generatedCode = (
        await Promise.allSettled([
          this.codeGen.generateInput({
            ...operationMetadata,
            inputSchema: filteredBodySchema,
            filteredContext: filteredContextForBody,
            name: 'body',
          }),
          this.codeGen.generateInput({
            ...operationMetadata,
            inputSchema: filteredQuerySchema,
            filteredContext: filteredContextForQuery,
            name: 'query',
          }),
          this.codeGen.generateInput({
            ...operationMetadata,
            inputSchema: filteredPathSchema,
            filteredContext: filteredContextForPath,
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
        method: api.method,
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
