import { JSONSchema7 } from 'json-schema';
import cloneDeep from 'lodash/cloneDeep';
import compact from 'lodash/compact';
import flatten from 'lodash/flatten';

function mergeSchema(schema1: JSONSchema7, schema2: JSONSchema7): JSONSchema7 {
  const type = schema1.type ?? schema2.type;
  schema1.type = type;
  schema2.type = type;

  let mergedSchema = cloneDeep(schema1);

  if (schema1.type === 'object') {
    mergedSchema.required = Array.from(
      new Set(flatten(compact([mergedSchema.required, schema2.required]))),
    );
    mergedSchema.properties = {
      ...mergedSchema.properties,
      ...schema2.properties,
    };
  } else if (
    mergedSchema.type === 'array' &&
    typeof schema2.items === 'object' &&
    !Array.isArray(schema2.items)
  ) {
    if (!schema1.items) {
      mergedSchema.items = schema2.items;
    } else if (
      !Array.isArray(mergedSchema.items) &&
      typeof mergedSchema.items === 'object'
    ) {
      mergedSchema.items = mergeSchema(mergedSchema.items, schema2.items);
    } else {
      if (Array.isArray(mergedSchema.items) && Array.isArray(schema2.items)) {
        for (
          let i = 0;
          i < Math.max(mergedSchema.items.length, schema2.items.length);
          i += 1
        ) {
          mergedSchema.items[i] = mergeSchema(
            mergedSchema.items[i] as JSONSchema7,
            schema2.items[i],
          );
        }
      }
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
