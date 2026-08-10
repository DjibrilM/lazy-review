const fs = require('fs');

const files = [
  'src/modules/ai-agent/research-loop.ts',
  'src/modules/ai-agent/pr-review.agent.ts',
  'src/modules/ai-agent/chat.agent.ts',
  'src/modules/ai-agent/agent-context-manager.ts',
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // 1. Change toolDialect: 'json' to toolDialect: 'antigravity'
  content = content.replace(/toolDialect:\s*'json'/g, "toolDialect: 'antigravity'");

  // 2. Add fallback for Antigravity in fallback regex blocks
  // In research-loop.ts and pr-review.agent.ts we have a regex fallback block.
  // The block looks like:
  /*
        const regex = /\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}/g;
        let match;
        while ((match = regex.exec(text)) !== null) { ... }
  */
  // We can just add another regex loop after it.
  const agFallback = `
        const agRegex = /<\\|tool_call\\|>?:?call:([a-zA-Z0-9_\\-]+)\\{(.*?)\\}/g;
        let agMatch;
        // Use text or buffer depending on the file
        const targetString = typeof text !== 'undefined' ? text : buffer;
        while ((agMatch = agRegex.exec(targetString)) !== null) {
          try {
            let parsedArgs = {};
            if (agMatch[2].trim()) {
              parsedArgs = JSON.parse('{' + agMatch[2] + '}');
            }
            // For parsedToolCalls in research-loop
            if (typeof parsedToolCalls !== 'undefined') {
              parsedToolCalls.push({ name: agMatch[1], arguments: parsedArgs });
            } else if (typeof toolCalls !== 'undefined') {
              toolCalls.push({ name: agMatch[1], arguments: parsedArgs });
            }
          } catch (e) {
            // fallback if it was already valid JSON inside braces
            try {
               const parsedArgs = JSON.parse(agMatch[2]);
               if (typeof parsedToolCalls !== 'undefined') {
                 parsedToolCalls.push({ name: agMatch[1], arguments: parsedArgs });
               } else if (typeof toolCalls !== 'undefined') {
                 toolCalls.push({ name: agMatch[1], arguments: parsedArgs });
               }
            } catch {}
          }
        }
`;

  if (content.includes('const regex = /\\{') && !content.includes('agRegex')) {
    content = content.replace(
      /while \(\(match = regex\.exec\(.*?\)\) !== null\) \{[\s\S]*?\}\s*\}/,
      (match) => match + '\n' + agFallback,
    );
  }

  // 3. Update chat.agent.ts stream suppression
  if (file.endsWith('chat.agent.ts')) {
    content = content.replace(
      /if \(!buffer && text\.trim\(\)\.startsWith\('\{'\)\) \{/,
      "if (!buffer && (text.trim().startsWith('{') || text.trim().startsWith('<|tool_call>'))) {",
    );
  }

  fs.writeFileSync(file, content);
  console.log('Patched', file);
}
