import { OpenAPIV2, OpenAPIV3, OpenAPIV3_1 } from "openapi-types";

type ExcludeReference<T> = T extends
  | OpenAPIV3.ReferenceObject
  | OpenAPIV2.ReferenceObject
  ? never
  : T;

export function $deref<O>(
  obj: O | OpenAPIV3.ReferenceObject | OpenAPIV2.ReferenceObject
) {
  return obj as ExcludeReference<O>;
}

export type OperationObject =
  | OpenAPIV2.OperationObject
  | OpenAPIV3.OperationObject
  | OpenAPIV3_1.OperationObject;
