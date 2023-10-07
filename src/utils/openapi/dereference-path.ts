// const endpointPath = "/v1/files/{file}";
const inputFilePath = "../../demo/specs/test-stripe-openapi.json";
const outputFilePath = "../../demo/specs/output.json";
const finalOutputFilePath = "../../demo/specs/final-output.json";

let data: any = {};
const outputFile = Bun.file(outputFilePath);
const finalOutput = Bun.file(finalOutputFilePath);

function findAllRefs(obj: any, refs: string[] = []): string[] {
  if (typeof obj === "object" && obj !== null) {
    for (const [k, v] of Object.entries(obj)) {
      if (k === "$ref") {
        refs.push(v as string);
      } else if (typeof v === "object") {
        findAllRefs(v, refs);
      }
    }
  }
  return refs;
}

function processEndpoint(endpointPath: string): Set<string> {
  const endpointData = data.paths[endpointPath] || {};
  const refs = new Set(findAllRefs(endpointData));

  console.log(`\nFound refs for path: ${endpointPath}:`);

  refs.forEach((ref: string) => console.log(ref));

  console.log("\n--------------------------------\n");

  return refs;
}

function removeCircularRefs(refs: Set<string>): void {
  refs.forEach((ref) => {
    const [component] = getComponentByRef(ref);
    substituteRef(component, new Set([ref]));
  });
}

function substituteRef(obj: any, processed: Set<string> = new Set()): void {
  if (typeof obj === "object" && obj !== null) {
    const keysToDelete: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      if (key === "$ref" && processed.has(value as string)) {
        keysToDelete.push(key);
      } else if (key === "$ref" && !processed.has(value as string)) {
        processed.add(value as string);
        substituteRef(getComponentByRef(value as string)[0], processed);
      } else if (typeof value === "object") {
        substituteRef(value, processed);
      }
    }
    keysToDelete.forEach((key) => delete obj[key]);
  }
}

function getComponentByRef(ref: string): [any, string] {
  const components = data.components?.schemas || {};
  const componentName = ref.split("/").pop() || "";
  return [components[componentName], componentName];
}

function replaceRef(obj: any): void {
  if (typeof obj === "object" && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      if (key === "$ref") {
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
  if (typeof d !== "object" || d === null) return d;

  if ("$ref" in d) return flattenRefs(d["$ref"]);

  for (const [key, value] of Object.entries(d)) {
    if (typeof value === "object") {
      d[key] = flattenRefs(value);
    }
  }
  return d;
}

export async function dereferencePath(
  jsonData: object,
  httpMethod: string,
  endpointPath: string
) {
  data = jsonData;

  const refsForPath = processEndpoint(endpointPath);
  removeCircularRefs(refsForPath);

  await Bun.write(outputFile, JSON.stringify(data));

  substituteRefsInPath(endpointPath);
  delete data.components;

  const endpointData = data.paths[endpointPath] || {};
  flattenRefs(endpointData);

  await Bun.write(finalOutput, JSON.stringify(data));

  console.log(`Final outputs with replaced refs: ${finalOutputFilePath}`);

  return JSON.stringify(data);
}
