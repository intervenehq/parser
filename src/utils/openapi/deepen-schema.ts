import { JSONSchema7 } from 'json-schema';
import cloneDeep from 'lodash/cloneDeep';
import compact from 'lodash/compact';
import flatten from 'lodash/flatten';
import omit from 'lodash/omit';

function deepenSchema(
  fullSchema: JSONSchema7,
  filteredShallowSchema: JSONSchema7,
) {
  if (fullSchema.type !== filteredShallowSchema.type)
    throw `fullSchema and filteredShallowSchema need to be of the same type, got ${JSON.stringify(
      fullSchema.type,
    )} and ${JSON.stringify(filteredShallowSchema.type)}`;

  let deepenedSchema = cloneDeep(filteredShallowSchema);

  if (
    typeof fullSchema.items === 'object' &&
    typeof filteredShallowSchema.items === 'object'
  ) {
    if (
      fullSchema.type === 'array' &&
      !Array.isArray(fullSchema.items) &&
      !Array.isArray(filteredShallowSchema.items)
    ) {
      deepenedSchema.items = deepenSchema(
        fullSchema.items,
        filteredShallowSchema.items,
      );
    }

    if (fullSchema.type === 'object') {
      deepenedSchema.required = Array.from(
        new Set(
          flatten(
            compact([fullSchema.required, filteredShallowSchema.required]),
          ),
        ),
      );
      deepenedSchema.properties = {
        ...fullSchema.properties,
        ...filteredShallowSchema.properties,
      };
    }
  } else {
    deepenedSchema = {
      ...deepenedSchema,
      ...filteredShallowSchema,
    };
  }

  return deepenedSchema;
}

function shallowSchema(schema: JSONSchema7) {
  return omit(schema, [
    'properties',
    'items',
    'additionalProperties',
    'patternProperties',
    'definitions',
    'dependencies',
    'allOf',
    'anyOf',
    'oneOf',
    'not',
    'if',
    'then',
    'else',
  ]);
}

export { deepenSchema, shallowSchema };
