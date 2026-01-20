import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export default function WaveSummary({ summary }) {
    if (!summary) {
        return (
            <div className="flex flex-col h-full bg-background items-center justify-center p-8">
                <div className="text-center text-muted-foreground">
                    No summary available
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background">
            <div className="flex-1 overflow-y-auto p-6">
                <div className="prose prose-invert max-w-none">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            code({ node, inline, className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || '');
                                return !inline ? (
                                    <SyntaxHighlighter
                                        style={vscDarkPlus}
                                        language={match ? match[1] : 'text'}
                                        customStyle={{
                                            margin: '0.5em 0',
                                            borderRadius: '0.375rem',
                                            fontSize: '0.875em',
                                        }}
                                        {...props}
                                    >
                                        {String(children).replace(/\n$/, '')}
                                    </SyntaxHighlighter>
                                ) : (
                                    <code className={className} {...props}>
                                        {children}
                                    </code>
                                );
                            }
                        }}
                    >
                        {summary}
                    </ReactMarkdown>
                </div>
            </div>
        </div>
    );
}
