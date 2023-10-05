# Intervene Parser

<p align="center">
  <img src="public/images/logo.jpeg" alt="Intervene Parser Logo" width="200" height="200">
</p>

## Introduction

LLMs can do wondrous things, but translating a natural language query into an actionable piece of code is difficult. Despite it generating code well, there's no validation layer that checks for the correctness of APIs that are used by it, which is a subset of what we frequently refer to as "hallucination".

A good <strong>example</strong> is if you were to to ask GPT4 to write TypeScript to use Stripe's APIs to get a customer, given an email. We've seen it hallucinate often where it will try to fetch a customer via Stripe's customer API by supplying an email, but in practice that's not how it works.
A customer can only be got through a customerId, and if supplied an email, multiple customers can exist in Stripe. All of this nuance is generally lost because GPT has no additional context of the API in question, and has no capability of going back and checking if the API for the use case is valid.

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
