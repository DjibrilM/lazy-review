import { Bot, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AIReviewTab({ setActiveTab }: { setActiveTab: (tab: any) => void }) {
  return (
    <div className="h-full bg-background overflow-y-auto w-full">
      <div className="p-8 max-w-4xl mx-auto">
        <h2 className="text-xl font-semibold text-foreground mb-6">
          Automated Architectural Checks
        </h2>
        {/* AI Checks */}
        <div className="ml-5 border-l-2 border-border pl-8 space-y-6 py-4 relative">
          <div className="flex items-start">
            <Bot className="w-6 h-6 text-purple-400 bg-background absolute -left-[13px] ring-[6px] ring-background" />
            <div className="flex-1 border border-destructive bg-destructive/5 rounded-md p-5 shadow-sm">
              <div className="flex items-start">
                <AlertCircle className="w-5 h-5 text-destructive mr-3 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-destructive font-semibold mb-2">
                    Architectural Violation Detected
                  </h4>
                  <p className="text-[13px] text-foreground mb-4 leading-relaxed">
                    The implementation in <code>src/database.js</code> concatenates strings
                    directly into the SQL query (line +12). This violates the project
                    manifest convention:
                    <br />
                    <br />
                    <span className="font-mono text-red-400 text-xs px-2 py-1 bg-background border border-destructive/20 rounded inline-block">
                      Do not use string concatenation for SQL queries
                    </span>
                  </p>
                  <div className="flex space-x-3">
                    <Button variant="outline" size="sm" className="text-xs">
                      Draft "Request Changes" Review
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => setActiveTab('files')}
                    >
                      View in Diff
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
