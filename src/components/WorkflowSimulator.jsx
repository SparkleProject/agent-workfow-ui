import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronRight, ChevronLeft, RotateCcw, Play, Sparkles } from 'lucide-react';
import { evaluateExpression, interpolateString } from '../utils/expressionEngine';
import { ErrorBoundary } from './ErrorBoundary';
import { sendMessage } from '../services/agentApi';

export default function WorkflowSimulator({ workflow }) {
    // State for the simulation engine
    // Stack items: { nodes: [], index: 0, type: 'root'|'block'|'loop', expression: '', loopType: '' }
    const [executionStack, setExecutionStack] = useState([]);

    // Context: replies, api_responses, now
    const [context, setContext] = useState({
        replies: {},
        api_responses: {},
        now: new Date()
    });

    // History for Back navigation (snapshots of stack + context)
    const [history, setHistory] = useState([]);

    // UI State
    const [currentInputs, setCurrentInputs] = useState({});
    const [isSimulatingApi, setIsSimulatingApi] = useState(false);
    const [currentStep, setCurrentStep] = useState(null);
    const [debugLogs, setDebugLogs] = useState([]);

    // Helper to normalize workflow actions (handle V1 array and V2 wave object)
    const getWorkflowActions = (wf) => {
        if (Array.isArray(wf)) return wf;
        if (wf && typeof wf === 'object' && Array.isArray(wf.actions)) return wf.actions;
        return [];
    };

    // Initialize simulation
    useEffect(() => {
        const actions = getWorkflowActions(workflow);
        if (actions.length > 0) {
            resetSimulation();
        } else {
            setCurrentStep(null);
        }
    }, [workflow]);

    // Effect to process the current state and determine the active step
    // This runs whenever stack changes (navigation)
    useEffect(() => {
        if (executionStack.length === 0) return;

        const processFlow = async () => {
            // Helper to get current pointer
            const getPointer = () => executionStack[executionStack.length - 1];
            let pointer = getPointer();

            // If pointer is invalid (end of list), we need to pop frames until we find valid node or end
            while (pointer && pointer.index >= pointer.nodes.length) {
                // If we are in a loop block, check condition to iterate or exit
                if (pointer.type === 'loop_block') {
                    const shouldLoop = evaluateExpression(pointer.expression, context);
                    if (shouldLoop) {
                        // Loop back: Reset index
                        const newStack = [...executionStack];
                        newStack[newStack.length - 1].index = 0;
                        setExecutionStack(newStack);
                        return; // State updated, effect will re-run
                    }
                }

                // Block finished (if/else, or loop exited, or root finished)
                // Pop frame and advance parent
                if (executionStack.length > 1) {
                    const newStack = [...executionStack];
                    newStack.pop(); // Pop current
                    newStack[newStack.length - 1].index++; // Advance parent
                    setExecutionStack(newStack);
                    return; // State updated, effect will re-run
                } else {
                    // Root finished
                    setCurrentStep({ ended: true, type: 'end' });
                    return;
                }
            }

            // We have a valid index
            const node = pointer.nodes[pointer.index];

            // Handle Control Flow Nodes (Decision, Loops) automatically
            // Handle Control Flow Nodes (Loops) - Decision is now interactive below


            if (node.type === 'while_loop') {
                const expr = node.condition?.expression?.['en-US'] || node.condition?.expression || node.expression?.['en-US'] || node.expression;
                const shouldEnter = evaluateExpression(expr, context);

                setDebugLogs(prev => [...prev,
                `[While] Expr: "${expr}" | Enter: ${shouldEnter}`
                ]);

                if (shouldEnter) {
                    const newFrame = {
                        nodes: node.actions || [],
                        index: 0,
                        type: 'loop_block',
                        expression: expr
                    };
                    setExecutionStack([...executionStack, newFrame]);
                } else {
                    // Skip loop
                    const newStack = [...executionStack];
                    newStack[newStack.length - 1].index++;
                    setExecutionStack(newStack);
                }
                return;
            }

            if (node.type === 'do_while') {
                // Do-while always enters at least once
                // Note: Logic allows checking entrance, but standard do_while enters then checks exit/repeat
                // We treat it as entering a loop block that checks condition at end (handled in pop logic)
                const expr = node.condition?.expression?.['en-US'] || node.condition?.expression || node.expression?.['en-US'] || node.expression;
                const newFrame = {
                    nodes: node.actions || [],
                    index: 0,
                    type: 'loop_block',
                    expression: expr
                };
                setExecutionStack([...executionStack, newFrame]);
                return;
            }

            // Interactive Nodes (User Interaction, API Call, Decision) stop the flow for UI
            if (node.type === 'user_interaction' || node.type === 'api_call' || node.type === 'decision') {
                setCurrentStep(node);
                return;
            }
        };

        processFlow();

    }, [executionStack, context]);

    const handleDecision = (result) => {
        if (!currentStep) return;

        const node = currentStep;
        const newStack = [...executionStack];
        const currentFrame = newStack[newStack.length - 1];

        // Log the decision
        setHistory(prev => [...prev, {
            id: node.id,
            description: node.description,
            type: 'decision',
            result: result ? 'True' : 'False',
            timestamp: new Date()
        }]);

        setDebugLogs(prev => [...prev,
        `[Decision] Manual Selection: ${result} | Node: ${node.id}`
        ]);

        const block = result ? node.if_block : node.else_block;

        if (block && block.length > 0) {
            // Push new block
            currentFrame.index++; // Move past decision node in current frame
            setExecutionStack([...newStack, { nodes: block, index: 0, type: 'decision_block' }]);
        } else {
            // No block for this path, just move to next node
            currentFrame.index++;
            setExecutionStack(newStack);
        }

        // Clear current step to resume processing
        setCurrentStep(null);
    };


    const resetSimulation = () => {
        const actions = getWorkflowActions(workflow);
        setExecutionStack([{ nodes: actions, index: 0, type: 'root' }]);
        setContext({ replies: {}, api_responses: {}, now: new Date() });
        setHistory([]);
        setCurrentInputs({});
        setIsSimulatingApi(false);
    };

    // Mock Response State
    const [mockResponse, setMockResponse] = useState('{\n  "status": "success",\n  "data": "Mock Data"\n}');
    const [apiNameInput, setApiNameInput] = useState('');
    const [isGeneratingMock, setIsGeneratingMock] = useState(false);
    const [hasGeneratedMock, setHasGeneratedMock] = useState({}); // Track generation per step ID to avoid loops

    // Scan workflow for ALL expressions using this API response
    const findAllExpressionUsages = (nodes, varName) => {
        let expressions = new Set();
        const searchPattern = `api_responses.${varName}`;

        const checkValue = (val) => {
            if (!val) return;
            if (typeof val === 'string') {
                if (val.includes(searchPattern)) {
                    expressions.add(val);
                }
            } else if (Array.isArray(val)) {
                val.forEach(checkValue);
            } else if (typeof val === 'object') {
                Object.values(val).forEach(checkValue);
            }
        };

        const scanNode = (node) => {
            // 1. Check direct expressions (Decision, Loop)
            if (node.condition?.expression) checkValue(node.condition.expression);
            if (node.expression) checkValue(node.expression);

            // 2. Check prompts (User Interaction)
            if (node.prompt) checkValue(node.prompt);

            // 3. Check request bodies (API Call)
            if (node.request) checkValue(node.request);

            // 4. Check fields for expressions
            if (node.fields) {
                for (const field of node.fields) {
                    if (field.attributes) {
                        checkValue(field.attributes.options);
                        checkValue(field.attributes.label_expression);
                        checkValue(field.attributes.default_value);
                    }
                }
            }

            // Recurse into all possible block types
            if (node.actions) node.actions.forEach(scanNode);
            if (node.if_block) node.if_block.forEach(scanNode);
            if (node.else_block) node.else_block.forEach(scanNode);
        };

        nodes.forEach(scanNode);
        return Array.from(expressions);
    };

    // Update mock response default and api name when stepping into API call
    // AND Re-hydrate inputs if we have visited this step before (e.g. Back button)
    useEffect(() => {
        if (!currentStep) return;

        if (currentStep.type === 'api_call') {
            const rawName = currentStep.response || currentStep.api_name || 'unknown_api';
            const cleanName = rawName.replace(/\s+/g, '_').toLowerCase();
            setApiNameInput(cleanName);

            // Smart Mocking: Manual Trigger now, so we only set default if empty
            // (Actually, we set default initial value if state is practically empty or just initialized)
            if (mockResponse === '{\n  "status": "success",\n  "data": "Mock Data"\n}') {
                const defaultMock = {
                    status: "success",
                    data: "Mock Data",
                    found: true,
                    products: ["Speaker A", "Speaker B"]
                };
                setMockResponse(JSON.stringify(defaultMock, null, 2));
            }
        }
        // If already generated or visited, we keep the current mockResponse (or it might have been reset? 
        // Wait, mockResponse state is preserved as long as we don't unmount? 
        // No, WorkflowSimulator stays mounted. But mockResponse is state.
        // If we have multiple API steps, it overwrites.
        // That's acceptable for now. 



        if (currentStep.type === 'user_interaction' && currentStep.fields) {
            const restoredInputs = {};
            currentStep.fields.forEach(field => {
                // Check if we have a saved reply for this field
                if (context.replies[field.name] !== undefined) {
                    restoredInputs[field.name] = context.replies[field.name];
                }
            });
            setCurrentInputs(restoredInputs);
        }
    }, [currentStep, context.replies]); // Add context.replies dependency

    const handleNext = async () => {
        if (!currentStep) return;

        let nextContext = JSON.parse(JSON.stringify(context));

        // 1. Handle User Interaction
        if (currentStep.type === 'user_interaction' && currentStep.fields) {
            // Check required fields
            const missingFields = currentStep.fields
                .filter(f => !f.attributes?.optional && !currentInputs[f.name] && currentInputs[f.name] !== 0)
                .map(f => f.name.replace(/_/g, ' '));

            if (missingFields.length > 0) {
                alert(`Please fill in all required fields: ${missingFields.join(', ')}`);
                return;
            }

            // Update nextContext with inputs
            currentStep.fields.forEach(field => {
                if (currentInputs[field.name] !== undefined) {
                    nextContext.replies[field.name] = currentInputs[field.name];
                }
            });
        }

        // 2. Handle API Call
        if (currentStep.type === 'api_call') {
            setIsSimulatingApi(true);
            // Mock API Delay
            await new Promise(r => setTimeout(r, 600));

            // Parse response from editor
            let parsedResponse;
            try {
                parsedResponse = JSON.parse(mockResponse);
            } catch (e) {
                alert("Invalid JSON in mock response editor!");
                setIsSimulatingApi(false);
                return;
            }

            const apiName = apiNameInput || 'unknown_api';
            nextContext.api_responses[apiName] = parsedResponse;
            setIsSimulatingApi(false);
        }

        // 3. Save History (Snapshot current stack + UPDATED context)
        // This ensures that going 'back' returns to this step WITH the data we just saved.
        const snapshot = {
            stack: JSON.parse(JSON.stringify(executionStack)),
            context: nextContext
        };
        setHistory([...history, snapshot]);

        // 4. Update State and Advance
        setContext(nextContext);

        const newStack = [...executionStack];
        newStack[newStack.length - 1].index++;
        setExecutionStack(newStack);
        // Do NOT manually clear currentInputs here, the useEffect will handle it
    };

    const handleBack = () => {
        if (history.length > 0) {
            const prevState = history[history.length - 1];

            // Merge current inputs into the PREVIOUS state context to preserve "future" data
            // This ensures if we go forward again, we remember what was typed.
            let contextToRestore = JSON.parse(JSON.stringify(prevState.context));

            if (currentStep && currentStep.type === 'user_interaction' && currentStep.fields) {
                currentStep.fields.forEach(field => {
                    if (currentInputs[field.name] !== undefined) {
                        contextToRestore.replies[field.name] = currentInputs[field.name];
                    }
                });
            }

            setExecutionStack(prevState.stack);
            setContext(contextToRestore);
            setHistory(history.slice(0, -1));
            // Do NOT manually clear currentInputs here, the useEffect will restore it from context
        }
    };

    const handleInputChange = (fieldName, value) => {
        setCurrentInputs(prev => ({ ...prev, [fieldName]: value }));
    };

    const handleMultiSelectChange = (fieldName, value, isChecked) => {
        setCurrentInputs(prev => {
            const current = prev[fieldName] || [];
            if (isChecked) {
                return { ...prev, [fieldName]: [...current, value] };
            } else {
                return { ...prev, [fieldName]: current.filter(v => v !== value) };
            }
        });
    };

    const handleGenerateMock = () => {
        if (!currentStep) return;

        setIsGeneratingMock(true);
        const rawName = currentStep.response || currentStep.api_name || 'unknown_api';
        const cleanName = rawName.replace(/\s+/g, '_').toLowerCase();

        const expressions = findAllExpressionUsages(workflow, cleanName);

        // Construct prompt with variable name and expression list
        const prompt = expressions.length > 0
            ? `Give a json example as the value of 'api_responses.${cleanName}' to match value of these freemarker expressions: ${JSON.stringify(expressions)}, return the json value only, do not include the key api_responses.${cleanName}`
            : `create a realistic json response for an API named "${currentStep.api_name || 'unknown'}" (variable: api_responses.${cleanName})`;

        const logPayload = { model: 'gpt-4.1-mini', message: prompt };
        setDebugLogs(prev => [...prev, `[Mock Gen] Invoking Chat Endpoint. Payload: ${JSON.stringify(logPayload)}`]);

        sendMessage(prompt, 'gpt-4.1-mini')
            .then(response => {
                let json = response.content;
                // Extract JSON from code block if present
                if (json.includes('```json')) {
                    json = json.split('```json')[1].split('```')[0].trim();
                } else if (json.includes('```')) {
                    json = json.split('```')[1].split('```')[0].trim();
                }
                setMockResponse(json);
                setIsGeneratingMock(false);
            })
            .catch(err => {
                console.error("Failed to generate mock:", err);
                setIsGeneratingMock(false);
                alert("Failed to generate mock. See console for details.");
            });
    };

    // Render Field Helper
    const renderField = (field) => {
        const isRequired = !field.attributes?.optional;
        const fieldValue = currentInputs[field.name];

        const label = (
            <label className="block text-sm font-medium text-foreground mb-2">
                {field.name.replace(/_/g, ' ')}
                {isRequired && <span className="text-red-400 ml-1">*</span>}
            </label>
        );

        // Evaluate Options if present
        let options = [];
        if (field.attributes?.options) {
            const result = evaluateExpression(field.attributes.options, context);
            if (Array.isArray(result)) {
                options = result.map(opt => {
                    if (typeof opt === 'string' || typeof opt === 'number') {
                        return { label: String(opt), value: String(opt) };
                    }
                    return opt;
                });
            }
            // Handle simple string fallback if expression fails
            else if (typeof field.attributes.options === 'string' && field.attributes.options.startsWith('[')) {
                try {
                    const parsed = JSON.parse(field.attributes.options);
                    options = parsed.map(opt => {
                        if (typeof opt === 'string' || typeof opt === 'number') {
                            return { label: String(opt), value: String(opt) };
                        }
                        return opt;
                    });
                } catch (e) { }
            }
        }

        // Apply label_expression if present (e.g. "$.label")
        if (field.attributes?.label_expression && typeof field.attributes.label_expression === 'string' && field.attributes.label_expression.startsWith('$.') && options.length > 0) {
            const labelKey = field.attributes.label_expression.substring(2);
            options = options.map(opt => {
                if (typeof opt === 'object' && opt !== null) {
                    const extractedLabel = opt[labelKey];
                    if (extractedLabel !== undefined) {
                        return { ...opt, label: extractedLabel };
                    }
                }
                return opt;
            });
        }

        // Ensure every option has a value and label
        options = options.map((opt, idx) => {
            if (typeof opt !== 'object' || opt === null) {
                return { label: String(opt), value: String(opt) };
            }

            // Fallback for value: value -> id -> code -> key -> index
            const value = opt.value ?? opt.id ?? opt.code ?? opt.key ?? String(idx);
            // Fallback for label: label -> name -> title -> value
            const label = opt.label ?? opt.name ?? opt.title ?? String(value);

            return { ...opt, label: String(label), value: String(value) };
        });

        switch (field.type) {
            case 'text':
                return (
                    <div key={field.name} className="mb-4">
                        {label}
                        <input
                            type="text"
                            value={fieldValue || ''}
                            onChange={(e) => handleInputChange(field.name, e.target.value)}
                            className="w-full px-3 py-2 bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                            required={isRequired}
                        />
                    </div>
                );
            case 'numeric':
                return (
                    <div key={field.name} className="mb-4">
                        {label}
                        <input
                            type="number"
                            value={fieldValue || ''}
                            onChange={(e) => handleInputChange(field.name, e.target.value)}
                            className="w-full px-3 py-2 bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                            required={isRequired}
                        />
                    </div>
                );
            case 'date':
                // Evaluate Min/Max
                const min = field.attributes?.min ? evaluateExpression(field.attributes.min, context) : undefined;
                const max = field.attributes?.max ? evaluateExpression(field.attributes.max, context) : undefined;
                return (
                    <div key={field.name} className="mb-4">
                        {label}
                        <input
                            type="date"
                            value={fieldValue || ''}
                            onChange={(e) => handleInputChange(field.name, e.target.value)}
                            min={min}
                            max={max}
                            className="w-full px-3 py-2 bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                            required={isRequired}
                        />
                    </div>
                );
            case 'multiple_choice':
                return (
                    <div key={field.name} className="mb-4">
                        {label}
                        <div className="space-y-2">
                            {options.map((opt, idx) => (
                                <label key={idx} className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name={field.name}
                                        value={opt.value}
                                        checked={fieldValue === opt.value}
                                        onChange={() => handleInputChange(field.name, opt.value)}
                                        className="text-primary focus:ring-primary"
                                    />
                                    <span className="text-foreground">{opt.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                );
            case 'multiple_select':
                return (
                    <div key={field.name} className="mb-4">
                        {label}
                        <div className="space-y-2">
                            {options.map((opt, idx) => (
                                <label key={idx} className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        value={opt.value}
                                        checked={(fieldValue || []).includes(opt.value)}
                                        onChange={(e) => handleMultiSelectChange(field.name, opt.value, e.target.checked)}
                                        className="rounded text-primary focus:ring-primary bg-secondary border-border"
                                    />
                                    <span className="text-foreground">{opt.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                );
            default:
                return <div key={field.name} className="text-red-400">Unknown type: {field.type}</div>;
        }
    };


    if (!currentStep) return <div className="p-8 text-center text-muted-foreground">Loading workflow...</div>;

    if (currentStep.type === 'end') {
        return (
            <div className="flex flex-col h-full bg-background items-center justify-center p-8">
                <div className="text-center space-y-4">
                    <div className="text-4xl">🎉</div>
                    <h3 className="text-xl font-semibold">Workflow Completed</h3>
                    <button onClick={resetSimulation} className="flex items-center gap-2 mx-auto px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                        <RotateCcw className="w-4 h-4" /> Restart
                    </button>
                    {/* Debug Context View */}
                    <div className="mt-8 text-left w-full max-w-md bg-secondary/30 p-4 rounded text-xs font-mono overflow-auto max-h-48">
                        <div className="font-bold mb-2">Final Context:</div>
                        {JSON.stringify(context.replies, null, 2)}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background">
            <div className="flex items-center justify-between p-4 border-b border-border/50">
                <div className="text-sm font-semibold">
                    {currentStep.type === 'api_call' ? 'API Execution' : 'User Step'}
                </div>
                <button onClick={resetSimulation} className="p-1 hover:bg-secondary rounded" title="Reset">
                    <RotateCcw className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {/* Step Content */}
                {currentStep.type === 'user_interaction' && (
                    <>
                        <div className="mb-6 prose prose-invert max-w-none prose-headings:text-lg prose-p:text-sm">
                            <ErrorBoundary fallback={<div className="text-red-400">Error rendering prompt</div>}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {interpolateString(extractPrompt(currentStep.prompt), context) || ''}
                                </ReactMarkdown>
                            </ErrorBoundary>
                        </div>
                        {currentStep.fields?.map(renderField)}
                    </>
                )}

                {currentStep.type === 'decision' && (
                    <div className="space-y-6">
                        <div className="mb-6 prose prose-invert max-w-none prose-headings:text-lg prose-p:text-sm">
                            <h3 className="font-semibold text-foreground mb-2">Decision Required</h3>
                            {currentStep.description && (
                                <p className="text-muted-foreground mb-4">{currentStep.description}</p>
                            )}

                            <div className="bg-secondary/50 rounded p-3 mb-4 font-mono text-sm text-foreground break-all border border-border">
                                <span className="text-xs text-muted-foreground block mb-1">Expression:</span>
                                {currentStep.condition?.expression?.['en-US'] || currentStep.condition?.expression || currentStep.expression?.['en-US'] || currentStep.expression || 'Condition'}
                            </div>

                            {currentStep.condition?.info_plugin_call && (
                                <div className="mb-4 text-xs text-muted-foreground p-2 border border-border rounded bg-secondary/20">
                                    <strong className="text-foreground">Plugin Call:</strong> {currentStep.condition.info_plugin_call.info_plugin_name}
                                </div>
                            )}

                            <div className="flex gap-4 justify-start mt-6">
                                <button
                                    onClick={() => handleDecision(true)}
                                    className="px-6 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md font-medium transition-colors flex items-center gap-2"
                                >
                                    <span>✅</span> True
                                </button>
                                <button
                                    onClick={() => handleDecision(false)}
                                    className="px-6 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md font-medium transition-colors flex items-center gap-2"
                                >
                                    <span>❌</span> False
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {currentStep.type === 'api_call' && (
                    <div className="flex flex-col gap-4 p-6 border-2 border-dashed border-border rounded-lg bg-secondary/20">
                        <div className="flex items-center justify-between">

                            <div className="flex flex-col flex-1 mr-4">
                                <label className="text-[10px] text-muted-foreground font-mono mb-1">Response Variable Name:</label>
                                <input
                                    type="text"
                                    value={apiNameInput}
                                    onChange={(e) => setApiNameInput(e.target.value)}
                                    className="bg-background border border-border rounded px-2 py-1 text-sm font-mono text-green-400 focus:outline-none focus:border-primary"
                                />
                            </div>
                            <div className="flex flex-col flex-1">
                                <label className="text-[10px] text-muted-foreground font-mono mb-1">API Name:</label>
                                <div className="bg-background border border-border rounded px-2 py-1 text-sm font-mono text-green-400 truncate">
                                    {currentStep.api_name || 'N/A'}
                                </div>
                            </div>
                        </div>

                        <div className="text-xs text-muted-foreground mb-2 flex items-center justify-between">
                            <span className="font-semibold text-foreground">Mock Response Editor:</span>
                            <div className="flex items-center gap-2">
                                {isGeneratingMock ? (
                                    <span className="flex items-center text-primary animate-pulse">
                                        <Sparkles className="w-3 h-3 mr-1" /> Generating...
                                    </span>
                                ) : (
                                    <button
                                        onClick={handleGenerateMock}
                                        className="flex items-center text-[10px] bg-primary/10 hover:bg-primary/20 text-primary px-2 py-1 rounded transition-colors"
                                        title="Auto-generate mock JSON based on workflow usage"
                                    >
                                        <Sparkles className="w-3 h-3 mr-1" /> Generate Mock Response
                                    </button>
                                )}
                            </div>
                        </div>
                        <textarea
                            value={mockResponse}
                            onChange={(e) => setMockResponse(e.target.value)}
                            className="w-full h-48 bg-secondary/50 border border-border rounded font-mono text-xs p-2 focus:ring-1 focus:ring-primary outline-none resize-none"
                            spellCheck="false"
                        />
                        <div className="text-xs text-muted-foreground">
                            Edit this JSON to test different outcomes (e.g. decision branches).
                        </div>

                        {isSimulatingApi ? (
                            <div className="flex items-center gap-2 text-muted-foreground animate-pulse mt-4">
                                Executing...
                            </div>
                        ) : (
                            <div className="text-sm text-center text-muted-foreground mt-2">
                                Ready to execute.
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer Buttons */}
            <div className="flex-shrink-0 p-4 border-t border-border/50 flex justify-between">
                <button
                    onClick={handleBack}
                    disabled={history.length === 0 || isSimulatingApi}
                    className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 disabled:opacity-50 rounded-md"
                >
                    <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                    onClick={handleNext}
                    disabled={isSimulatingApi}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded-md"
                >
                    {currentStep.type === 'api_call' ? (
                        <>Execute <Play className="w-4 h-4" /></>
                    ) : (
                        <>Next <ChevronRight className="w-4 h-4" /></>
                    )}
                </button>
            </div>

            {/* Debug Logs Panel - Fixed height at bottom */}
            <div className="flex-shrink-0 bg-black/90 text-green-400 font-mono text-[10px] p-2 h-32 overflow-auto border-t border-white/10">
                <div className="font-bold border-b border-white/20 mb-1">Runtime Logs</div>
                {debugLogs.map((log, i) => (
                    <div key={i}>{log}</div>
                ))}
            </div>
        </div>
    );
}

// Helper to handle prompt array or string or object
function extractPrompt(promptObj) {
    if (!promptObj) return '';
    if (typeof promptObj === 'string') return promptObj;
    if (Array.isArray(promptObj)) {
        // Recursively handle array items if needed, or just take first
        return extractPrompt(promptObj[0]);
    }
    if (typeof promptObj === 'object') {
        if (promptObj['en-US']) {
            return extractPrompt(promptObj['en-US']);
        }
        // Fallback: try to find any string value or stringify
        return JSON.stringify(promptObj);
    }
    return String(promptObj);
}
