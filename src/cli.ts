import { Command } from "commander";
import prompts from "prompts";

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

    // You can save the keys as needed, perhaps in an environment file or elsewhere.
  });

program.parse();
