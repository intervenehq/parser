import { Command } from "commander";
import prompts from "prompts";
import path from "path";
import os from "os";

const program = new Command();

program
  .name("intervene-cli")
  .description("CLI for Intervene to parse natural language")
  .version("0.0.1");

program
  .command("configure")
  .description("Configure OpenAI API and select a vector db")
  .action(async () => {
    const apiKeyResponse = await prompts({
      type: "text",
      name: "apiKey",
      message: "Please enter your OpenAI API key:",
    });

    const vectorDbResponse = await prompts({
      type: "select",
      name: "vectorDb",
      message: "Choose a vector db:",
      choices: [
        { title: "chromaDB", value: "chromaDB" },
        { title: "pinecone", value: "pinecone" },
      ],
    });

    let keyName =
      vectorDbResponse.vectorDb === "chromaDB" ? "ChromaDB" : "Pinecone";
    const dbKeyResponse = await prompts({
      type: "text",
      name: "dbKey",
      message: `Please enter your ${keyName} key:`,
    });

    console.log(
      `OpenAI API Key set to: ${apiKeyResponse.apiKey} and ${keyName} Key set to: ${dbKeyResponse.dbKey}`
    );

    saveConfig(apiKeyResponse.apiKey, dbKeyResponse.dbKey);
  });

const CONFIG_PATH = path.join(os.homedir(), ".interveneconfig");

function saveConfig(openAIKey: string, vectorDbKey: string) {
  const config = {
    openAIKey,
    vectorDbKey,
  };
  Bun.write(CONFIG_PATH, JSON.stringify(config, null, 2));
}

program.parse();
