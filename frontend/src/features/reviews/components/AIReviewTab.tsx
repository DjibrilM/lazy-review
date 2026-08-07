import { Bot, AlertCircle, CheckCircle2, Lightbulb, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/util/shared';

interface ReviewIssue {
  severity: 'critical' | 'warning' | 'suggestion';
  title: string;
  description: string;
  file?: string;
  line?: number;
  convention?: string;
}

interface AIReviewTabProps {
  setActiveTab: (tab: any) => void;
  issues: ReviewIssue[];
  reviewStatus: 'idle' | 'running' | 'success' | 'error';
  reviewMessage?: string;
}

const SeverityIcon = ({ severity }: { severity: ReviewIssue['severity'] }) => {
  if (severity === 'critical') return <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />;
  if (severity === 'warning') return <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />;
  return <Lightbulb className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />;
};

const severityBorder: Record<ReviewIssue['severity'], string> = {
  critical: 'border-destructive bg-destructive/5',
  warning: 'border-yellow-500/40 bg-yellow-500/5',
  suggestion: 'border-blue-400/40 bg-blue-400/5',
};

const severityLabel: Record<ReviewIssue['severity'], string> = {
  critical: 'text-destructive',
  warning: 'text-yellow-500',
  suggestion: 'text-blue-400',
};

export function AIReviewTab({ setActiveTab, issues, reviewStatus, reviewMessage }: AIReviewTabProps) {
  return (
    <div className="h-full bg-background overflow-y-auto w-full">
      <div className="p-8 max-w-4xl mx-auto">
        <h2 className="text-xl font-semibold text-foreground mb-6">Automated Architectural Checks</h2>

        {reviewStatus === 'idle' && (
          <div className="text-muted-foreground text-sm flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Waiting for diff to load...
          </div>
        )}

        {reviewStatus === 'running' && (
          <div className="flex items-center gap-3 p-4 bg-muted/30 border border-border rounded-md text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span className="font-mono text-xs">{reviewMessage || 'Analyzing PR against architectural manifest...'}</span>
          </div>
        )}

        {reviewStatus === 'error' && (
          <div className="flex items-center gap-2 p-4 bg-destructive/5 border border-destructive/20 rounded-md text-sm text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Review failed: {reviewMessage}</span>
          </div>
        )}

        {reviewStatus === 'success' && issues.length === 0 && (
          <div className="flex items-center gap-3 p-4 bg-green-500/5 border border-green-500/20 rounded-md text-sm text-green-500">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold">No issues found</p>
              <p className="text-muted-foreground text-xs mt-0.5">This PR looks clean against the architectural manifest.</p>
            </div>
          </div>
        )}

        {issues.length > 0 && (
          <div className="ml-5 border-l-2 border-border pl-8 space-y-6 py-4 relative">
            {issues.map((issue, idx) => (
              <div key={idx} className="flex items-start">
                <Bot className="w-6 h-6 text-purple-400 bg-background absolute -left-[13px] ring-[6px] ring-background" />
                <div className={cn('flex-1 border rounded-md p-5 shadow-sm', severityBorder[issue.severity])}>
                  <div className="flex items-start">
                    <SeverityIcon severity={issue.severity} />
                    <div className="ml-3 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn('text-xs font-bold uppercase tracking-wide', severityLabel[issue.severity])}>
                          {issue.severity}
                        </span>
                        {issue.file && (
                          <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                            {issue.file}{issue.line ? `:${issue.line}` : ''}
                          </code>
                        )}
                      </div>
                      <h4 className={cn('font-semibold mb-2', severityLabel[issue.severity])}>{issue.title}</h4>
                      <p className="text-[13px] text-foreground mb-3 leading-relaxed">{issue.description}</p>
                      {issue.convention && (
                        <div className="mb-3">
                          <p className="text-xs text-muted-foreground mb-1">Convention violated:</p>
                          <span className="font-mono text-xs px-2 py-1 bg-background border border-border rounded inline-block text-muted-foreground">
                            {issue.convention}
                          </span>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                          onClick={() => setActiveTab('files')}
                        >
                          View in Diff
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
