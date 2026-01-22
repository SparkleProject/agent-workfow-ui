import { Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../lib/utils';
import { useEffect } from 'react';
import StreamingPanel from './StreamingPanel';

// Helper function to detect if content is JSON and wrap it in a code block
function preprocessContent(content) {
    const trimmed = content.trim();

    // Check if the content looks like JSON (starts with { or [)
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) &&
        (trimmed.endsWith('}') || trimmed.endsWith(']'))) {
        try {
            // Try to parse as JSON
            JSON.parse(trimmed);
            // If successful, wrap in a code block
            return '```json\n' + trimmed + '\n```';
        } catch (e) {
            // Not valid JSON, return original
            return content;
        }
    }

    return content;
}

export default function MessageList({ messages, isLoading, activeNodeId }) {
    // Effect to scroll to highlighted line
    useEffect(() => {
        if (activeNodeId) {
            const element = document.getElementById('active-json-line');
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [activeNodeId]);

    // Check if any message is currently streaming
    const hasStreamingMessage = messages.some(msg => msg.isStreaming);

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto space-y-8 py-8">
                {messages.map((msg, index) => (
                    <div key={index} className="flex gap-4 group">
                        {/* Avatar */}
                        <div
                            className={cn(
                                'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
                                msg.role === 'user'
                                    ? 'bg-secondary'
                                    : 'bg-gradient-to-br from-blue-500 to-blue-600'
                            )}
                        >
                            {msg.role === 'user' ? (
                                <User className="w-4 h-4 text-foreground" />
                            ) : (
                                <Bot className="w-4 h-4 text-white" />
                            )}
                        </div>

                        {/* Message Content */}
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-foreground mb-1">
                                {msg.role === 'user' ? 'You' : 'AI Assistant'}
                            </div>
                            <div className="text-foreground/90 whitespace-pre-wrap break-words prose prose-invert max-w-none">
                                {msg.role === 'user' ? (
                                    msg.content
                                ) : msg.isStreaming ? (
                                    <>
                                        <StreamingPanel
                                            content={msg.streamingContent || ''}
                                            isComplete={false}
                                        />
                                    </>
                                ) : (
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            code({ node, inline, className, children, ...props }) {
                                                const match = /language-(\w+)/.exec(className || '');
                                                const codeString = String(children).replace(/\n$/, '');

                                                // Try to detect and format JSON
                                                let language = match ? match[1] : '';
                                                let formattedCode = codeString;

                                                if (!inline && (!language || language === 'json')) {
                                                    try {
                                                        // Try to parse as JSON directly
                                                        const parsed = JSON.parse(codeString);
                                                        formattedCode = JSON.stringify(parsed, null, 2);
                                                        language = 'json';
                                                    } catch (e) {
                                                        // If direct parse fails, try unescaping first
                                                        try {
                                                            // Replace escaped newlines and other escape sequences
                                                            const unescaped = codeString
                                                                .replace(/\\n/g, '\n')
                                                                .replace(/\\t/g, '\t')
                                                                .replace(/\\r/g, '\r')
                                                                .replace(/\\"/g, '"')
                                                                .replace(/\\\\/g, '\\');
                                                            const parsed = JSON.parse(unescaped);
                                                            formattedCode = JSON.stringify(parsed, null, 2);
                                                            language = 'json';
                                                        } catch (e2) {
                                                            // Not valid JSON, use original
                                                        }
                                                    }
                                                }

                                                return !inline ? (
                                                    <SyntaxHighlighter
                                                        style={vscDarkPlus}
                                                        language={language || 'text'}
                                                        showLineNumbers={true} // Enable to force lineNumber in lineProps
                                                        wrapLines={true}
                                                        lineNumberStyle={{ display: 'none' }} // Hide the numbers
                                                        customStyle={{
                                                            margin: '0.5em 0',
                                                            borderRadius: '0.375rem',
                                                            fontSize: '0.875em',
                                                        }}
                                                        lineProps={(lineNumber) => {
                                                            const style = { display: 'block' };
                                                            // Logic to highlight line if it contains activeNodeId
                                                            if (activeNodeId && formattedCode) {
                                                                const lines = formattedCode.split('\n');
                                                                // Fallback: if lineNumber is not a number, we can't highlight
                                                                if (typeof lineNumber !== 'number') return { style };

                                                                const lineContent = lines[lineNumber - 1];

                                                                // Create flexible matchers for both string ("id": "123") and number ("id": 123) JSON formats
                                                                // We strictly look for "id": value pattern to avoid false positives and only highlight the definition
                                                                const definitionMatchString = `"id": "${activeNodeId}"`;
                                                                const definitionMatchNumber = `"id": ${activeNodeId}`;

                                                                if (lineContent && (lineContent.includes(definitionMatchString) || lineContent.includes(definitionMatchNumber))) {
                                                                    style.backgroundColor = '#eab30833';
                                                                    return { style, id: 'active-json-line' };
                                                                }
                                                            }
                                                            return { style };
                                                        }}
                                                        {...props}
                                                    >
                                                        {formattedCode}
                                                    </SyntaxHighlighter>
                                                ) : (
                                                    <code className={className} {...props}>
                                                        {children}
                                                    </code>
                                                );
                                            }
                                        }}
                                    >
                                        {preprocessContent(msg.content)}
                                    </ReactMarkdown>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Loading Indicator - only show when not streaming */}
                {isLoading && !hasStreamingMessage && (
                    <div className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-600">
                            <Bot className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1">
                            <div className="text-sm font-semibold text-foreground mb-1">
                                AI Assistant
                            </div>
                            <div className="flex gap-1">
                                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
