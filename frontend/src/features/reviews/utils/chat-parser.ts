export type MessagePart =
  | { type: 'text'; content: string }
  | { type: 'think'; content: string; complete: boolean };

/**
 * Parses both the normal <think> format, the alternate thought
 * channel markers used by some models, and the explicit <thinking> tags
 * emitted by the backend chat agent.
 *
 * An unfinished thinking block is marked complete=false so the UI knows it is
 * still actively streaming.
 */
export function parseMessageContent(content: string): MessagePart[] {
  console.log('🔥 ACTUAL PARSER CALLED');

  const parts: MessagePart[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const thinkStart = content.indexOf('<think>', cursor);
    const channelStart = content.indexOf('<|channel>thought', cursor);

    console.log('PARSER STATE', {
      cursor,
      thinkStart,
      channelStart,
      hasChannel: content.includes('<|channel>thought'),
      content: JSON.stringify(content),
    });

    const candidates = [
      thinkStart >= 0
        ? {
            index: thinkStart,
            start: '<think>',
            end: '</think>',
          }
        : null,

      channelStart >= 0
        ? {
            index: channelStart,
            start: '<|channel>thought',
            end: '<channel|>',
          }
        : null,
    ].filter(Boolean) as {
      index: number;
      start: string;
      end: string;
    }[];

    console.log('CANDIDATES', candidates);

    if (candidates.length === 0) {
      console.log('❌ ENTERED TEXT FALLBACK');

      const text = content.slice(cursor);

      if (text) {
        parts.push({
          type: 'text',
          content: text,
        });
      }

      break;
    }

    const marker = candidates.sort((a, b) => a.index - b.index)[0];

    console.log('MARKER', marker);

    if (marker.index > cursor) {
      parts.push({
        type: 'text',
        content: content.slice(cursor, marker.index),
      });
    }

    const thoughtStart = marker.index + marker.start.length;

    const thoughtEnd = content.indexOf(marker.end, thoughtStart);

    console.log('THOUGHT', {
      thoughtStart,
      thoughtEnd,
      endMarker: marker.end,
    });

    if (thoughtEnd === -1) {
      parts.push({
        type: 'think',
        content: content.slice(thoughtStart),
        complete: false,
      });

      break;
    }

    parts.push({
      type: 'think',
      content: content.slice(thoughtStart, thoughtEnd),
      complete: true,
    });

    cursor = thoughtEnd + marker.end.length;
  }

  console.log('🔥 FINAL PARTS', parts);

  return parts.filter((part) => part.content.length > 0);
}
