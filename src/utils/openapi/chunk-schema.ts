import { JSONSchema7 } from 'json-schema';
import cloneDeep from 'lodash/cloneDeep';

import { tokenizedLength } from '.';
import { shallowSchema } from './deepen-schema';

function chunkSchema(
  schema: JSONSchema7,
  chunkRequiredProperties = false,
  tokenLimit = 4000,
) {
  if (
    !schema.type ||
    Array.isArray(schema.type) ||
    !['array', 'object'].includes(schema.type)
  ) {
    return [{ propertyNames: [], schema }];
  }

  const metadata = shallowSchema(schema);

  const chunkedSchema: {
    propertyNames: string[];
    schema: JSONSchema7;
  }[] = [];

  if (schema.type === 'object') {
    const { chunks } = chunkProperties(
      schema,
      chunkRequiredProperties,
      tokenLimit,
    );

    chunks.map((chunk) => {
      chunkedSchema.push({
        propertyNames: Object.keys(chunk),
        schema: { ...metadata, properties: chunk },
      });
    });
  } else if (!Array.isArray(schema.items) && typeof schema.items === 'object') {
    const { chunks } = chunkProperties(
      schema.items,
      chunkRequiredProperties,
      tokenLimit,
    );

    const itemMetadata = shallowSchema(schema.items);

    chunks.map((chunk) => {
      chunkedSchema.push({
        propertyNames: Object.keys(chunk),
        schema: {
          ...metadata,
          items: {
            ...itemMetadata,
            properties: chunk,
          },
        },
      });
    });
  }

  return chunkedSchema;
}

function chunkProperties(
  objectSchema: JSONSchema7,
  chunkRequiredProperties = false,
  tokenLimit = 4000,
): {
  required: JSONSchema7['properties'];
  chunks: NonNullable<JSONSchema7['properties']>[];
} {
  if (objectSchema.type !== 'object')
    return { required: objectSchema.properties, chunks: [] };

  const chunks: NonNullable<JSONSchema7['properties']>[] = [];
  let requiredProperties: JSONSchema7['properties'];
  const { properties, required } = objectSchema;

  let currLength = 0;
  let curr: JSONSchema7['properties'] | undefined;

  for (const propertyName in properties) {
    const property = properties[propertyName]!;

    if (typeof property === 'boolean') continue;

    const propertyMetadata = shallowSchema(property);
    if (!chunkRequiredProperties && !!required?.includes(propertyName)) {
      requiredProperties ||= {};
      requiredProperties[propertyName] = propertyMetadata;
      continue;
    }

    const length = tokenizedLength(propertyMetadata);

    if (currLength + length > tokenLimit || length > tokenLimit) {
      chunks.push(curr!);
      curr = undefined;
      currLength = 0;
    }

    curr ||= {};

    curr[propertyName] = propertyMetadata;
    currLength += length;
  }

  if (currLength > 0) {
    chunks.push(curr!);
  }

  return { required: requiredProperties, chunks };
}

function getSubSchema(schema: JSONSchema7, properties: string[]) {
  const subSchema: JSONSchema7 = cloneDeep(schema);

  if (schema.type === 'object') {
    subSchema.properties = {};

    for (const propertyName of properties) {
      subSchema.properties[propertyName] = schema.properties![propertyName]!;
    }
  } else if (
    schema.type === 'array' &&
    typeof schema.items === 'object' &&
    !Array.isArray(schema.items)
  ) {
    subSchema.items = getSubSchema(schema.items, properties);
  }

  return subSchema;
}

export { chunkSchema, getSubSchema };
