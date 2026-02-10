import { Bot, User, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../lib/utils';
import { useState, useEffect, useRef } from 'react';
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

function CodeBlock({ language, formattedCode, activeNodeId, ...props }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(formattedCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group/code-block my-2">
            <button
                onClick={handleCopy}
                className={cn(
                    "absolute right-2 top-2 p-1.5 rounded-md bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 transition-all opacity-0 group-hover/code-block:opacity-100 z-20 border border-white/10",
                    copied && "opacity-100 text-green-500 bg-zinc-800"
                )}
                title="Copy to clipboard"
            >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <SyntaxHighlighter
                style={vscDarkPlus}
                language={language || 'text'}
                showLineNumbers={true}
                wrapLines={true}
                lineNumberStyle={{ display: 'none' }}
                customStyle={{
                    margin: 0,
                    borderRadius: '0.375rem',
                    fontSize: '0.875em',
                    padding: '1rem',
                }}
                lineProps={(lineNumber) => {
                    const style = { display: 'block' };
                    if (activeNodeId && formattedCode) {
                        const lines = formattedCode.split('\n');
                        if (typeof lineNumber !== 'number') return { style };

                        const lineContent = lines[lineNumber - 1];
                        const definitionMatchString = `"id": "${activeNodeId}"`;
                        const definitionMatchNumber = `"id": ${activeNodeId}`;

                        if (lineContent && (lineContent.includes(definitionMatchString) || lineContent.includes(definitionMatchNumber))) {
                            style.backgroundColor = '#eab30833';
                            return { style, 'data-active-node': activeNodeId };
                        }
                    }
                    return { style };
                }}
                {...props}
            >
                {formattedCode}
            </SyntaxHighlighter>
        </div>
    );
}

export default function MessageList({ messages, isLoading, activeNodeId }) {
    const messageListRef = useRef(null);

    // Effect to scroll to highlighted line (last occurrence)
    useEffect(() => {
        if (activeNodeId) {
            // Find all elements with the active node data attribute
            const elements = document.querySelectorAll(`[data-active-node="${activeNodeId}"]`);
            if (elements.length > 0) {
                // Scroll to the last occurrence
                const lastElement = elements[elements.length - 1];
                lastElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [activeNodeId]);

    // Auto-scroll to bottom when messages change (especially during streaming)
    useEffect(() => {
        if (messageListRef.current) {
            messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
        }
    }, [messages]);

    // Check if any message is currently streaming
    const hasStreamingMessage = messages.some(msg => msg.isStreaming);

    return (
        <div ref={messageListRef} className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto space-y-8 py-8">
                {messages.map((msg, index) => (
                    <div key={index} className="flex gap-4 group">{/* Avatar */}
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
                                                    <CodeBlock
                                                        language={language}
                                                        formattedCode={formattedCode}
                                                        activeNodeId={activeNodeId}
                                                        {...props}
                                                    />
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
