import { FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/util/shared';
import { useEffect, useMemo, useState } from 'react';

interface DiffLine {
  type: 'header' | 'file' | 'added' | 'removed' | 'unchanged' | 'hunk';
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

interface FilePatch {
  fileName: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
}

/** Parse a unified diff string into file patches */
function parseDiff(diff: string): FilePatch[] {
  const files: FilePatch[] = [];
  let current: FilePatch | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git')) {
      if (current) files.push(current);
      current = { fileName: '', additions: 0, deletions: 0, lines: [] };
      continue;
    }
    if (raw.startsWith('--- ') || raw.startsWith('+++ ')) {
      if (current && raw.startsWith('+++ ')) {
        // Extract file name: strip "b/" prefix that git adds
        current.fileName = raw.replace('+++ b/', '').replace('+++ ', '').trim();
      }
      continue;
    }
    if (raw.startsWith('@@')) {
      // Parse hunk header: @@ -old,count +new,count @@
      const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLineNum = parseInt(match[1], 10);
        newLineNum = parseInt(match[2], 10);
      }
      current?.lines.push({ type: 'hunk', content: raw, oldLine: null, newLine: null });
      continue;
    }
    if (!current) continue;

    if (raw.startsWith('+')) {
      current.lines.push({ type: 'added', content: raw, oldLine: null, newLine: newLineNum++ });
      current.additions++;
    } else if (raw.startsWith('-')) {
      current.lines.push({ type: 'removed', content: raw, oldLine: oldLineNum++, newLine: null });
      current.deletions++;
    } else if (raw.startsWith('\\')) {
      // "No newline at end of file" marker — skip
    } else {
      current.lines.push({ type: 'unchanged', content: raw, oldLine: oldLineNum++, newLine: newLineNum++ });
    }
  }
  if (current) files.push(current);
  return files.filter((f) => f.fileName);
}

interface FilesChangedTabProps {
  diff: string;
  isLoading?: boolean;
  selectedFileForDiff?: string | null;
}

export function FilesChangedTab({ diff, isLoading, selectedFileForDiff }: FilesChangedTabProps) {
  const patches = useMemo(() => parseDiff(diff || ''), [diff]);
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>(() => {
    // First file expanded by default
    return {};
  });

  useEffect(() => {
    if (selectedFileForDiff) {
      setExpandedFiles((prev) => ({ ...prev, [selectedFileForDiff]: true }));
      setTimeout(() => {
        const el = document.getElementById(`diff-file-${selectedFileForDiff}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [selectedFileForDiff]);

  if (isLoading) {
    return (
      <div className="h-full bg-background flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading diff...</span>
      </div>
    );
  }

  if (!diff || patches.length === 0) {
    return (
      <div className="h-full bg-background flex items-center justify-center text-muted-foreground text-sm">
        No changes to display.
      </div>
    );
  }

  return (
    <div className="h-full bg-background flex flex-col overflow-hidden">
      {/* File summary bar */}
      <div className="bg-card border-b border-border px-4 py-2 text-xs text-muted-foreground flex items-center gap-3 shrink-0">
        <FileText className="w-4 h-4" />
        <span>{patches.length} file{patches.length !== 1 ? 's' : ''} changed</span>
        <span className="text-emerald-500">+{patches.reduce((a, f) => a + f.additions, 0)}</span>
        <span className="text-red-500">-{patches.reduce((a, f) => a + f.deletions, 0)}</span>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {patches.map((patch, fi) => {
          const isExpanded = expandedFiles[patch.fileName] !== false; // expanded by default
          return (
            <div key={fi} id={`diff-file-${patch.fileName}`} className="border border-border rounded-md overflow-hidden shadow-sm">
              {/* File header */}
              <button
                className="w-full bg-card border-b border-border px-4 py-2 text-sm flex items-center justify-between hover:bg-muted/40 transition-colors"
                onClick={() =>
                  setExpandedFiles((prev) => ({ ...prev, [patch.fileName]: !isExpanded }))
                }
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="font-mono text-card-foreground text-[13px]">{patch.fileName}</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-emerald-500">+{patch.additions}</span>
                  <span className="text-red-500">-{patch.deletions}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="overflow-x-auto bg-background font-mono text-[12px] leading-5">
                  {patch.lines.map((line, li) => {
                    let rowBg = 'bg-transparent';
                    let textCol = 'text-foreground';
                    let numBg = 'bg-background text-muted-foreground';

                    if (line.type === 'hunk') {
                      rowBg = 'bg-muted/60';
                      textCol = 'text-muted-foreground';
                      numBg = 'bg-muted/60 border-r-0';
                    } else if (line.type === 'added') {
                      rowBg = 'bg-emerald-500/10';
                      textCol = 'text-emerald-300';
                      numBg = 'bg-emerald-500/10 text-muted-foreground';
                    } else if (line.type === 'removed') {
                      rowBg = 'bg-red-500/10';
                      textCol = 'text-red-300';
                      numBg = 'bg-red-500/10 text-muted-foreground';
                    }

                    if (line.type === 'hunk') {
                      return (
                        <div key={li} className={cn('px-4 py-0.5', rowBg, textCol)}>
                          {line.content}
                        </div>
                      );
                    }

                    return (
                      <div key={li} className={cn('flex hover:bg-muted/30 group', rowBg)}>
                        <div className={cn('w-10 text-right pr-2 py-0.5 select-none border-r border-border/50 shrink-0', numBg)}>
                          {line.oldLine ?? ''}
                        </div>
                        <div className={cn('w-10 text-right pr-2 py-0.5 select-none border-r border-border/50 shrink-0', numBg)}>
                          {line.newLine ?? ''}
                        </div>
                        <div className={cn('flex-1 pl-4 py-0.5 whitespace-pre', textCol)}>
                          {line.content}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
