import { BrainCircuit, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/util/shared';
import Visible from "@/components/common/Visible";

export function AnimatedThought({
    content,
    isActive,
}: {
    content: string;
    isActive: boolean;
}) {
    const [isOpen, setIsOpen] = useState(isActive);
    const manuallyToggled = useRef(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (isActive) {
            manuallyToggled.current = false;
            setIsOpen(true);
            return;
        }

        // As soon as thinking finishes, automatically collapse it.
        if (!manuallyToggled.current) {
            setIsOpen(false);
        }
    }, [isActive]);

    useEffect(() => {
        if (isActive && isOpen && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [content, isActive, isOpen]);

    return (
        <div className="my-1.5 overflow-hidden rounded-md border border-border/60 bg-muted/20">
            <button
                type="button"
                onClick={() => {
                    manuallyToggled.current = true;
                    setIsOpen((value) => !value);
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/35 hover:text-foreground"
            >
                <Visible visible={isActive} fallback={(
                    <BrainCircuit className="h-3 w-3" />
                )}>
                    <Loader2 className="h-3 w-3 animate-spin" />
                </Visible>

                <span><Visible visible={isActive} fallback={'Reasoning'}>
                    Thinking
                </Visible></span>

                <Visible visible={isActive}>
                    <span className="ml-0.5 font-normal text-muted-foreground/60">live</span>
                </Visible>

                <Visible visible={isOpen} fallback={(
                    <ChevronRight className="ml-auto h-3 w-3" />
                )}>
                    <ChevronDown className="ml-auto h-3 w-3" />
                </Visible>
            </button>

            <div
                className={cn(
                    'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
                    isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                )}
            >
                <div className="min-h-0 overflow-hidden">
                    <div
                        ref={scrollRef}
                        className="overflow-y-auto border-t border-border/50 px-2.5 py-2 text-[11px] leading-5 text-muted-foreground whitespace-pre-wrap"
                    >
                        {content}
                    </div>
                </div>
            </div>
        </div>
    );
}
