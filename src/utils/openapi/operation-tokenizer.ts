import crypto from 'crypto';
import { IJsonSchema, OpenAPI } from 'openapi-types';

import { OperationPath } from '../../agent/external-resource-directory';

import { $deref } from '.';
import { getDefaultContentType } from './content-type';
import { TokenMap } from './tokenizer';

export class OperationTokenizer {
  constructor(
    private tokenMap: TokenMap,
    private apiSpecId: string,
    private urlPath: string,
    private httpMethod: string,
    private operationObj: OpenAPI.Operation,
    private pathItemParameters: OpenAPI.Parameter[],
    private oauthSecuritySchemeName: string | undefined,
  ) {}

  tokenize() {
    this.addOperationDescription();
    this.addParameters();
    this.addRequestBody();
  }

  private addOperationDescription() {
    const operationDescription =
      this.operationObj.description ??
      this.operationObj.operationId ??
      this.operationObj.summary ??
      '';
    this.addEntry(operationDescription);
  }

  private addParameters() {
    const parameters = [
      ...this.pathItemParameters,
      ...(this.operationObj.parameters ?? []),
    ];
    for (const $parameter of parameters) {
      const parameter = $deref($parameter);

      const parameterDescription =
        parameter.description ?? parameter.name ?? '';
      this.addEntry(parameterDescription);
    }
  }

  private addRequestBody() {
    if (
      !('requestBody' in this.operationObj && !!this.operationObj.requestBody)
    ) {
      return;
    }
    const requestBody = $deref(this.operationObj.requestBody);

    const defaultContentType = getDefaultContentType(
      Object.keys(requestBody.content),
    );
    const mediaTypeObject = requestBody.content[defaultContentType];
    const schema = $deref(mediaTypeObject.schema);
    if (!schema) return;

    let properties: Record<string, object>;

    if (schema.type === 'object') {
      properties = schema.properties ?? {};
    } else if (schema.type === 'array' && !Array.isArray(schema.items)) {
      properties = $deref(schema.items)?.properties ?? {};
    } else {
      return;
    }

    for (const [propertyName, property] of Object.entries(properties)) {
      const propertySchema = property as IJsonSchema;
      const propertyDescription =
        propertySchema.description ?? propertyName ?? '';
      this.addEntry(propertyDescription);
    }
  }

  private addEntry(tokens: string) {
    const id =
      this.apiSpecId +
      '|' +
      crypto.createHash('sha256').update(tokens).digest('hex');
    if (!this.tokenMap.has(id)) {
      this.tokenMap.set(id, {
        tokens,
        paths: new Set(),
        scopes: new Set(),
        apiSpecId: this.apiSpecId,
      });
    }

    this.tokenMap.get(id)!.paths.add(this.path);
    this.oauthScopes.map((s) => this.tokenMap.get(id)!.scopes.add(s));
  }

  private get oauthScopes() {
    if (!this.operationObj.security || !this.oauthSecuritySchemeName) return [];

    let scopes: string[] | undefined;

    for (const securityReq of this.operationObj.security) {
      const securityScopes = securityReq[this.oauthSecuritySchemeName];
      if (!securityScopes) continue;

      scopes ||= [];
      scopes.push(...this.decorateScopes(securityScopes));
    }

    return scopes ?? this.decorateScopes(['_default']);
  }

  private decorateScopes(scope: string[]) {
    return scope.map((s) => `${this.apiSpecId}|${s}`);
  }

  private get path() {
    return `${this.apiSpecId}|${this.urlPath}|${this.httpMethod}` as OperationPath;
  }
}
