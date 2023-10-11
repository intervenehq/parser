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
<br />

You will need to configure the CLI by running the `configure` command:
```bash
pnpm cli configure
```
or
```bash
npx tsx src/cli/run.ts configure
```

(You can also alternatively use Environment Variables as well, see [`src/utils/config.ts`](https://github.com/tryintervene/parser/blob/main/src/utils/config.ts))


https://github.com/tryintervene/parser/blob/d14bb84f56057fe1740ab34e07a1033f82a17219/src/cli/index.ts

### Parse Command

Use this command to generate an API call:

```bash
pnpm cli parse "[Your natural language query here]" "/path/to/file1.json,/path/to/file2.json"
```

### Help
To learn about the commands in more details, please refer to the help command

```bash
pnpm cli help
```

## Credits

Credits to LangChain and LlamaIndex for the inspiration for some of the techniques.

Special credits to [@rohanmayya](https://github.com/rohanmayya) for helping lay foundation for this project.
