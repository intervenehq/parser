import SwaggerParser from "@apidevtools/swagger-parser";
import { JSONSchema7 } from "json-schema";

import { OpenAPI } from "openapi-types";
import ChatCompletion from "src/chat-completion";
import ExternalResourceDirectory from "~/agent/ExternalResourceDirectory";

export default class Parser {
  externalResourceDirectory: ExternalResourceDirectory;
  chatCompletion: ChatCompletion;

  constructor() {
    this.externalResourceDirectory = new ExternalResourceDirectory();
    this.chatCompletion = new ChatCompletion();
  }

  parse = async (
    objective: string,

    context: Record<string, JSONSchema7>,
    openapiPaths: string[]
  ) => {
    const openapis: OpenAPI.Document[] = [];
    for (const openapiPath of openapiPaths) {
      const openapi = await SwaggerParser.parse(
        await Bun.file(openapiPath).json()
      );

      openapis.push(openapi);
      // await this.externalResourceDirectory.embed(openapi);
    }

    const shortlist = await this.externalResourceDirectory.shortlist(
      this,
      objective,
      context,
      openapis
    );

    console.log(shortlist);
  };
}

async function main() {
  const parser = new Parser();
  await parser.parse("find subscriptions of customer me@sudhanshug.com", {}, [
    "/Users/sudhanshugautam/workspace/intevene/src/server/openapi/stripe.json",
  ]);
}

main().then(() => process.exit(0));
