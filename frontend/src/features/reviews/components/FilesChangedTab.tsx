import { FileText } from 'lucide-react';
import { cn } from '@/lib/util/shared';

const MOCK_DIFF = [
  { type: 'header', content: '@@ -7,4 +7,16 @@', oldLine: null, newLine: null },
  { type: 'unchanged', content: ' // Database connection initialized', oldLine: 7, newLine: 7 },
  { type: 'unchanged', content: ' ', oldLine: 8, newLine: 8 },
  { type: 'removed', content: '-function authenticate(username) {', oldLine: 9, newLine: null },
  { type: 'removed', content: '-    return true;', oldLine: 10, newLine: null },
  { type: 'removed', content: '-}', oldLine: 11, newLine: null },
  {
    type: 'added',
    content: '+function authenticate(username, password) {',
    oldLine: null,
    newLine: 9,
  },
  { type: 'added', content: '+    // TODO: Hash password later', oldLine: null, newLine: 10 },
  { type: 'added', content: '+    let db = getDbConnection();', oldLine: null, newLine: 11 },
  {
    type: 'added',
    content:
      '+    let query = "SELECT * FROM users WHERE username = \'" + username + "\' AND password = \'" + password + "\'";',
    oldLine: null,
    newLine: 12,
  },
  { type: 'added', content: '+    let result = db.execute(query);', oldLine: null, newLine: 13 },
  { type: 'added', content: '+', oldLine: null, newLine: 14 },
  { type: 'added', content: '+    if (result.length > 0) {', oldLine: null, newLine: 15 },
  { type: 'added', content: '+        console.log("Login success");', oldLine: null, newLine: 16 },
  { type: 'added', content: '+        return true;', oldLine: null, newLine: 17 },
  { type: 'added', content: '+    } else {', oldLine: null, newLine: 18 },
  { type: 'added', content: '+    }', oldLine: null, newLine: 19 },
  { type: 'added', content: '+}', oldLine: null, newLine: 20 },
];

export function FilesChangedTab() {
  return (
    <div className="h-full bg-background min-w-[600px] flex flex-col overflow-hidden relative">
      <div className="bg-card border-b border-border px-4 py-2 text-sm text-muted-foreground flex justify-between items-center shrink-0">
        <div className="flex items-center">
          <FileText className="w-4 h-4 mr-2" />
          <span className="font-mono text-card-foreground">src/database.js</span>
        </div>
        <div className="flex items-center space-x-3 text-xs font-mono">
          <span className="text-emerald-500">+12 additions</span>
          <span className="text-red-500">-3 deletions</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-background p-4">
        <div className="border border-border rounded-md overflow-hidden bg-background font-mono text-[13px] leading-5 shadow-lg">
          {MOCK_DIFF.map((line, idx) => {
            let rowBg = 'bg-transparent';
            let textCol = 'text-foreground';
            let lineNumBg = 'bg-background text-muted-foreground';

            if (line.type === 'header') {
              rowBg = 'bg-muted';
              textCol = 'text-muted-foreground';
              lineNumBg = 'bg-muted text-muted-foreground border-none';
            } else if (line.type === 'added') {
              rowBg = 'bg-emerald-500/15';
              textCol = 'text-emerald-300';
              lineNumBg = 'bg-emerald-500/10 text-foreground';
            } else if (line.type === 'removed') {
              rowBg = 'bg-red-500/15';
              textCol = 'text-red-300';
              lineNumBg = 'bg-red-500/10 text-foreground';
            }

            return (
              <div key={idx} className={cn('flex hover:bg-muted/50 group', rowBg)}>
                <div
                  className={cn(
                    'w-10 text-right pr-2 py-0.5 select-none border-r border-border',
                    lineNumBg,
                    line.type === 'header' && 'border-r-0 w-20 text-left pl-4'
                  )}
                >
                  {line.type !== 'header' && (line.oldLine || '')}
                </div>
                {line.type !== 'header' && (
                  <div
                    className={cn('w-10 text-right pr-2 py-0.5 select-none border-r border-border', lineNumBg)}
                  >
                    {line.newLine || ''}
                  </div>
                )}
                <div className={cn('flex-1 pl-4 py-0.5 whitespace-pre', textCol)}>
                  {line.content}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
