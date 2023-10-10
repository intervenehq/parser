# Intervene Parser

<p align="center">
  <img src="public/images/logo.jpg" alt="Intervene Parser Logo" width="200" height="200">
</p>

## Introduction

Parser to translate a natural language query into an actionable piece of code.

Here's a quick demo:

https://github.com/tryintervene/parser/assets/32911377/6809b796-638e-41dc-aa75-6d3465d76988

## Problem

GPT4 currently hallucinates more often than not when dealing with APIs.

We take a user input and a corresponding OpenAPI spec, check which endpoints are the most feasible, pick one, verify the inputs and their types, and give you an expression (or code) that you can eval on your end.

## How To

You can follow the guide to install dependencies and try the tool via our CLI.

To install dependencies:

```bash
pnpm i
```

## CLI Usage

Running the CLI looks like below. You can run the help command to find out more.

```bash
pnpm tsx src/cli/run.ts help
```

### Configure Command

This command allows you to set up the OpenAI API key and choose a vector database (either ChromaDB or Vectra, an in memory vector DB) along with its respective API key.

```bash
pnpm tsx src/cli/run.ts configure
```

Follow the prompts to input or update the keys.

### Parse Command

This command lets you parse a natural language query and give you an appropriate command. The OpenAPI spec augments the LLM's knowledge on the specific API providers needed for the task.

```bash
pnpm tsx src/cli/run.ts parse "[Your natural language query here]" "/path/to/file1.json,/path/to/file2.json"
```

The first argument is your natural language query.
The second argument is a comma-separated list of OpenAPI spec files' paths that you want to load.

For example:

```bash
pnpm tsx src/cli/run.ts parse "Fetch customer details from Stripe" "./specs/stripe.json"
```
