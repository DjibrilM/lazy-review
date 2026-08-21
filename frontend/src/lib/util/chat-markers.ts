/**
 * Shared helpers for separating model reasoning from the final answer.
 *
 * Some models wrap thinking in explicit tags (<thinking>...</thinking>) which
 * the backend surfaces as SDK `thinkingDelta` events. Other models (especially
 * local Qwen-style models) emit them through normal content deltas as bare
 * lines:
 *
 *   Reasoning
 *
 *   The actual answer...
 *
 * These helpers normalize bare line markers into <thinking>...</thinking> tags
 * so reasoning always renders in the collapsible "Reasoning" panel instead of
 * leaking into the main chat content.
 */

const REASONING_MARKER_REGEX =
  /^\s*(?:#{1,6}\s*)?(?:>|>|\*{0,2})?\s*(?:Reasoning|Thinking)\s*\*{0,3}\s*$/i;

/**
 * Converts bare "Reasoning" / "Thinking" line markers into
 * `<thinking>` / `</thinking>` tags.
 *
 * Reasoning markers arrive in pairs: the first marker of a pair opens the
 * thinking block and the second closes it. Everything between a pair is
 * reasoning content. An unpaired trailing marker is dropped.
 */
export function normalizeReasoningMarkers(content: string): string {
  const lines = content.split('\n');
  const markerIndexes: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (REASONING_MARKER_REGEX.test(lines[i])) {
      markerIndexes.push(i);
    }
  }

  if (markerIndexes.length === 0) return content;

  const open = new Set<number>();
  const close = new Set<number>();

  for (let i = 0; i + 1 < markerIndexes.length; i += 2) {
    open.add(markerIndexes[i]);
    close.add(markerIndexes[i + 1]);
  }

  const normalized = [...lines];
  for (const idx of markerIndexes) {
    if (open.has(idx)) {
      normalized[idx] = '<thinking>';
    } else if (close.has(idx)) {
      normalized[idx] = '</thinking>';
    } else {
      // Unpaired trailing marker: treat as an open thinking block so live
      // streaming shows the "Thinking…" state. The UI filters out empty
      // finished blocks, so a dangling marker at stream end is invisible.
      normalized[idx] = '<thinking>';
    }
  }

  return normalized.join('\n');
}

/**
 * Scans raw model text and finds offsets of balanced top-level JSON objects
 * using character-wise brace matching (honoring string literals). This is safe
 * for tool-call JSON whose arguments contain nested braces (e.g. code snippets
 * inside a review comment), which a naive regex would truncate.
 */
function findBalancedJsonSpans(
  rawText: string,
  predicate: (objectStart: string) => boolean = () => true,
): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const stack: number[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') {
      if (stack.length === 0 && !predicate(rawText.slice(i))) {
        continue;
      }
      stack.push(i);
    } else if (ch === '}') {
      if (stack.length > 0) {
        const start = stack.pop()!;
        if (stack.length === 0) {
          spans.push([start, i + 1]);
        }
      }
    }
  }

  return spans;
}

/**
 * Removes raw tool-call syntax (JSON tool calls and `<|tool_call|>` dialect)
 * from a string. Brace-aware so arguments containing nested braces (e.g. a
 * comment body with code snippets) are removed completely.
 */
export function stripToolCallMarkers(text: string): string {
  if (!text) return '';

  const spansToRemove: Array<[number, number]> = [];

  // Raw JSON tool calls: {"name": "...", "arguments": {...}}
  // Predicate receives text starting at the '{' character, so include the brace.
  const jsonSpans = findBalancedJsonSpans(text, (start) =>
    /^[\s\n]*\{[\s\n]*"name"\s*:/.test(start),
  );
  spansToRemove.push(...jsonSpans);

  // <|tool_call|>call:name{...} dialect - find start marker then scan to the
  // matching closing brace.
  const dialectRegex = /<\|tool_call\|?>?\s*:?\s*(?:call\s*:\s*)?[a-zA-Z0-9_-]+\{/g;
  let toolMatch: RegExpExecArray | null;

  while ((toolMatch = dialectRegex.exec(text)) !== null) {
    const start = toolMatch.index;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let j = start; j < text.length; j++) {
      const ch = text[j];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === '\\' && inString) {
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          spansToRemove.push([start, j + 1]);
          break;
        }
      }
    }
  }

  // Merge overlapping spans and rebuild the cleaned text.
  const sorted = spansToRemove.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];

  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  let clean = '';
  let cursor = 0;

  for (const [start, end] of merged) {
    clean += text.slice(cursor, start);
    cursor = end;
  }

  clean += text.slice(cursor);

  return clean.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Removes all thinking/reasoning sections from assistant content before it is
 * persisted in chat history. Raw reasoning should never be fed back into the
 * LLM as assistant context on subsequent turns.
 */
export function stripThinkingMarkers(content: string): string {
  const withTags = normalizeReasoningMarkers(content);

  return stripToolCallMarkers(withTags)
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
    .replace(/\s*thinking[\s\S]*?response/g, '')
    .replace(/<\|channel\|>[\s\S]*?<channel\|>/g, '');
}
