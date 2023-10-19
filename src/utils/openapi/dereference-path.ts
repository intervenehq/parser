// import SwaggerParser from '@apidevtools/swagger-parser';
import cloneDeep from 'lodash/cloneDeep';
import { OpenAPI, OpenAPIV2, OpenAPIV3 } from 'openapi-types';

import { OperationObject } from '~/utils/openapi';

let data: OpenAPIV3.Document;

function findAllRefs(obj: any, refs: string[] = []): string[] {
  if (typeof obj === 'object' && obj !== null) {
    for (const [k, v] of Object.entries(obj)) {
      if (k === '$ref') {
        refs.push(v as string);
      } else if (typeof v === 'object') {
        findAllRefs(v, refs);
      }
    }
  }
  return refs;
}

function processEndpoint(endpointPath: string): Set<string> {
  const endpointData = data.paths[endpointPath] || {};
  const refs = new Set(findAllRefs(endpointData));

  return refs;
}

function removeCircularRefs(refs: Set<string>): void {
  refs.forEach((ref) => {
    const [component] = getComponentByRef(ref);
    substituteRef(component, new Set([ref]));
  });
}

function substituteRef(obj: any, processed: Set<string> = new Set()): void {
  if (typeof obj === 'object' && obj !== null) {
    const keysToDelete: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      if (key === '$ref' && processed.has(value as string)) {
        keysToDelete.push(key);
      } else if (key === '$ref' && !processed.has(value as string)) {
        processed.add(value as string);
        substituteRef(getComponentByRef(value as string)[0], processed);
      } else if (typeof value === 'object') {
        substituteRef(value, processed);
      }
    }
    keysToDelete.forEach((key) => delete obj[key]);
  }
}

function getComponentByRef(
  ref: string,
): [OpenAPIV3.SchemaObject | undefined | OpenAPIV3.ReferenceObject, string] {
  const components = data.components?.schemas || {};
  const componentName = ref.split('/').pop() || '';
  return [components[componentName], componentName];
}

function replaceRef(obj: any): void {
  if (Array.isArray(obj)) {
    for (const item of obj) {
      replaceRef(item);
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      if (key === '$ref' && typeof value === 'string') {
        const [component] = getComponentByRef(value as string);
        if (component) {
          obj[key] = component;
          replaceRef(obj[key]);
        }
      } else {
        replaceRef(value);
      }
    }
  }
}

function substituteRefsInPath(endpointPath: string): void {
  const endpointData = data.paths[endpointPath] || {};
  replaceRef(endpointData);
}

function flattenRefs(d: any): any {
  if (typeof d !== 'object' || d === null) return d;

  if ('$ref' in d) return flattenRefs(d['$ref']);

  for (const [key, value] of Object.entries(d)) {
    if (typeof value === 'object') {
      d[key] = flattenRefs(value);
    }
  }
  return d;
}

export function dereferencePath(
  jsonData: OpenAPI.Document,
  httpMethod: OpenAPIV2.HttpMethods,
  endpointPath: string,
) {
  data = cloneDeep(jsonData) as OpenAPIV3.Document;

  const refsForPath = processEndpoint(endpointPath);
  removeCircularRefs(refsForPath);

  substituteRefsInPath(endpointPath);
  delete data.components;

  const endpointData = data.paths[endpointPath] || {};
  flattenRefs(endpointData);

  return data?.paths![endpointPath]![httpMethod] as OperationObject;
}

// type J = Record<string, any> | any[] | any;

// function findRefsUsed(data: J): string[] {
//   if (!data || typeof data !== 'object') return [];

//   if ('$ref' in data) return [data['$ref']];

//   const refs: string[] = [];

//   for (const key in data) {
//     refs.push(...findRefsUsed(data[key]));
//   }

//   return refs;
// }

// function flattenRefs2(
//   $data: J,
//   refs: SwaggerParser.$Refs,
//   stack: Set<string>,
// ): J {
//   let data = cloneDeep($data);

//   if (data && typeof data === 'object') {
//     if ('$ref' in data) {
//       const ref = data['$ref'] as string;
//       if (stack.has(ref)) {
//         data = {};
//       } else {
//         // if (ref.includes('file')) console.log(ref, stack);
//         data = flattenRefs2(refs.get(ref), refs, new Set([...stack, ref]));
//       }
//     } else {
//       for (const key in data) {
//         data[key] = flattenRefs2(data[key], refs, stack);
//       }
//     }
//   }

//   return data;
// }

// export async function dereferencePath2(
//   jsonData: OpenAPI.Document,
//   httpMethod: OpenAPIV2.HttpMethods,
//   endpointPath: string,
// ) {
//   const refs = await SwaggerParser.resolve(jsonData);
//   const api = await SwaggerParser.parse(jsonData);

//   const operationObject = cloneDeep(api.paths?.[endpointPath]?.[httpMethod]);

//   if (!operationObject) return {};

//   return flattenRefs2(operationObject as any, refs, new Set());
// }

// async function main() {
//   const json = await Bun.file(
//     '/Users/sudhanshugautam/workspace/intevene/src/server/openapi/stripe.json',
//   ).json();

//   console.log(
//     JSON.stringify(
//       await dereferencePath2(
//         json,
//         OpenAPIV2.HttpMethods.POST,
//         '/v1/subscriptions/{subscription_exposed_id}',
//       ),
//     ),
//   );
// }

// main().then(() => {
//   process.exit(0);
// });
