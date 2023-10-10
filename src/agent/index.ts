import fs from 'fs';
import path from 'path';
import SwaggerParser from '@apidevtools/swagger-parser';
import { JSONSchema7 } from 'json-schema';
import { OpenAPI } from 'openapi-types';
import { Options as OraOptions } from 'ora';

import { cli } from 'src/cli';
import CodeGen, { CodeGenLanguage } from '~/agent/code-gen';
import ContextProcessor from '~/agent/context-processor';
import ExternalResourceDirectory from '~/agent/external-resource-directory';
import ExternalResourceEvaluator from '~/agent/external-resource-evaluator';
import ChatCompletion from '~/chat-completion/index';

import { stringifyContext } from '~/utils/context';
import { getCurrentDirectory } from '~/utils/current-directory';
import { dereferencePath } from '~/utils/openapi/dereference-path';
import { operationSchemas } from '~/utils/openapi/operation';
import { extractRequiredSchema } from '~/utils/openapi/required-schema';
import { t } from '~/utils/template';

export const objectivePrefix = (
  params: Pick<OperationMetdata, 'objective' | 'context'>,
  withContext = true,
) =>
  t(
    [
      "I have this objective: '''{{objective}}'''",
      '{{#if showContext}}I also have some contextual data, think of these as variables that can be used to achieve the given objective.',
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

interface Loggable {
  log: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  showLoader?: (options: OraOptions) => void;
  hideLoader?: () => void;
}

export default class Parser {
  externalResourceDirectory: ExternalResourceDirectory;
  externalResourceEvaluator: ExternalResourceEvaluator;
  contextProcessor: ContextProcessor;
  codeGen: CodeGen;
  logger: Loggable;

  chatCompletion: ChatCompletion;

  constructor(
    loggable: Loggable = cli,
    language: CodeGenLanguage = CodeGenLanguage.javascript,
  ) {
    this.externalResourceDirectory = new ExternalResourceDirectory(this);
    this.externalResourceEvaluator = new ExternalResourceEvaluator(this);
    this.contextProcessor = new ContextProcessor(this);
    this.codeGen = new CodeGen(this, language);
    this.logger = loggable;

    this.chatCompletion = new ChatCompletion();
  }

  parse = async (
    objective: string,
    context: Record<string, JSONSchema7>,
    openapiPaths: string[],
  ) => {
    const openapis: OpenAPI.Document[] = [];
    for (const openapiPath of openapiPaths) {
      const contents = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));
      const openapi = await SwaggerParser.parse(contents);

      openapis.push(openapi);
      await this.externalResourceDirectory.embed(openapi);
    }

    const shortlist = await this.externalResourceDirectory.shortlist(
      objective,
      context,
      openapis,
    );

    cli.info('Here are the APIs we are shortlisting for you: \n');
    console.log(shortlist);

    for (const api of shortlist) {
      const openapi = openapis.find((o) => o.info.title === api.provider)!;
      const operationObject = dereferencePath(openapi, api.method, api.path);
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
        cli.error(
          "chosen API is not feasible, moving on to the next API. reason: '" +
            reason +
            "'",
        );
        continue;
      }

      cli.log('Chosen API is feasible, evaluating it further.');

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

      cli.log("Narrowing down the keys that need to be sent...");

      cli.info(
        JSON.stringify({
          body: filteredBodySchema,
          query: filteredQuerySchema,
          path: filteredPathSchema,
        }),
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

      cli.log("Narrowing down the variables that go into the keys...");

      cli.info(
        JSON.stringify({
          body: filteredContextForBody,
          query: filteredContextForQuery,
          path: filteredContextForPath,
        }),
      );

      const bodyParams = await this.codeGen.generateInput({
        ...operationMetadata,
        inputSchema: filteredBodySchema,
        filteredContext: filteredContextForBody,
        name: 'body',
      });

      const queryParams = await this.codeGen.generateInput({
        ...operationMetadata,
        inputSchema: filteredQuerySchema,
        filteredContext: filteredContextForQuery,
        name: 'query',
      });

      const pathParams = await this.codeGen.generateInput({
        ...operationMetadata,
        inputSchema: filteredPathSchema,
        filteredContext: filteredContextForPath,
        name: 'path',
      });

      const finalOutput = JSON.stringify({
        provider: api.provider,
        method: api.method,
        path: api.path,
        bodyParams,
        queryParams,
        pathParams,
        requestContentType,
        responseContentType,
        responseSchema,
      });

      const outputPath = path.join(getCurrentDirectory(), '../../output.json');
      fs.writeFileSync(outputPath, finalOutput);

      await cli.warn(
        `Your output has been written to output.json in the project's root`,
      );

      return;
    }
  };
}
