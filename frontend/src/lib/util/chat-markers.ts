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
 * Removes all thinking/reasoning sections from assistant content before it is
 * persisted in chat history. Raw reasoning should never be fed back into the
 * LLM as assistant context on subsequent turns.
 */
export function stripThinkingMarkers(content: string): string {
  const withTags = normalizeReasoningMarkers(content);

  return withTags
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
    .replace(/\s*thinking[\s\S]*?response/g, '')
    .replace(/<\|channel\|>[\s\S]*?<channel\|>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
