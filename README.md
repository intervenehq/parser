# Intervene Parser

<p align="center">
  <img src="public/images/logo.jpeg" alt="Intervene Parser Logo" width="200" height="200">
</p>

## Introduction

LLMs can do wondrous things, but translating a natural language query into an actionable piece of code is difficult. Despite it generating code well, there's no validation layer that checks for the correctness of APIs that are used by it, which we frequently refer to as "hallucination".

A good <strong>example</strong> is if you were to to ask GPT4 to write a TypeScript to use Stripe's APIs to get a customer, given an email. We've seen it hallucinate often where it will try to fetch a customer via their customer API by supplying an email, but in practice that's not how it works.
A customer can only be got through a customerId, and if supplied an email, multiple customers can exist in Stripe. So there needs to be a filter operation on top of the API call.

We're trying to combat that. Given a natural language input, an API spec, and optionally some more context, we try to reliably map your query to an endpoint after extracting inputs.
We try to match the types of the inputs and the request body, as well as check which input is most likely to be valid for the given request body.

Intervene is our quest to try and make LLMs deterministic.

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
