const fs = require('fs');

const file = 'src/modules/ai-agent/tools/fs-tools.ts';
let content = fs.readFileSync(file, 'utf8');

// We want to transform:
// const myTool = tool(
//   async ({ arg }: { arg: string }) => { ... },
//   { name: 'foo', description: 'bar', schema: z.object(...) }
// );
// into:
// const myTool = {
//   name: 'foo',
//   description: 'bar',
//   parameters: z.object(...),
//   handler: async ({ arg }: { arg: string }) => { ... }
// };

// Simple regex approaches might be brittle. I'll just write a script to rewrite it cleanly since it's only 5 tools.
// Or I can just use sed to do basic replacements.

// The structure is very consistent:
// const (\\w+) = tool\\(\\s+async \\(([^)]+)\\) => \\{([\\s\\S]*?)\\s+\\},\\s+\\{\\s+name: '([^']+)',\\s+description:\\s+(?:'([^']+)'|([^,]+)),\\s+schema: (z\\.object\\(\\{[\\s\\S]*?\\}\\))\\s+\\}\\s+\\);

// actually it's easier to overwrite the file since I have the contents via view_file.
