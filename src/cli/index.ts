import chalk from "chalk";
import { Command } from "commander";
import path from "path";
import os from "os";
import prompts from "prompts";
import { CodeGenLanguage } from "~/agent/code-gen";
import { formatList } from "~/utils/list-format";
import Parser from "~/agent/index";
import ora, { Ora, Options as OraOptions } from "ora";
import newGithubIssueUrl from "new-github-issue-url";
import { t } from "~/utils/template";
import { last } from "lodash";

const configFile = Bun.file(path.join(os.homedir(), ".interveneconfig"));

export const readConfig = async (): Promise<Record<string, string>> => {
  const config = (await configFile.exists()) ? await configFile.json() : {};

  return {
    ...process.env,
    ...config,
  };
};

class CLI {
  program: Command;
  loader?: Ora;
  currentAction?: Command;

  constructor() {
    this.program = new Command();
  }

  init() {
    this.program
      .name("intervene-parser")
      .description("CLI for Intervene to parse natural language")
      .version("0.0.1");

    this.program
      .command("configure")
      .description("Configure OpenAI API and select a vector db")
      .action(this.configure);

    this.program
      .command("parse")
      .description("Parse natural language")
      .argument(
        "<objective>",
        "The objective in natural language. Must be atomic"
      )
      .argument(
        "<openapis>",
        "comma-separated list of absolute paths to OpenAPI spec files"
      )
      .option(
        "-l, --language <language>",
        `Language to generate code for. Supports: ${formatList(
          Object.values(CodeGenLanguage)
        )}`
      )
      .option(
        "-c, --context <context>",
        "A JSON object string or path to file containing the object. The keys should be the names of the context variables and the values will be the JSON schemas of those variables."
      )
      .action(this.parse);

    this.program.hook("preAction", async (_, action) => {
      this.currentAction = action;
    });

    this.program.parse();
  }

  async showLoader(options?: OraOptions) {
    this.loader?.stop();

    this.loader = ora(options);

    this.loader.start();
  }

  async hideLoader() {
    this.loader?.stop();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  async log(...text: string[]) {
    chalk.green(...text);
  }

  async info(...text: string[]) {
    chalk.white(...text);
  }

  async warn(...text: string[]) {
    chalk.yellow(...text);
  }

  async error(...text: string[]) {
    chalk.red(...text);
    const actionName = this.currentAction?.name();

    const url = newGithubIssueUrl({
      user: "tryintervene",
      repo: "parser",
      title: `[CLI-ERROR] Error while running '${actionName}'`,
      body: t(
        [
          "Hey,",
          "I encountered this error when running the parser:",
          "action: {{actionName}}",
          "arguments: {{args}}",
          "error: \n{{error}}",
        ],
        {
          actionName,
          args: JSON.stringify(this.currentAction?.processedArgs),
          error: text.join("\n"),
        }
      ),
    });

    this.program.error(
      "Unexpected error occurred. If you think this is a bug, please open an issue at " +
        url
    );
  }

  private configure = async () => {
    const currentConfig = await readConfig();
    await this.showLoader();
    // sleep
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await this.hideLoader();

    const { OPENAI_API_KEY } = await prompts({
      type: "text",
      name: "OPENAI_API_KEY",
      message: "Please enter your OpenAI API key:",
      initial: currentConfig?.OPENAI_KEY,
    });

    const { VECTOR_STORE } = await prompts({
      type: "select",
      name: "VECTOR_STORE",
      message: "Choose a vector db:",
      choices: [
        { title: "ChromaDB", value: "chromadb" },
        { title: "vectra (built-in)", value: "vectra" },
      ],
      initial: currentConfig?.VECTOR_STORE === "chromadb" ? 0 : 1,
    });

    const writer = configFile.writer();
    writer.write(JSON.stringify({ VECTOR_STORE, OPENAI_API_KEY }));
    await writer.end();
  };

  private async parse(
    objective: string,
    $files: string,
    options: { language: CodeGenLanguage; context: string }
  ) {
    const files = ($files ?? "").split(",");

    const context = (await Bun.file(options.context).exists())
      ? Bun.file(options.context).json()
      : JSON.parse(options.context ?? "{}");
    const parser = new Parser(this, options.language);

    await parser.parse(objective, context, files);
  }
}

export const cli = new CLI();

if (!!process.env.CLI) {
  cli.init();
}
