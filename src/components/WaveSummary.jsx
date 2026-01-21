import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export default function WaveSummary({ summary, changes }) {
    if (!summary && !changes) {
        return (
            <div className="flex flex-col h-full bg-background items-center justify-center p-8">
                <div className="text-center text-muted-foreground">
                    No summary available
                </div>
            </div>
        );
    }

    const markdownComponents = {
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
    };

    return (
        <div className="flex flex-col h-full bg-background">
            <div className="flex-1 overflow-y-auto p-6">
                {/* Wave Summary Section */}
                {summary && (
                    <div className="prose prose-invert max-w-none">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                        >
                            {summary}
                        </ReactMarkdown>
                    </div>
                )}

                {/* Divider */}
                {summary && changes && (
                    <hr className="my-8 border-border/50" />
                )}

                {/* Thinking Section */}
                {changes && (
                    <div className="prose prose-invert max-w-none">
                        <h2 className="text-xl font-semibold mb-4">Thinking</h2>

                        {/* Changes Summary */}
                        {changes.summary && (
                            <div className="mb-4">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={markdownComponents}
                                >
                                    {changes.summary}
                                </ReactMarkdown>
                            </div>
                        )}

                        {/* Changes Details */}
                        {changes.details && Array.isArray(changes.details) && changes.details.length > 0 && (
                            <ul className="list-disc pl-6 space-y-2">
                                {changes.details.map((detail, index) => (
                                    <li key={index} className="text-foreground/90">
                                        {detail.description}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
