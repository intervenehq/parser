import SwaggerParser from "@apidevtools/swagger-parser";
import { compact, intersection } from "lodash";
import { encode } from "gpt-3-encoder";
import { OpenAPI, OpenAPIV2, OpenAPIV3, OpenAPIV3_1 } from "openapi-types";
import vectorStore from "src/embeddings/vector-store";
import VectorStoreItem, { IVectorStoreItem } from "~/embeddings/Item";
import { createEmbeddings } from "~/embeddings/index";
import { $deref } from "~/utils/openapi";
import { getDefaultContentType } from "~/utils/openapi/content-type";
import { dereferencePath } from "~/utils/openapi/dereference-path";

interface OpenAPIMetadata {
  paths: string;
  provider: string;
}

export default class ExternalResourcesDirectory {
  constructor() {
    console.log("ExternalResourcesDirectory instantiated");
  }

  embed = async (openapi: any) => {
    console.log("embed called with openapi");

    const api: OpenAPI.Document = await SwaggerParser.parse(openapi);

    const mappings = new Map<string, Set<string>>();
    const collection = await vectorStore.findOrCreateCollection("openapi");

    for (const path in api.paths) {
      for (const httpMethod of intersection(
        Object.values(OpenAPIV2.HttpMethods),
        Object.keys(api.paths[path]!)
      )) {
        const fullPath = [api.info.title, path, httpMethod].join("#");

        const operationObject = $deref(
          dereferencePath(
            api as OpenAPIV3.Document,
            httpMethod as keyof OpenAPIV3.PathItemObject,
            path
          ) as
            | OpenAPIV2.OperationObject
            | OpenAPIV3.OperationObject
            | OpenAPIV3_1.OperationObject
        )!;

        const parameters =
          operationObject.parameters?.map((p) => $deref(p)) ?? [];
        for (const parameter of parameters) {
          const key = compact([parameter.name, parameter.description]).join(
            ": "
          );
          if (!mappings.has(key)) mappings.set(key, new Set<string>());

          mappings.get(key)?.add(fullPath);
        }

        const requestBody =
          "requestBody" in operationObject
            ? $deref(operationObject.requestBody)
            : undefined;
        const defaultContentType = getDefaultContentType(
          Object.keys(requestBody?.content ?? [])
        );
        const requestBodySchema = $deref(
          requestBody?.content?.[defaultContentType]?.schema
        );
        if (requestBodySchema) {
          let properties:
            | OpenAPIV2.SchemaObject["properties"]
            | OpenAPIV3.SchemaObject["properties"]
            | OpenAPIV3_1.SchemaObject["properties"];

          if (requestBodySchema?.properties) {
            properties = $deref(requestBodySchema.properties);
          }

          if ("items" in requestBodySchema && requestBodySchema.items) {
            if (Array.isArray(requestBodySchema.items)) {
              properties ||= $deref(requestBodySchema.items[0]).properties;
            } else {
              properties ||= $deref(requestBodySchema.items).properties ?? {};
            }
          }

          properties ||= {};

          for (const propertyName in properties) {
            const property = $deref(properties[propertyName]);

            const key = compact([propertyName, property.description]).join(
              ": "
            );
            if (!mappings.has(key)) mappings.set(key, new Set<string>());
            mappings.get(key)?.add(fullPath);
          }
        }

        const key =
          operationObject.description ??
          operationObject.summary ??
          operationObject.operationId ??
          fullPath;
        if (!mappings.has(key)) mappings.set(key, new Set<string>());
        mappings.get(key)?.add(fullPath);
      }
    }

    const keys = Array.from(mappings.keys());

    const batchSize = 1000;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize).filter((key) => !!key);
      const batchMap = Object.fromEntries(
        batch.map(($key) => {
          let key = $key;
          while (encode(key).length > 8000) {
            key = key.slice(0, -100);
          }

          return [key, $key];
        })
      );

      console.log("creating embeddings for batch", Object.keys(batchMap));
      const vectorStoreItems = Object.entries(
        await createEmbeddings(Object.keys(batchMap))
      ).map(([input, embedding]) => {
        const key = batchMap[input];

        return {
          id: key,
          embeddings: embedding,
          metadata: {
            paths: JSON.stringify(Array.from(mappings.get(key)!)),
            provider: api.info.title,
          },
        } as IVectorStoreItem;
      });
      console.log(
        "embeddings created. now pushing to vector store",
        Object.keys(batchMap)
      );
      await vectorStore.createItems(collection, vectorStoreItems);
    }

    console.log("All done with embedding, completed without errors.");
  };

  search = async (objective: string, providers: string[]) => {
    console.log("search called with objective:", objective);

    const collection = await vectorStore.findOrCreateCollection("openapi");
    console.log("Collection created or fetched:", collection);

    const embedding = await createEmbeddings(objective);
    console.log("Created embedding for objective:", embedding);

    const matches = await vectorStore.queryItems(
      collection,
      embedding,
      providers.length > 1
        ? {
            $or: providers.map((provider) => ({
              provider: {
                $eq: provider,
              },
            })),
          }
        : {
            provider: {
              $eq: providers[0],
            },
          }
    );
    console.log("Found matches:", matches);

    const pathScores: Map<string, number> = new Map();

    for (const match of matches) {
      const matchPaths = JSON.parse((match.metadata?.paths as string) ?? "[]");

      for (const path of matchPaths) {
        const score = pathScores.get(path) ?? 0;
        pathScores.set(path, score + (1 - match.distance));
      }
    }

    const sortedPaths = Array.from(pathScores.entries()).sort(
      (a, b) => b[1] - a[1]
    );

    return sortedPaths.map((entry) => entry[0]);
  };
}
