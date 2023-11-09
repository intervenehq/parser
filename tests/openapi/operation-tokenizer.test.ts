import crypto from 'crypto';
import SwaggerParser from '@apidevtools/swagger-parser';
import { describe, expect, test } from 'bun:test';

import { OperationPath } from '../../src/agent/external-resource-directory';
import { OperationTokenizer } from '../../src/utils/openapi/operation-tokenizer';
import { TokenMap } from '../../src/utils/openapi/tokenizer';

describe('Operation Tokenizer', () => {
  test('should tokenize an operation', async () => {
    const openapi = await SwaggerParser.parse(
      import.meta.dir + '/../__specs__/test_v3.json',
    );
    const putOperation = openapi.paths!['/pets']!.put!;
    const postOperation = openapi.paths!['/pets']!.post!;
    const pathItemParameters = openapi.paths!['/pets']!.parameters ?? [];

    const apiSpecId = 'api-spec-id';
    const a_ = `${apiSpecId}|`;
    function h(str: string): string {
      return crypto.createHash('sha256').update(str).digest('hex');
    }

    const tokenMap: TokenMap = new Map();

    new OperationTokenizer(
      tokenMap,
      apiSpecId,
      '/pets',
      'put',
      putOperation,
      pathItemParameters,
      'oa',
    ).tokenize();

    expect(tokenMap.size).toEqual(4);

    const params1Id = a_ + h('param1 description');
    const params2Id = a_ + h('param2 description');
    const putPetsId = a_ + h('Put pets endpoint description');

    expect(tokenMap.has(params1Id)).toBeTrue();
    expect(tokenMap.has(params2Id)).toBeTrue();
    expect(tokenMap.has(putPetsId)).toBeTrue();

    expect(tokenMap.get(params1Id)!.paths).toEqual(
      new Set([`${a_}/pets|put`]) as Set<OperationPath>,
    );
    expect(tokenMap.get(params2Id)!.paths).toEqual(
      new Set([`${a_}/pets|put`]) as Set<OperationPath>,
    );
    expect(tokenMap.get(params2Id)!.scopes).toEqual(
      new Set([`${a_}write:pets`, `${a_}read:pets`, `${a_}admin:pets`]),
    );

    new OperationTokenizer(
      tokenMap,
      apiSpecId,
      '/pets',
      'post',
      postOperation,
      pathItemParameters,
      'oa',
    ).tokenize();

    expect(tokenMap.get(params2Id)!.paths).toEqual(
      new Set([`${a_}/pets|put`, `${a_}/pets|post`]) as Set<OperationPath>,
    );
    expect(tokenMap.get(params2Id)!.scopes).toEqual(
      new Set([
        `${a_}write:pets`,
        `${a_}read:pets`,
        `${a_}admin:pets`,
        `${a_}create:pets`,
      ]),
    );
  });
});
