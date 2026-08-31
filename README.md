<p align="center">
  <img src="frontend/public/resources/images/logo.png" width="200" alt="Lazy Review Logo">
</p>

# Lazy Review

Lazy Review is an offline-first AI code reviewer. It provides a full-stack environment (CLI and Web UI) for downloading repositories, generating automated AI code reviews, and searching through your codebase using local AI models.

## 🚀 Features

- **Local & Offline AI Reviews:** Built-in integration with the QVAC SDK for fully offline AI code reviews, ensuring complete privacy.
- **Automated PR Review Pipeline:** A multi-agent ReAct (Reasoning + Acting) pipeline that autonomously analyzes Pull Requests, gathers evidence across your codebase, and adversarialy verifies findings before reporting.
- **Resilient Local LLM Execution:** Features a robust JSON fallback parser that seamlessly intercepts raw text tool calls from local models and dynamically injects results, completely bypassing strict API structural validations.
- **Repository Management:** Easily connect to GitHub, download repositories, and manage your local codebases via an intuitive React UI.
- **Semantic Code Search:** Leverages local vector embeddings to allow you to semantically search your codebase. Optimized text bounds guarantee safe tokenization even for models with small (e.g. 512) context windows.
- **100% Offline AI Support:** Built exclusively on top of the QVAC SDK, ensuring your code never leaves your local machine.

## 🛠️ Tech Stack & Architecture

Lazy Review uses a full-stack architecture designed for local AI inference:

### Backend

- **Node.js & Express.js:** The core server providing REST APIs for GitHub integration, AI providers, and project management.
- **QVAC Server Integration (`@qvac/sdk`):** Provides the ability to download, manage, and run local open-weight AI models (e.g., Qwen, GTE) directly on your machine. This ensures code privacy and allows the reviewer to function completely offline.
- **LangChain:** Framework for orchestrating the AI sub-agents, seamlessly integrated with the QVAC SDK.
- **WebSockets (`socket.io`):** Facilitates real-time, bi-directional communication to stream project creation logs and live agent terminal outputs to the frontend.

### Database & Storage

- **SQLite (`better-sqlite3` & `typeorm`):** A lightweight, fast relational database used to store project configurations, GitHub repository metadata, and AI provider settings locally.
- **Vector Database (`sqlite-vec`):** We leverage the `sqlite-vec` extension to use SQLite as a local vector database. This is used in tandem with local embedding models (like GTE_LARGE) to store code embeddings, enabling fast, semantic similarity searches across your codebase without relying on external cloud vector stores.

### Frontend

- **React & Vite:** A web UI scaffolding.
- **Component Architecture:** A highly modular, responsive design (featuring Dark/Light modes) with tailored components for the Dashboard, Deployment Terminal, AI Provider settings, and Repo Selection.

## ⚠️ Performance & Hardware Limitations

### Testing Environment

This application was actively developed and tested on a **Mac Mini** (Apple Silicon).

### GPU vs CPU Inference

By default, **GPU inference is enabled** for all AI model execution to ensure the highest possible performance and speed. However, we provide a built-in feature to toggle between GPU and CPU inference via the application settings.

### Limitations for Lower-End Devices

Running an autonomous, multi-agent AI pipeline locally is a highly resource-intensive task:

- Lower-end devices or machines lacking a dedicated GPU/Apple Silicon may struggle to execute the review pipeline smoothly.
- **Context Size Constraints**: While we have optimized token chunking for semantic embeddings to fit safely within a 512-token context window, processing large pull requests still requires substantial RAM and compute overhead.
- You may experience significantly longer wait times or out-of-memory (OOM) crashes if your device has limited memory.

### Known GPU Issues (The "Old GPU Problem")

Older GPUs or unsupported drivers may experience failures when attempting to load large quantized language models or embedding models into VRAM. If the application crashes during model initialization, please switch to **CPU Inference** in the settings. This bypasses the GPU entirely at the cost of slower inference speeds.

## 📦 Getting Started

### Option A — Install the CLI from npm (recommended for users)

```bash
npm install -g lazy-review
lazy-review run
```

This starts the Express server (default port `16500`), builds/serves the web UI,
and opens your browser. Use `lazy-review run -p 8080` to change the port.

Data (SQLite database, downloaded models) is stored in `~/.lazy-review`, so it
survives upgrades and works no matter which directory you run the CLI from.

Other CLI commands:

```bash
lazy-review list-projects   # List all tracked projects
lazy-review delete-project <id>  # Delete a tracked project by ID
lazy-review --help          # Show all commands
```

### Option B — Develop from source

### Prerequisites

- Node.js (v18+)
- pnpm package manager

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/DjibrilM/lazy-review.git
   cd lazy-review
   ```

2. Install dependencies for both the backend and frontend:

   ```bash
   pnpm install
   ```

3. Run the development environment:

   ```bash
   pnpm run dev
   ```

   This will start both the Express backend server (default port `16500`) and the Vite frontend concurrently.

4. Open your browser and navigate to the frontend URL (typically `http://localhost:5173`) to start using Lazy Review!

To build for production and run the packaged app locally:

```bash
pnpm run prod:build   # builds backend + frontend into dist/
node dist/bin.js run
```

## 📜 License

MIT License
