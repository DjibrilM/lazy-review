/**
 * Compact verification for the leave_pr_comment tool-call parsing fix.
 * Simulates the exact model output from the bug report.
 */

const { z } = require('zod');

function getBalancedJsonSpans(rawText, predicate = () => true) {
  const spans = [];
  const stack = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') {
      if (stack.length === 0 && !predicate(rawText.slice(i))) continue;
      stack.push(i);
    } else if (ch === '}') {
      if (stack.length > 0) {
        const start = stack.pop();
        if (stack.length === 0) spans.push([start, i + 1]);
      }
    }
  }
  return spans;
}

function parseFallbackToolCalls(rawText) {
  const calls = [];
  const matches = getBalancedJsonSpans(rawText, (s) => /^[\s\n]*\{[\s\n]*"name"\s*:/.test(s));
  for (const [start, end] of matches) {
    try {
      const parsed = JSON.parse(rawText.slice(start, end));
      if (parsed && typeof parsed.name === 'string') {
        const args = parsed.arguments !== undefined ? parsed.arguments : parsed.args;
        if (args !== undefined) calls.push({ name: parsed.name, arguments: args });
      }
    } catch {}
  }
  return calls;
}

// Exact scenario from bug report: comment contains nested braces (catch {})
const modelOutput = `Reasoning
The user approved the summarized AI review and wants me to post it as a comment on the Pull Request.
{"name": "leave_pr_comment", "arguments": {"comment": "🤖 AI Review Summary: The code has a catch {} block and a {nested} object", "more": "extra"}}`;

// Test 1: parser extracts full JSON with nested braces
const calls = parseFallbackToolCalls(modelOutput);
if (calls.length !== 1) { console.error(`FAIL: expected 1 call, got ${calls.length}`); process.exit(1); }
if (calls[0].name !== 'leave_pr_comment') { console.error(`FAIL: wrong name ${calls[0].name}`); process.exit(1); }
const comment = calls[0].arguments.comment;
if (!comment.includes('catch {}') || !comment.includes('{nested}')) {
  console.error('FAIL: comment truncated:', JSON.stringify(comment));
  process.exit(1);
}
console.log('PASS: brace-aware parser extracted full comment body:');
console.log('  ', comment);

// Test 2: Zod schema accepts {"comment": "..."}
const schema = z.object({
  body: z.string().optional(),
  comment: z.string().optional(),
}).superRefine((args, ctx) => {
  if (args.body === undefined && args.comment === undefined) {
    ctx.addIssue({ code: 'custom', message: 'Either body or comment required.' });
  }
});

const parsed = schema.safeParse({ comment });
if (!parsed.success) { console.error('FAIL: schema rejected comment arg'); process.exit(1); }
const normalized = parsed.data.body ?? parsed.data.comment;
if (normalized !== comment) { console.error('FAIL: normalization mismatch'); process.exit(1); }
console.log('PASS: schema accepts comment alias, normalized length =', normalized.length);

// Test 3: strip removes complete JSON without truncation tail
function stripToolCallMarkers(text) {
  const spans = getBalancedJsonSpans(text, (s) => /^[\s\n]*\{[\s\n]*"name"\s*:/.test(s));
  let clean = '';
  let cursor = 0;
  for (const [start, end] of spans) { clean += text.slice(cursor, start); cursor = end; }
  clean += text.slice(cursor);
  return clean.trim();
}
const stripped = stripToolCallMarkers(modelOutput);
if (stripped.includes('catch {}') || stripped.includes('"name"')) {
  console.error('FAIL: strip left truncation:', stripped);
  process.exit(1);
}
if (!stripped.includes('user approved the summarized')) {
  console.error('FAIL: strip removed reasoning text');
  process.exit(1);
}
console.log('PASS: strip removed tool call, preserved reasoning');
console.log('  Cleaned:', stripped);

console.log('\nALL TESTS PASSED');