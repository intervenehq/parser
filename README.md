# Intervene Parser

<p align="center">
  <img src="public/images/logo.jpg" alt="Intervene Parser Logo" width="200" height="200">
</p>

## Introduction

*Use LLMs to generate type-safe and context-safe API calls given a natural language query.*

<br/>

Here's a quick demo:

https://github.com/tryintervene/parser/assets/9914480/8797935b-6335-46f1-a50d-b2ce20091a6a




Here's a sample output:
```bash
{
    "provider": "<API provider name>",
    "method": "<Http Method>",
    "path": "<API endpoint to call>",
    "bodyParams": "<eval'able function to return body params>",
    "queryParams": "<eval'able function to return query params>",
    "pathParams": "<eval'able function to return path params>",
    "requestContentType": "application/x-www-form-urlencoded",
    "responseContentType": "application/json",
    "responseSchema": "<schema of the Response>"
  }
```

## Problem

The core of internet is free inter-connectivity. That has stayed true for client-server interactions but server-to-server communications aren't as streamlined.

The reason is simple: *human creativity*. Every API has its own special headers, weird parameter names and the invisible context (eg. you need to create customer before creating a subscription in stripe).

AI can solve this. But the foundation is not laid yet.

## Solution

A framework to hinge the AI. Break the problem down into byte sized pieces and let the AI take atomic decisions.

The inspiration is human problem-solving, just like a software engineer:

* Remembers the objective
* Searches relevant APIs
* Reviews API specifications
* Matches available data with required parameters
* Writes the API call


## How To

You can follow the guide to install dependencies and try the tool via our CLI.

To install dependencies:

```bash
pnpm i
```
or
```bash
npm install
```

## CLI Usage

Running the CLI looks like below. You can run the help command to find out more.

```bash
pnpm cli help
```
or
```bash
npx tsx src/cli/run.ts help
```

### Configure Command

This command allows you to set up the OpenAI API key and choose a vector database (either ChromaDB or Vectra, an in memory vector DB) along with its respective API key.

```bash
pnpm cli configure
```
or
```bash
npx tsx src/cli/run.ts configure
```

Follow the prompts to input or update the keys.

### Parse Command

This command lets you parse a natural language query and give you an appropriate command. The OpenAPI spec augments the LLM's knowledge on the specific API providers needed for the task.

```bash
pnpm cli parse "[Your natural language query here]" "/path/to/file1.json,/path/to/file2.json"
```
or
```bash
npx tsx src/cli/run.ts parse "[Your natural language query here]" "/path/to/file1.json,/path/to/file2.json"
```

The first argument is your natural language query.
The second argument is a comma-separated list of OpenAPI spec files' paths that you want to load.

For example:

```bash
pnpm cli parse "Fetch customer details from Stripe" "./specs/stripe.json"
```

## Credits

Special credits to [@rohanmayya](https://github.com/rohanmayya) for helping lay foundation for this project.
