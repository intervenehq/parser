# Intervene Parser

<p align="center">
  <img src="public/images/logo.jpg" alt="Intervene Parser Logo" width="200" height="200">
</p>

## Introduction

LLMs can do wondrous things, but translating a natural language query into an actionable piece of code is difficult. Despite it generating code well, there's no validation layer that checks for the correctness of APIs that are used by it, which is a subset of what we frequently refer to as "hallucination".

Intervene is our quest to try and make LLMs deterministic.

## Example

A good <strong>example</strong> is if you were to to ask GPT4 to write TypeScript to use Stripe's APIs to get a customer, given an email. We've seen it hallucinate often where it will try to fetch a customer via Stripe's customer API by supplying an email, but in practice that's not how it works.
A customer can only be got through a customerId, and if supplied an email, multiple customers can exist in Stripe. All of this nuance is generally lost because GPT has no additional context of the API in question, and has no capability of going back and checking if the API for the use case is valid.

## How To

You can follow the guide to install dependencies and try the tool via our CLI.

To install dependencies:

```bash
bun install
```

## CLI Usage

To use the CLI, run commands using the following syntax:

bun src/cli.ts [command-name]

### Configure Command

This command allows you to set up the OpenAI API key and choose a vector database (either ChromaDB or Pinecone) along with its respective API key.

```bash
bun src/cli.ts configure
```

Follow the prompts to input or update the keys.

### Parse Command

This command lets you parse a natural language query and load a set of OpenAPI specs for further use.

```bash
bun src/cli.ts parse "[Your natural language query here]" -f "/path/to/file1.json,/path/to/file2.json"
```

The first argument is your natural language query.
Use the -f option followed by a comma-separated list of OpenAPI spec files' paths that you want to load.

For example:

```bash
bun src/cli.ts parse "Fetch customer details from Stripe" -f "./specs/stripe.json"
```
