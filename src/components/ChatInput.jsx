import { useState, useRef, useEffect } from 'react';
import { Send, Plus, ChevronDown, Clock, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { getModels } from '../services/agentApi';

export default function ChatInput({ onSendMessage, disabled, lastUserMessage, lastAssistantResponse }) {
    const [message, setMessage] = useState('');
    const [models, setModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState(null);
    const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
    const [includeContext, setIncludeContext] = useState(false);
    const textareaRef = useRef(null);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const fetchModels = async () => {
            try {
                const data = await getModels();
                setModels(data);
                if (data.length > 0) {
                    setSelectedModel(data[0]);
                }
            } catch (error) {
                console.error('Failed to fetch models:', error);
            }
        };
        fetchModels();
    }, []);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [message]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsModelDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (message.trim() && !disabled) {
            // Include context only if checkbox is checked and we have previous messages
            const prevResponse = includeContext ? lastAssistantResponse : null;
            const prevRequest = includeContext ? lastUserMessage : null;

            onSendMessage(message, selectedModel?.id, prevResponse, prevRequest);
            setMessage('');
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    return (
        <div className="w-full max-w-3xl mx-auto">
            <form onSubmit={handleSubmit} className="relative">
                <div className="relative bg-card border border-border rounded-2xl shadow-lg">
                    <textarea
                        ref={textareaRef}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="How can I help you today?"
                        disabled={disabled}
                        rows={1}
                        className="w-full bg-transparent px-6 py-4 pr-28 text-foreground placeholder-muted-foreground resize-none focus:outline-none max-h-48 overflow-y-auto"
                    />

                    {/* Bottom toolbar */}
                    <div className="flex items-center justify-between px-4 pb-3">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                            >
                                <Plus className="w-4 h-4 text-muted-foreground" />
                            </button>
                            <button
                                type="button"
                                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                            >
                                <Clock className="w-4 h-4 text-muted-foreground" />
                            </button>

                            {/* Context Checkbox - only show if we have previous messages */}
                            {lastUserMessage && lastAssistantResponse && (
                                <button
                                    type="button"
                                    onClick={() => setIncludeContext(!includeContext)}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-xs",
                                        includeContext
                                            ? "bg-primary/10 text-primary hover:bg-primary/20"
                                            : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                                    )}
                                >
                                    <div className={cn(
                                        "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
                                        includeContext
                                            ? "border-primary bg-primary"
                                            : "border-muted-foreground/30 bg-transparent"
                                    )}>
                                        {includeContext && (
                                            <Check className="w-3 h-3 text-primary-foreground" />
                                        )}
                                    </div>
                                    <span>Include context</span>
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Model Selector */}
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    type="button"
                                    onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
                                >
                                    <span className="text-xs text-foreground">
                                        {selectedModel ? selectedModel.name : 'Loading...'}
                                    </span>
                                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                                </button>

                                {/* Dropdown Menu */}
                                {isModelDropdownOpen && (
                                    <div className="absolute bottom-full mb-2 right-0 w-48 bg-popover border border-border rounded-lg shadow-xl overflow-hidden z-50">
                                        <div className="p-1">
                                            {models.map((model) => (
                                                <button
                                                    key={model.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedModel(model);
                                                        setIsModelDropdownOpen(false);
                                                    }}
                                                    className={cn(
                                                        "w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors",
                                                        selectedModel?.id === model.id
                                                            ? "bg-secondary text-foreground"
                                                            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                                                    )}
                                                >
                                                    {model.name}
                                                    {selectedModel?.id === model.id && (
                                                        <Check className="w-3 h-3 text-primary" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Send Button */}
                            <button
                                type="submit"
                                disabled={!message.trim() || disabled}
                                className={cn(
                                    'p-2 rounded-lg transition-all',
                                    message.trim() && !disabled
                                        ? 'bg-primary text-primary-foreground hover:opacity-90'
                                        : 'bg-secondary text-muted-foreground cursor-not-allowed'
                                )}
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </form>

            {/* Info text */}
            <p className="text-xs text-muted-foreground text-center mt-2">
                Free plan · <button className="underline hover:text-foreground transition-colors">Upgrade</button>
            </p>
        </div>
    );
}
