import { JSONSchema7 } from 'json-schema';
import cloneDeep from 'lodash/cloneDeep';
import compact from 'lodash/compact';
import flatten from 'lodash/flatten';

function mergeSchema(schema1: JSONSchema7, schema2: JSONSchema7): JSONSchema7 {
  if (!schema1.type) {
    if (schema1.properties) {
      schema1.type = 'object';
    } else if (schema1.items) {
      schema1.type = 'array';
    }
  }

  if (!schema2.type) {
    if (schema2.properties) {
      schema2.type = 'object';
    } else if (schema2.items) {
      schema2.type = 'array';
    }
  }

  if (schema1.type !== schema2.type) {
    throw new Error(
      `schema1 and schema2 need to be of the same type, got ${JSON.stringify(
        schema1,
      )} and ${JSON.stringify(schema2)}`,
    );
  }
  let mergedSchema = cloneDeep(schema1);

  if (
    schema1.type === 'object' ||
    (schema1.type === 'array' && !Array.isArray(schema1.items))
  ) {
    if (schema1.type === 'object') {
      mergedSchema.required = Array.from(
        new Set(flatten(compact([schema1.required, schema2.required]))),
      );
      mergedSchema.properties = {
        ...schema1.properties,
        ...schema2.properties,
      };
    }

    if (
      schema1.type === 'array' &&
      typeof schema1.items === 'object' &&
      typeof schema2.items === 'object' &&
      !Array.isArray(schema1.items) &&
      !Array.isArray(schema2.items)
    ) {
      mergedSchema.items = mergeSchema(schema1.items, schema2.items);
    }
  } else {
    mergedSchema = {
      ...mergedSchema,
      ...schema2,
    };
  }

  return mergedSchema;
}

export { mergeSchema };
