import fs from 'fs';
import chalk from 'chalk';
import { Command } from 'commander';
import newGithubIssueUrl from 'new-github-issue-url';
import ora, { Ora, Options as OraOptions } from 'ora';
import prompts from 'prompts';
import { CodeGenLanguage } from '~/agent/code-gen';
import Parser from '~/agent/index';

import { configFile, getConfig } from '~/utils/config';
import { formatList } from '~/utils/list-format';
import { t } from '~/utils/template';

import { version } from '../../package.json';

class CLI {
  program: Command;
  loader?: Ora;
  currentAction?: Command;

  constructor() {
    this.program = new Command();
  }

  init() {
    this.program
      .name('intervene-parser')
      .description(
        'CLI for Intervene to parse natural language to type safe API calls',
      )
      .version(version);

    this.program
      .command('configure')
      .description('Configure OpenAI API and select a vector db')
      .action(this.configure);

    this.program
      .command('parse')
      .description('Parse natural language to type safe API calls')
      .argument(
        '<objective>',
        'The objective in natural language. Must be atomic',
      )
      .argument(
        '<openapis>',
        'comma-separated list of absolute paths to OpenAPI spec files',
      )
      .option(
        '-l, --language <language>',
        `Language to generate code for. Supports: ${formatList(
          Object.values(CodeGenLanguage),
        )}`,
      )
      .option(
        '-c, --context <context>',
        'A JSON object string or path to file containing the object. The keys should be the names of the context variables and the values will be the JSON schemas of those variables.',
      )
      .action(this.parse);

    this.program.hook('preAction', async (_, action) => {
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
    console.log(chalk.green(...text));
  }

  async info(...text: string[]) {
    console.log(chalk.white(...text));
  }

  async warn(...text: string[]) {
    console.log(chalk.yellow(...text));
  }

  async error(...text: string[]) {
    console.log(chalk.red(...text));

    const actionName = this.currentAction?.name();

    const url = newGithubIssueUrl({
      user: 'tryintervene',
      repo: 'parser',
      title: `[CLI-ERROR] Error while running '${actionName}'`,
      body: t(
        [
          'Hey,',
          'I encountered this error when running the parser:',
          'action: {{actionName}}',
          'arguments: {{args}}',
          'error: \n{{error}}',
        ],
        {
          actionName,
          args: JSON.stringify(this.currentAction?.processedArgs),
          error: text.join('\n'),
        },
      ),
    });

    this.program.error(
      'Unexpected error occurred. If you think this is a bug, please click this link to open a GitHub issue: ' +
        url,
    );
  }

  private configure = async () => {
    let {
      OPENAI_API_KEY,
      VECTOR_STORE,
      PINECONE_INDEX,
      PINECONE_ENVIRONMENT,
      PINECONE_API_KEY,
    } = getConfig();

    OPENAI_API_KEY = (
      await prompts({
        type: 'text',
        name: 'OPENAI_API_KEY',
        message: 'Please enter your OpenAI API key:',
        initial: OPENAI_API_KEY,
      })
    ).OPENAI_API_KEY;

    VECTOR_STORE = (
      await prompts({
        type: 'select',
        name: 'VECTOR_STORE',
        message: 'Choose a vector db:',
        choices: [
          {
            title:
              'vectra (zero-setup, not recommended for specs larger than a MB) ',
            value: 'chromadb',
          },
          { title: 'ChromaDB', value: 'chromadb' },
          { title: 'Pinecone', value: 'pinecone' },
        ],
        initial: VECTOR_STORE,
      })
    ).VECTOR_STORE;

    switch (VECTOR_STORE) {
      case 'pinecone':
        PINECONE_INDEX = (
          await prompts({
            type: 'text',
            name: 'PINECONE_INDEX',
            message: 'Please enter name of the pinecone index:',
            initial: PINECONE_INDEX,
          })
        ).PINECONE_INDEX;

        PINECONE_ENVIRONMENT = (
          await prompts({
            type: 'text',
            name: 'PINECONE_ENVIRONMENT',
            message:
              'What environment does your pinecone index use? (eg gcp-starter):',
            initial: PINECONE_ENVIRONMENT,
          })
        ).PINECONE_ENVIRONMENT;

        PINECONE_API_KEY = (
          await prompts({
            type: 'text',
            name: 'PINECONE_API_KEY',
            message: 'Please enter your pinecone api key:',
            initial: PINECONE_API_KEY,
          })
        ).PINECONE_API_KEY;
        break;

      default:
        break;
    }

    await fs.promises.writeFile(
      configFile,
      JSON.stringify({
        VECTOR_STORE,
        OPENAI_API_KEY,
        PINECONE_INDEX,
        PINECONE_ENVIRONMENT,
        PINECONE_API_KEY,
      }),
    );
  };

  private async parse(
    objective: string,
    $files: string,
    options: { language: CodeGenLanguage; context: string },
  ) {
    const files = ($files ?? '').split(',');
    process.env = { ...(await getConfig()) };

    let context = {};
    try {
      if (fs.existsSync(options.context)) {
        context = JSON.parse(
          await fs.promises.readFile(options.context, 'utf8'),
        );
      }
    } catch (e) {}
    console.log(objective, files, context);

    const parser = new Parser(this, options.language);

    await parser.parse(objective, context, files);
  }
}

export const cli = new CLI();
