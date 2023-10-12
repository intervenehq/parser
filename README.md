# Intervene Parser

<p align="center">
  <img src="public/images/logo.jpg" alt="Intervene Parser Logo" width="200" height="200">
  <br />
  <br />
  <a href="https://discord.gg/tsgtfUEvWk">
   <img src="https://dcbadge.vercel.app/api/server/tsgtfUEvWk?compact=true&style=flat" alt="Discord"/>
  </a>

[Introduction](#introduction) |
[Demo](#demo) |
[How to use](#try-it) |
[Problem](#problem) |
[Solution](#solution) | 
[FAQs](#faqs)

</p>

## Introduction

_Use LLMs to generate type-safe and context-safe API calls from natural language._

<br/>

Here's a quick demo:

https://github.com/tryintervene/parser/assets/9914480/b91eb0d2-64c5-4231-8989-1c27a105c3be

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

The core principle of the internet revolves around free inter-connectivity. That has stayed true for client-server interactions but server-to-server communications aren't as streamlined.

The reason is simple: _human creativity_. Every API has its own special headers, weird parameter names and the invisible context (eg. you need to create customer before creating a subscription in stripe).

AI can solve this. But the foundation is not laid yet.

## Solution

A framework to anchor the AI. Break the problem down into byte sized pieces and let the AI take atomic decisions.

The inspiration is human problem-solving, just like a software engineer:

- Remembers the objective
- Searches relevant APIs
- Reviews API specifications
  - Zooms in on chunks of properties
  - Shortlists properties
  - Goes to the next chunk, repeat
  - Zooms back out with a final shortlist
- Matches available data with required parameters
  - The same zoom-in and zoom-out happens here as well
- Writes the API call

## Try it!

We have a CLI for you. Please clone the repository

### Install dependencies

```bash
pnpm i
```

or

```bash
npm install
```

### Configure

You will need to configure the CLI by running the `configure` command:

```bash
pnpm cli configure
```

or

```bash
npx tsx src/cli/run.ts configure
```

(You can also alternatively use Environment Variables, see [`src/utils/config.ts`](https://github.com/tryintervene/parser/blob/main/src/utils/config.ts))

https://github.com/tryintervene/parser/blob/d14bb84f56057fe1740ab34e07a1033f82a17219/src/cli/index.ts

### Parse Command

Use this command to generate an API call:

```bash
pnpm cli parse "[Your natural language query here]" "/path/to/file1.json,/path/to/file2.json"
```

Additionally, the `--context` option allows you to provide historical context for the API. Think of it as supplying a collection of variables to be referenced within a statement.

You can look for demo files in [`/demo`](https://github.com/tryintervene/parser/blob/main/demo)

The output generated has JS code by default, you can use the `-l` flag to switch between [javascript, python, ruby, php]

### Help

To learn about the commands in more details, please refer to the help command

```bash
pnpm cli help
```

```bash
pnpm cli help parse
```

## FAQs

### This looks cool, but what about prod?

With a few tweaks, you can use this project in your production environment.

If you're interested in a hosted solution, please [fill out this quick form](https://tally.so/r/wzMJ8a), and I will get back to you in no time!

### This is expensive!

Indeed, the tool makes numerous LLM calls.

You can use GPT 3.5 (or equivalent) which will make this a lot faster, cheaper but less accurate. You can go this route for simpler API calls that need to extract data from the user prompt. You can use the `--trivial` flag to do this

However, the code can be optimized to use the less capable models for selective tasks. Open to PRs :)

### What about other LLMs?

This project works only with OpenAI models for now. I will be exploring other LLMs as well. Let me know [which one you want by opening an issue here](https://github.com/tryintervene/parser/issues/new?title=Request%20to%20integrate%20LLM:%20[LLM]&body=Hi,%20can%20you%20please%20add%20the%20following%20LLM%20to%20the%20parser:%20) or feel free to open a PR!

### Umm I don't like JavaScript. What about python?

Before porting it to Python or Golang (or both), I want to determine if there are any real-world use cases for this technology. Please try out the CLI, share your thoughts, and I will promptly port it to other languages based on the feedback.

I chose to start with a statically typed language due to the nature of the project. I could have used Golang, but I aimed for simplicity, hence the choice of TypeScript.

### I want to contribute

Awesome! PRs and issues are welcome!

## Credits

Credits to [LangChain](https://github.com/langchain-ai/langchain) and [LlamaIndex](https://github.com/run-llama/llama_index) for the inspiration for some of the techniques used in the project.

Special credits to [@rohanmayya](https://github.com/rohanmayya) for helping lay the foundation for this project.
