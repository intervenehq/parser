import { OpenAPI, OpenAPIV2, OpenAPIV3, OpenAPIV3_1 } from "openapi-types";
import { JSONSchema7 } from "json-schema";
import { $deref } from "~/utils/openapi";
import { cloneDeep } from "lodash";
import { getDefaultContentType } from "~/utils/openapi/content-type";
import { dereferencePath } from "~/utils/openapi/dereference-path";

function operationSchemas(
  operationObject:
    | OpenAPIV2.OperationObject
    | OpenAPIV3.OperationObject
    | OpenAPIV3_1.OperationObject
) {
  const parameters = $deref(operationObject.parameters) ?? [];
  const requestBody =
    "requestBody" in operationObject
      ? $deref(operationObject.requestBody)
      : undefined;
  const successResponse = $deref(
    operationObject.responses?.["200"] ??
      operationObject.responses?.["201"] ??
      operationObject.responses?.["204"] ??
      operationObject.responses?.default
  );

  let querySchema: JSONSchema7 | undefined;
  let bodySchema: JSONSchema7 | undefined;
  let pathSchema: JSONSchema7 | undefined;
  let headerSchema: JSONSchema7 | undefined;
  let cookieSchema: JSONSchema7 | undefined;
  let responseSchema: JSONSchema7 | undefined;
  let requestContentType: string | undefined;
  let responseContentType: string | undefined;

  for (const $parameter of parameters) {
    const parameter = $deref($parameter);
    switch (parameter.in) {
      case "query":
        querySchema = appendParameterToSchema(querySchema, parameter);
        break;
      case "path":
        pathSchema = appendParameterToSchema(pathSchema, parameter);
        break;
      case "header":
        headerSchema = appendParameterToSchema(headerSchema, parameter);
        break;
      case "cookie":
        cookieSchema = appendParameterToSchema(cookieSchema, parameter);
        break;
      case "body":
        bodySchema = appendParameterToSchema(bodySchema, parameter);
        break;
    }
  }

  if (!!requestBody) {
    requestContentType = getDefaultContentType(
      Object.keys(requestBody.content)
    );
    bodySchema = requestBody.content[requestContentType]!.schema as JSONSchema7;
  }

  if (successResponse) {
    if ("schema" in successResponse) {
      responseSchema = successResponse.schema as JSONSchema7;
    } else if ("content" in successResponse) {
      responseContentType = getDefaultContentType(
        Object.keys(successResponse.content ?? {})
      );
      responseSchema = successResponse.content?.[responseContentType]
        ?.schema as JSONSchema7;
    }
  }

  return {
    querySchema,
    bodySchema,
    pathSchema,
    headerSchema,
    cookieSchema,
    responseSchema,
    requestContentType,
    responseContentType,
  };
}

/**
 * @returns always an "object" schema
 */
function appendParameterToSchema(
  $schema: JSONSchema7 | undefined,
  parameter: OpenAPIV2.ParameterObject | OpenAPIV3.ParameterObject
) {
  const schema = cloneDeep($schema) ?? {
    type: "object",
    required: [],
    title: `${parameter.in} parameters to be sent with the HTTP request`,
  };

  schema.properties ||= {};

  schema.properties[parameter.name] = parameter.schema;
  if (parameter.required) {
    schema.required?.push(parameter.name);
  }

  return schema;
}

export { operationSchemas };
