<p align="center">
  <img src="./logo.png" width="200" alt="Lazy Review Logo">
</p>

# Lazy Review

A fully offline AI code reviewer. Run it once and it spins up a local Express server with a React UI — no cloud, no subscriptions, no code leaving your machine.

It connects to GitHub to fetch your PRs, runs a multi-agent review pipeline against your local models, and posts the review back as a GitHub comment.

## Features

**Offline-first by design** — The entire stack runs locally. AI inference is handled by the [QVAC SDK](https://www.npmjs.com/package/@qvac/sdk), which downloads and manages open-weight models directly on your machine. A coding LLM (~5 GB RAM) handles review generation; a separate embedding model (~2 GB RAM) handles semantic search.

**Multi-agent review pipeline** — A single LLM call isn't enough for a thorough review. Lazy Review orchestrates five specialized agents:

- **Change Analyzer** — reads the diff and decides which review lenses are needed (security, performance, concurrency, correctness, architecture, maintainability)
- **Specialist Reviewer** — investigates the PR through a specific lens, forming hypotheses without reading raw files directly
- **Repository Explorer** — a sub-agent with deterministic file tools (`read_file`, `search_symbol`, `semantic_search`) that the Reviewer delegates evidence-gathering to
- **Finding Verifier** — acts as a red team. Before anything is reported, it actively tries to _disprove_ each finding by searching for cleanup handlers, timeouts, or lifecycle methods that would make the issue impossible
- **Secret Scanner** — scans diff file names for sensitive candidates (`.env`, private keys, credential bundles), then reads the actual diff content to confirm before flagging anything

**Semantic codebase indexing** — When you add a repository, Lazy Review walks the source tree, extracts symbols via Tree-sitter (TypeScript, JavaScript, Python, Rust, Go), and stores embeddings in a local SQLite vector database using `sqlite-vec`. Content is chunked at safe token boundaries to fit within the embedding model's 512-token context window without truncation.

**Resilient tool-call parsing** — Local models don't always produce perfectly structured output. The agent loop includes a JSON fallback parser and a regex parser for non-standard tool-call formats (e.g., `<|tool_call|>` dialect) so the pipeline keeps running even when the model's output is messy. Tool results from fallback-parsed calls are injected as `user` messages to bypass strict API structural validation.

**Real-time streaming** — Project creation logs and agent progress are streamed to the frontend over WebSockets via `socket.io`. Model download progress is also streamed byte-by-byte so you can see exactly what's happening.

**Model preloading** — At startup, both models are loaded into memory in the background before any request comes in. The HTTP server starts accepting connections immediately, so if preloading finishes before the first review request, the cold-start latency disappears entirely.

## How a review works

1. You select a GitHub repository and a PR from the UI.
2. Lazy Review fetches the PR diff and description via the GitHub API.
3. The **Change Analyzer** classifies the change and decides which specialist agents to spawn.
4. Each **Specialist Reviewer** forms hypotheses, then delegates evidence queries to the **Repository Explorer**, which has access to the local filesystem and the semantic index.
5. Every candidate finding is passed to the **Finding Verifier**, which attempts to disprove it. Only confirmed findings make it through.
6. The **Secret Scanner** runs independently, checking for leaked credentials.
7. Surviving findings are deduplicated by a hash of their text and location, then ranked by `Impact × Likelihood`.
8. The final structured review (`approve` / `request_changes` / `comment`) is posted as a GitHub PR comment.

## Tech stack

| Layer       | Tech                                          |
| ----------- | --------------------------------------------- |
| Backend     | Node.js, Express 5, TypeScript                |
| AI          | QVAC SDK, LangChain                           |
| Database    | SQLite (TypeORM + better-sqlite3), sqlite-vec |
| AST Parsing | Tree-sitter (TS, JS, Python, Rust, Go)        |
| Real-time   | socket.io                                     |
| Frontend    | React, Vite, TanStack Query                   |
| CLI         | Commander.js                                  |

## Hardware requirements

Developed and tested on a Mac Mini (Apple Silicon). You need enough free RAM to hold both models simultaneously:

| Model           | RAM            |
| --------------- | -------------- |
| Coding LLM      | ~5 GB          |
| Embedding Model | ~2 GB          |
| **Total**       | **~7 GB free** |

GPU inference is available and can be toggled in Settings. If you hit crashes during model initialization on an older GPU, switch to CPU inference — it's slower but stable.

## Getting started

### Install from npm (recommended)

```bash
npm install -g @djibrilm/lazy-review
lrv run
```

Open `http://localhost:16500` in your browser.

You can also specify a custom port:

```bash
lazy-review run --port 8080
```

### Run from source

**Prerequisites:** Node.js 18+, pnpm

```bash
git clone https://github.com/djibrilm/lazy-review
cd lazy-review
pnpm install
pnpm run dev
```

This starts the Express backend on port `16500` and the Vite dev server concurrently.

## First-time setup

1. Go to **Settings → Local AI Models** and download both models. The download progress is shown live.
2. Go to **Settings → GitHub Authentication** and connect your GitHub account.
3. Add a repository from the dashboard. Lazy Review will clone it and index the codebase using Tree-sitter and local embeddings.
4. Open any PR from the repository view and click **Run Review**.

## License

MIT
