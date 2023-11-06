import { JsonObject } from 'type-fest';

function stringifyContext(context: JsonObject | null) {
  if (!context) return '';

  return Object.entries(context)
    .map(([key, value]) => {
      return '"' + key + '": ' + JSON.stringify(value);
    })
    .join('\n');
}

export { stringifyContext };
