import SwaggerParser from '@apidevtools/swagger-parser';
import { OpenAPI, OpenAPIV2 } from 'openapi-types';

import { OperationPath } from '../../agent/external-resource-directory';

import { getOauthSecuritySchemeName } from './operation';
import { OperationTokenizer } from './operation-tokenizer';

export type TokenMap = Map<
  string,
  {
    tokens: string;
    paths: Set<OperationPath>;
    scopes: Set<string>;
    apiSpecId: string;
  }
>;

export class OpenAPITokenizer {
  tokenMap: TokenMap = new Map();

  constructor(
    private apiSpecId: string,
    private openapi: OpenAPI.Document,
  ) {}

  async tokenize() {
    this.openapi = await SwaggerParser.dereference(this.openapi);

    for (const path in this.paths) {
      const parameters = this.paths[path]!.parameters ?? [];

      for (const method of Object.values(OpenAPIV2.HttpMethods)) {
        const operation = this.paths[path]![method as OpenAPIV2.HttpMethods];
        if (!operation) continue;

        const tokenizer = new OperationTokenizer(
          this.tokenMap,
          this.apiSpecId,
          path,
          method,
          operation,
          parameters,
          this.oauthSecuritySchemeName,
        );
        tokenizer.tokenize();
      }
    }

    return this.tokenMap;
  }

  get paths() {
    return this.openapi.paths ?? {};
  }

  get oauthSecuritySchemeName() {
    return getOauthSecuritySchemeName(this.openapi);
  }
}
