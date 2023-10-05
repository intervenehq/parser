# Intervene Parser

<p align="center">
  <img src="public/images/logo.jpeg" alt="Intervene Parser Logo" width="200" height="200">
</p>

## Introduction

LLMs can do wondrous things, but translating a natural language query into an actionable piece of code is difficult. Despite it generating code well, there's no validation layer that checks for the correctness of APIs, which we frequently refer to as "hallucination".

We're trying to combat that. Given a natural language input, an API spec, and optionally some more context, we try to reliably map your query to an endpoint after extracting inputs.

We try to match the types of the inputs and the request body, as well as check which input is most likely to be valid for the given request body.

## How To

You can follow the guide to install dependencies and try the tool via our CLI.

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```
