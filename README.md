# Intervene Parser

<p align="center">
  <img src="https://raw.githubusercontent.com/tryintervene/parser/main/public/images/logo.jpg" alt="Intervene Parser Logo" width="200" height="200">
  <br />
  <br />
  <a href="https://discord.gg/tsgtfUEvWk">
   <img src="https://dcbadge.vercel.app/api/server/tsgtfUEvWk?compact=true&style=flat" alt="Discord"/>
  </a>

[Introduction](#introduction) |
[How to use](#usage) |
[FAQs](#faqs) |
[Contact](mailto:me@sudhanshug.com)

</p>

> Launching a drop-in replacement to Zapier NLA by Nov 7th! Please contact me [me@sudhanshug.com](mailto:me@sudhanshug.com) if you have any questions.

## Introduction

_Open source Natural Language Actions (NLA)_

Translate natural language into API calls.

<br/>

### Here is a web based demo to try it out:
https://tryintervene.github.io/parser-demo/

<br />

Here's a quick demo video:

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

## Usage

You can install the parser by running:

```bash
npm install @intervene/parser
```

> Note: The project is under active development and has not reached v0 yet. Proceed with caution and report any issues you may notice.

## FAQs

### This looks cool, but what about prod?

You can use the library as is in production but proceed with caution as it is under active development.

If you're interested in a hosted solution, please [fill out this quick form](https://tally.so/r/wzMJ8a), and I will get back to you in no time!

### Can it run with GPT 3.5?

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
