import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function StreamingPanel({ content, isComplete }) {
    const [isExpanded, setIsExpanded] = useState(true);

    // Auto-collapse when streaming is complete
    useEffect(() => {
        if (isComplete) {
            const timer = setTimeout(() => {
                setIsExpanded(false);
            }, 500); // Small delay before collapsing
            return () => clearTimeout(timer);
        }
    }, [isComplete]);

    return (
        <div className="mt-2 border border-border/50 rounded-lg overflow-hidden bg-secondary/20">
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-secondary/30 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isComplete ? 'bg-green-500' : 'bg-blue-500 animate-pulse'}`} />
                    <span className="text-sm font-medium text-foreground">
                        {isComplete ? 'Streaming Complete' : 'Streaming...'}
                    </span>
                </div>
                {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
            </button>

            {/* Content */}
            {isExpanded && (
                <div className="px-4 py-3 border-t border-border/50 bg-background/50">
                    <div className="text-sm text-foreground/80 whitespace-pre-wrap break-words font-mono max-h-96 overflow-y-auto leading-relaxed">
                        {content || 'Waiting for response...'}
                    </div>
                </div>
            )}
        </div>
    );
}
