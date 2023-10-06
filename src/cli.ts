import { Command } from "commander";
import prompts from "prompts";
import path from "path";
import os from "os";

const program = new Command();

const CONFIG_PATH = path.join(os.homedir(), ".interveneconfig");

function saveConfig(openAIKey: string, dbKeyName: string, vectorDbKey: string) {
  const config = {
    OPENAI_KEY: openAIKey,
    VECTORDB: {
      NAME: dbKeyName,
      KEY: vectorDbKey,
    },
  };

  try {
    Bun.write(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log("Configuration saved successfully!");
  } catch (error) {
    console.error("Error saving the configuration:", error);
  }
}

async function readConfig() {
  const configFile = Bun.file(CONFIG_PATH);

  if (await configFile.exists()) {
    console.log("Configuration file found!");
    return JSON.parse(JSON.stringify(await configFile.json()));
  } else {
    console.log("No configuration file found, creating one...");
    await Bun.write(CONFIG_PATH, JSON.stringify({}));
    return;
  }
}

program
  .name("intervene-cli")
  .description("CLI for Intervene to parse natural language")
  .version("0.0.1");

program
  .command("configure")
  .description("Configure OpenAI API and select a vector db")
  .action(async () => {
    const currentConfig = await readConfig();

    const apiKeyResponse = await prompts({
      type: "text",
      name: "apiKey",
      message: "Please enter your OpenAI API key:",
      initial: currentConfig?.OPENAI_KEY,
    });

    const vectorDbResponse = await prompts({
      type: "select",
      name: "vectorDb",
      message: "Choose a vector db:",
      choices: [
        { title: "chromaDB", value: "chromaDB" },
        { title: "pinecone", value: "pinecone" },
      ],
      initial: currentConfig?.VECTORDB?.NAME === "ChromaDB" ? 0 : 1,
    });

    let keyName =
      vectorDbResponse.vectorDb === "chromaDB" ? "ChromaDB" : "Pinecone";
    const dbKeyResponse = await prompts({
      type: "text",
      name: "dbKey",
      message: `Please enter your ${keyName} key:`,
      initial: currentConfig?.VECTORDB?.KEY,
    });

    console.log(
      `OpenAI API Key set to: ${apiKeyResponse.apiKey} and ${keyName} Key set to: ${dbKeyResponse.dbKey}`
    );

    saveConfig(apiKeyResponse.apiKey, keyName, dbKeyResponse.dbKey);
  });

program
  .command("parse")
  .description("Parse your natural language query")
  .action(async () => {
    console.log("Hello World!");
  });

program.parse();
