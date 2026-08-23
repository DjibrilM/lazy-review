# AI Agent Review Pipeline

This directory implements a **Multi-Agent, Evidence-Driven Code Review Pipeline**. Rather than relying on a single large language model (LLM) call to review a Pull Request, this architecture orchestrates a team of specialized AI agents that formulate hypotheses, actively search the repository for evidence, and adversarially verify their own findings.

---

## The Multi-Agent Architecture

The pipeline consists of one LLM dispatcher and three distinct ReAct (Reasoning + Acting) agents.

### 1. The Change Analyzer (Dispatcher)

- **File:** [`change-analyzer.ts`](file:///Users/jib/projects/lazy-review/src/modules/ai-agent/review-pipeline/change-analyzer.ts)
- **Role:** Analyzes the PR diff and description to classify the change. It determines which specialist agents are required (e.g., `performance`, `security`, `concurrency`). This is a standard, single-shot LLM call.

### 2. The Specialist Reviewer (Detective Agent)

- **File:** [`specialist-reviewer.ts`](file:///Users/jib/projects/lazy-review/src/modules/ai-agent/review-pipeline/specialist-reviewer.ts)
- **Role:** Acts as an autonomous agent looking through a specific lens (e.g., Security). It forms hypotheses about potential bugs but **cannot read raw files directly**. Instead, it is forced to use the Repository Explorer to gather concrete evidence.

### 3. The Repository Explorer (Worker Agent)

- **File:** [`repository-explorer.ts`](file:///Users/jib/projects/lazy-review/src/modules/ai-agent/review-pipeline/repository-explorer.ts)
- **Role:** A sub-agent equipped with deterministic tools (`search_symbol`, `read_file`, `semantic_search`). When queried by a Reviewer, it navigates the file system to return exact facts and line numbers.

### 4. The Finding Verifier (Skeptic Agent)

- **File:** [`finding-verifier.ts`](file:///Users/jib/projects/lazy-review/src/modules/ai-agent/review-pipeline/finding-verifier.ts)
- **Role:** A critical quality-control agent. It acts as a "Red Team" against the Specialist Reviewers. Before a finding is reported, the Verifier actively attempts to disprove it by searching for cleanup mechanisms, timeouts, or lifecycle handlers that mitigate the issue.

---

## Highlight: The ReAct Engine (`agent-loop.ts`)

The most complex and critical part of this pipeline is the underlying engine that powers the Reviewer, Explorer, and Verifier agents: [`agent-loop.ts`](file:///Users/jib/projects/lazy-review/src/modules/ai-agent/review-pipeline/agent-loop.ts).

Instead of generating a single response, the LLM runs in an iterative **Reasoning + Acting (ReAct)** loop. It can invoke tools, parse the results, and decide what to do next until a budget is exhausted.

```typescript
// Inside agent-loop.ts
while (iterations < maxIterations && toolCallsCount < maxToolCalls) {
  // 1. Ask the LLM what to do next
  const run = completion({ modelId, history, tools });

  // 2. Parse JSON tool calls (e.g., {"name": "read_file", "arguments": {"filePath": "src/db.ts"}})
  const calls = parseJsonToolCalls(rawText);
  if (calls.length === 0) break; // Agent is finished

  // 3. Execute the tools locally
  for (const call of calls) {
    const resultValue = await tool.handler(call.arguments);

    // 4. Append tool results. If the model natively supported tools, provide the toolCallId.
    // If it was a raw JSON fallback parse, pass the result as a 'user' message to bypass strict API validation.
    history.push({
      role: call.id ? 'tool' : 'user',
      ...(call.id ? { toolCallId: call.id } : {}),
      content: typeof resultValue === 'string' ? resultValue : JSON.stringify(resultValue),
    });
  }
}
```

---

## Technical Scenario: Finding an Unclosed Database Connection

To understand how the agents collaborate, consider a scenario where a developer opens a database connection in a PR but seemingly forgets to close it.

### Step 1: Hypothesis Generation

The **Concurrency Reviewer** analyzes the diff and suspects a memory leak. Because it doesn't have the full file context, it triggers the **Repository Explorer** with a precise query.

### Step 2: Evidence Gathering

The **Repository Explorer** agent is spawned. It loops through its tools:

1. Calls `search_symbol({ keyword: "db.disconnect", fileExtension: ".ts" })`
2. Reads the specific class file using `file_outline` to check the `destroy()` lifecycle method.
3. Returns a concrete fact to the Reviewer: _"No evidence of db.disconnect() found in UserService."_

### Step 3: Adversarial Verification (The Red Team)

The pipeline does not immediately report this to the user. Instead, the finding is passed to the **Finding Verifier**.

The Verifier is given a highly adversarial system prompt designed to prevent false positives:

```typescript
// Snippet from finding-verifier.ts
const system = `You are an adversarial finding verifier for code review.
Your job is to ATTEMPT TO DISPROVE a candidate finding. Do not argue in its favor.

SEARCH FOR:
- cleanup performed elsewhere that makes the problem impossible
- timeout or retry mechanisms that prevent the failure
- lifecycle handlers that restore correctness
...`;
```

The Verifier uses the Explorer agent to search for global timeout configs or garbage collection wrappers.

- **If it finds a timeout handler:** It returns `{ "verdict": "disproven" }` and the issue is silently dropped.
- **If it finds nothing:** It returns `{ "verdict": "confirmed" }`.

### Step 4: Final Output

The confirmed finding is passed to the **Finding Ranker** (`finding-ranker.ts`) to be deduplicated (hashed by text and location) and ranked by a risk score (`Impact × Likelihood`). Finally, it is formatted into a markdown comment for the Pull Request.
