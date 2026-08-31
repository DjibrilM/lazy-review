<p align="center">
  <img src="https://github.com/DjibrilM/lazy-review/raw/develop/frontend/public/resources/images/logo.png" width="200" alt="Lazy Review Logo">
</p>

# Lazy Review — PR Review Assistant

A CLI tool that reviews GitHub pull requests using local AI models. Point it at a repository, select a PR, and it posts a structured review comment back to GitHub — no cloud inference, no API keys beyond GitHub OAuth.

## Installation

Lazy Review relies on several native C++ modules (like `better-sqlite3` and `tree-sitter`) for fast local vector search and code parsing. Because of this, **we strongly recommend using `npm`** for the global installation.

```bash
npm install -g @djibrilm/lazy-review
lrv run
```

This will start the local server on `http://localhost:16500`.

### Troubleshooting Installation Errors

If you encounter an error like `Error: Could not locate the bindings file`, it means the native dependencies failed to compile or download during installation.

**1. Using `pnpm` or `yarn`**
These block build scripts by default, preventing C++ binaries from downloading.

- **For pnpm:** Run `pnpm approve-builds -g`. Use the `Space` bar to select the blocked packages, then press `Enter`.
- **For yarn:** Add `enableScripts: true` to your `.yarnrc.yml` before installing.
  _(Alternatively, just install via `npm` instead)._

**2. Missing Build Tools**
If you are on a very new or uncommon version of Node.js (e.g. Node 26), prebuilt binaries may not exist yet, forcing the modules to compile from source. If this fails, ensure you have C++ build tools installed:

- **macOS:** Run `xcode-select --install`
- **Linux:** Run `sudo apt-get install build-essential python3`
- **Windows:** Run `npm install --global windows-build-tools`

**3. EPERM: operation not permitted (macOS/Linux)**
If you are installing globally using `sudo npm install -g @djibrilm/lazy-review` and see a `Download failed: EPERM` error, `npm` has downgraded permissions during the post-install step. To fix this, tell `npm` to keep root permissions during the installation scripts:

```bash
sudo npm install -g @djibrilm/lazy-review --unsafe-perm
```

### From source

Requires Node.js 18+ and pnpm.

```bash
git clone https://github.com/djibrilm/lazy-review
cd lazy-review
pnpm install
pnpm run dev
```

This starts both the Express server (port `16500`) and the Vite dev server concurrently.

## Overview

Lazy Review fetches PR diffs from GitHub and runs them through a multi-agent pipeline on your machine. The output is a structured GitHub PR review comment with categorized findings (`approve` / `request_changes` / `comment`), severity scores, and file-level annotations.

It uses two models:

- A coding LLM (~5 GB RAM) for review generation
- An embedding model (~2 GB RAM) for semantic codebase search

Both are downloaded and managed via the [QVAC SDK](https://www.npmjs.com/package/@qvac/sdk).

## Review pipeline

A review goes through five sequential stages:

1. **Change Analyzer** — classifies the PR diff and selects which specialist reviewers are needed (e.g. `security`, `performance`, `concurrency`, `correctness`, `architecture`, `maintainability`)
2. **Specialist Reviewers** — each runs a ReAct loop, forming hypotheses and querying the Repository Explorer for evidence rather than reading files directly
3. **Repository Explorer** — a sub-agent with deterministic tools (`read_file`, `search_symbol`, `semantic_search`) that answers evidence queries from the Specialist Reviewers
4. **Finding Verifier** — receives each candidate finding and attempts to disprove it by searching for cleanup handlers, timeouts, or lifecycle methods that would make the issue a false positive
5. **Secret Scanner** — independently scans diff file names for sensitive candidates (`.env`, private keys, credential bundles), reads the actual diff content to confirm before reporting

Confirmed findings are deduplicated by a hash of their text and location, ranked by `Impact × Likelihood`, and included in the final review verdict (`approve` / `request_changes` / `comment`).

## Codebase indexing

When you add a repository, Lazy Review scans the source tree and builds a local vector index. It:

- Parses symbols from TypeScript, JavaScript, Python, Rust, and Go files using Tree-sitter
- Chunks content at safe token boundaries (the embedding model has a 512-token context window)
- Stores embeddings in SQLite using the `sqlite-vec` extension

The index is used during reviews to provide semantic context to the agents.

## Tool-call parsing

Local models don't always return well-structured tool calls. The agent loop handles two fallback cases:

- A regex parser for non-standard formats (e.g. the `<|tool_call|>` dialect used by some quantized models)
- Tool results from fallback-parsed calls are injected as `user` messages to avoid strict API validation errors

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

Tested on a Mac Mini (Apple Silicon). You need ~7 GB of free RAM to hold both models simultaneously:

| Model           | RAM   |
| --------------- | ----- |
| Coding LLM      | ~5 GB |
| Embedding Model | ~2 GB |

Since the models alone take up around 7 GB and other computer operations also need space, a good environment should have around 12 GB to 16 GB of total RAM.

GPU inference can be toggled in Settings. If the app crashes during model initialization (common on older GPUs), switch to CPU inference.

## CLI Commands

The CLI is available as either `lazy-review` or the `lrv` shorthand.

### `run`

Starts the Lazy Review server.

```bash
lrv run
```

## Setup

1. Open Settings → Local AI Models and download both models.
2. Open Settings → GitHub Authentication and connect your GitHub account.
3. Add a repository from the dashboard. Lazy Review will clone it and index the codebase.
4. Select a PR from the repository view and run a review.

## License

MIT
