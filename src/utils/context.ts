import { JSONSchema7 } from 'json-schema';

import { shallowSchema } from '../utils/openapi/deepen-schema';

function stringifyContext(
  context: Record<string, JSONSchema7>,
  shallow = true,
) {
  return Object.entries(context)
    .map(([key, schema]) => {
      return (
        '"' +
        key +
        '": ' +
        JSON.stringify(shallow ? shallowSchema(schema) : schema)
      );
    })
    .join('\n');
}

export { stringifyContext };
