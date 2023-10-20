import SwaggerParser from '@apidevtools/swagger-parser';
import cloneDeep from 'lodash/cloneDeep';
import { OpenAPI, OpenAPIV2 } from 'openapi-types';

import { OperationObject } from '~/utils/openapi';

type J = Record<string, any> | any[] | any;

const flatten = ($data: J, refs: SwaggerParser.$Refs, maxDepth: number) => {
  function flattenRefs($data: J, refs: SwaggerParser.$Refs, d: number): J {
    if (d > maxDepth) {
      return {};
    }

    let data = cloneDeep($data);

    if (data && typeof data === 'object') {
      if ('$ref' in data) {
        const ref = data['$ref'] as string;
        data = flattenRefs(refs.get(ref), refs, d + 1);
      } else {
        for (const key in data) {
          data[key] = flattenRefs(data[key], refs, d + 1);
        }
      }
    }

    return data;
  }
  return flattenRefs($data, refs, 0);
};

export async function dereferencePath(
  jsonData: OpenAPI.Document,
  httpMethod: OpenAPIV2.HttpMethods,
  endpointPath: string,
  maxDepth = 13,
) {
  const refs = await SwaggerParser.resolve(jsonData);
  const api = await SwaggerParser.parse(jsonData);

  const operationObject = cloneDeep(api.paths?.[endpointPath]?.[httpMethod]);

  if (!operationObject) return {};

  return flatten(operationObject, refs, maxDepth) as OperationObject;
}

// async function main() {
//   const json = await Bun.file(
//     '/Users/sudhanshugautam/workspace/intevene/src/server/openapi/stripe.json',
//   ).json();

//   const o = JSON.stringify(
//     await dereferencePath(
//       json,
//       OpenAPIV2.HttpMethods.POST,
//       '/v1/subscriptions/{subscription_exposed_id}',
//     ),
//   );

//   await Bun.write('/tmp/output.json', o);
// }

// main().then(() => {
//   process.exit(0);
// });
