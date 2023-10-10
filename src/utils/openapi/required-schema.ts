import { JSONSchema7 } from "json-schema";
import cloneDeep from "lodash/cloneDeep";

function extractRequiredSchema($schema: JSONSchema7 | undefined) {
  if (!$schema) return $schema;

  const schema = cloneDeep($schema);

  if (schema.type === "object" && schema.properties) {
    const required = schema.required ?? [];

    for (const property in schema.properties) {
      if (!required.includes(property)) {
        delete schema.properties[property];
      }
    }
  } else if (schema.type === "array" && typeof schema.items === "object") {
    if (!Array.isArray(schema.items)) {
      schema.items = extractRequiredSchema(schema.items);
    } else {
      for (let i = 0; i < schema.items.length; i++) {
        const itemSchema = schema.items[i];
        if (typeof itemSchema === "object") {
          schema.items[i] = extractRequiredSchema(itemSchema)!;
        }
      }
    }
  }

  return schema;
}

export { extractRequiredSchema };
