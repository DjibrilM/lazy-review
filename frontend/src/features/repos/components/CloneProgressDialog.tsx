import { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/util/shared';
import Visible from '@/components/common/Visible';
import { useSocketEffect } from '@/lib/hooks/useSocketEffect';
import type { ProjectCreationLog } from '@/lib/interfaces/project-creation-log.interface';

interface CloneProgressDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    repoName: string;
}

export function CloneProgressDialog({ isOpen, onOpenChange, repoName }: CloneProgressDialogProps) {
    const [logs, setLogs] = useState<ProjectCreationLog[]>([]);
    const [isDone, setIsDone] = useState(false);
    const [isError, setIsError] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useSocketEffect({
        onProjectCreationLog: (log) => {
            setLogs((prev) => {
                // Prevent exact duplicates
                const exists = prev.find(
                    (l) => l.message === log.message && l.actionProgress === log.actionProgress,
                );
                if (exists) return prev;

                return [...prev, { ...log, timestamp: Date.now() }];
            });

            if (log.actionProgress === 'success' && log.name === 'Cloning repository') {
                setIsDone(true);
                setLogs((prev) =>
                    prev.map((l) =>
                        l.actionProgress === 'pending' ? { ...l, actionProgress: 'success' } : l,
                    ),
                );
            } else if (log.actionProgress === 'error' && log.name === 'Cloning repository') {
                setIsError(true);
                setLogs((prev) =>
                    prev.map((l) => (l.actionProgress === 'pending' ? { ...l, actionProgress: 'error' } : l)),
                );
            }
        },
    });

    useEffect(() => {
        if (isOpen) {
            setLogs([]);
            setIsDone(false);
            setIsError(false);
        }
    }, [isOpen]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl h-[65vh] flex flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between pr-8 text-foreground">
                        <div className="flex items-center space-x-2">
                            <span>Cloning {repoName}</span>
                            <Visible visible={!isDone && !isError}>
                                <Loader2 className="animate-spin w-4 h-4 text-muted-foreground" />
                            </Visible>
                            <Visible visible={isDone}>
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            </Visible>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto mt-4 bg-[#0d1117] rounded-md border border-zinc-800 p-4 font-mono text-[13px] leading-relaxed shadow-inner">
                    <div className="space-y-1.5">
                        {logs.map((log, index) => (
                            <div key={`${log.id}-${index}`} className="flex flex-col">
                                <div className="flex items-start space-x-2">
                                    <div className="mt-0.5 shrink-0">
                                        <Visible visible={log.actionProgress === 'pending'}>
<Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
</Visible>
                                        <Visible visible={log.actionProgress === 'success'}>
<CheckCircle2 className="w-4 h-4 text-emerald-500" />
</Visible>
                                        <Visible visible={log.actionProgress === 'error'}>
<div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white text-[10px]">
                                                !
                                            </div>
</Visible>
                                    </div>
                                    <div className="flex-1 break-all">
                                        <span className="font-medium text-zinc-500 mr-2 opacity-80">[{log.name}]</span>
                                        <span
                                            className={cn(
                                                'text-zinc-300',
                                                log.type === 'error' && 'text-red-400 font-medium',
                                                log.type === 'warning' && 'text-amber-400',
                                                log.type === 'info' && 'text-blue-300',
                                            )}
                                        >
                                            {log.message}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div ref={bottomRef} />
                    </div>

                    <Visible visible={logs.length === 0}>
                        <div className="h-full flex items-center justify-center text-zinc-600 italic">
                            Awaiting logs...
                        </div>
                    </Visible>
                </div>
            </DialogContent>
        </Dialog>
    );
}
