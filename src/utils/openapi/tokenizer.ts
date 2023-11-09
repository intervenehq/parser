import SwaggerParser from '@apidevtools/swagger-parser';
import { OpenAPI, OpenAPIV2 } from 'openapi-types';

import { OperationPath } from '../../agent/external-resource-directory';

import { $deref } from '.';
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
    private providers: string[],
    private openapi: OpenAPI.Document,
  ) {}

  async getTokenMap() {
    this.openapi = await SwaggerParser.dereference(this.openapi);

    for (const path in this.paths) {
      const parameters = this.paths[path]!.parameters ?? [];

      for (const method of Object.values(OpenAPIV2.HttpMethods)) {
        const operation = this.paths[path]![method as OpenAPIV2.HttpMethods];
        if (!operation) continue;

        new OperationTokenizer(
          this.tokenMap,
          this.apiSpecId,
          path,
          method,
          operation,
          parameters,
          this.oauthSecuritySchemeName,
        );
      }
    }

    return this.tokenMap;
  }

  get paths() {
    return this.openapi.paths ?? {};
  }

  get oauthSecuritySchemeName() {
    if (
      'securityDefinitions' in this.openapi &&
      this.openapi.securityDefinitions
    ) {
      for (const [name, securityDefinition] of Object.entries(
        this.openapi.securityDefinitions,
      )) {
        if (securityDefinition.type === 'oauth2') {
          return name;
        }
      }
    }

    if (
      'components' in this.openapi &&
      this.openapi.components &&
      'securitySchemes' in this.openapi.components &&
      this.openapi.components.securitySchemes
    ) {
      for (const [name, $securityScheme] of Object.entries(
        this.openapi.components.securitySchemes,
      )) {
        const securityScheme = $deref($securityScheme);
        if (securityScheme.type === 'oauth2') {
          return name;
        }
      }
    }

    return undefined;
  }
}
