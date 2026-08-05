import { useState } from 'react';
import { Terminal, DatabaseBackup, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import MarkdownPreview from '@uiw/react-markdown-preview';

export const MOCK_FACTS = {
  project_name: 'auth-service',
  architecture_pattern: 'Modular Monolith',
  core_modules: [
    { path: 'src/auth', desc: 'Handles JWT generation, OAuth, and password hashing.' },
    { path: 'src/database', desc: 'Contains TypeORM entities and SQLite connections.' },
    { path: 'src/api', desc: 'Express.js REST endpoints and middleware.' },
  ],
  key_conventions: [
    'All database calls must go through the repository pattern.',
    'Endpoints must validate payloads using Zod schemas.',
    'Do not use string concatenation for SQL queries to prevent injections.',
  ],
};

export function CodebaseSummary() {
  const [isGenerating, setIsGenerating] = useState(false);
  const showFacts = true;

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => setIsGenerating(false), 2000);
  };

  const markdownContent = `
# ${MOCK_FACTS.project_name} - Architectural Manifest

## Architecture Pattern
**${MOCK_FACTS.architecture_pattern}**

## Core Modules
${MOCK_FACTS.core_modules.map((m) => `- \`${m.path}\`: ${m.desc}`).join('\n')}

## Key Conventions
${MOCK_FACTS.key_conventions.map((k) => `- ${k}`).join('\n')}
  `;

  return (
    <div className="space-y-6">
      <Card className="bg-muted/10 border-border">
        <CardHeader>
          <div className="flex justify-between items-center w-full">
            <div>
              <CardTitle>Architectural Manifest</CardTitle>
              <CardDescription>
                The AI's local understanding of this repository's structure and rules.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <span className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-sm animate-pulse" /> Scanning codebase...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <DatabaseBackup className="w-4 h-4 text-white" /> Re-index Codebase
                </span>
              )}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {showFacts && (
        <Card className="overflow-hidden shadow-md border-border bg-card">
          <div className="border-b border-border px-4 py-2 text-muted-foreground flex items-center text-sm font-mono">
            <FileText className="w-4 h-4 mr-2" />
            CODEBASE_FACTS.md
          </div>
          <CardContent className="p-6 overflow-x-auto">
            <MarkdownPreview
              source={markdownContent}
              style={{ backgroundColor: 'transparent' }}
              className="text-sm! md:text-base!"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
