import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronRight, ChevronLeft, RotateCcw, Play, Sparkles, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { evaluateExpression, interpolateString } from '../utils/expressionEngine';
import { ErrorBoundary } from './ErrorBoundary';
import { sendMessage, getModels } from '../services/agentApi';

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
    const [showRuntimeLogs, setShowRuntimeLogs] = useState(false);

    // Helper to normalize workflow actions (handle V1 array and V2 wave object)
    const getWorkflowActions = (wf) => {
        if (Array.isArray(wf)) return wf;
        if (wf && typeof wf === 'object' && Array.isArray(wf.actions)) return wf.actions;
        return [];
    };

    const [availableModels, setAvailableModels] = useState([]);

    // Initialize simulation
    useEffect(() => {
        // Fetch models
        getModels().then(models => {
            console.log('[Debug] Available Models:', models);
            if (models && models.length > 0) {
                setAvailableModels(models);
            }
        });

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
    const [retrievedMocks, setRetrievedMocks] = useState({}); // Map of key -> json string
    const [apiNameInput, setApiNameInput] = useState('');
    const [isGeneratingMock, setIsGeneratingMock] = useState(false);
    const [hasGeneratedMock, setHasGeneratedMock] = useState({}); // Track generation per step ID to avoid loops

    // Scan workflow for ALL expressions using this API response
    const findAllExpressionUsages = (workflowOrNodes, varName) => {
        // Normalize workflow to array of nodes
        let nodes = workflowOrNodes;
        if (!Array.isArray(workflowOrNodes)) {
            // Handle V2 workflow object
            if (workflowOrNodes && typeof workflowOrNodes === 'object' && Array.isArray(workflowOrNodes.actions)) {
                nodes = workflowOrNodes.actions;
            } else {
                // Invalid input, return empty
                console.warn('[findAllExpressionUsages] Invalid workflow format:', workflowOrNodes);
                return [];
            }
        }

        let expressions = new Set();
        // Check for usage in replies (mapped from retrieved_answers) OR api_responses
        const searchPatterns = [`api_responses.${varName}`, `replies.${varName}`];

        const checkValue = (val) => {
            if (!val) return;
            if (typeof val === 'string') {
                for (const pattern of searchPatterns) {
                    if (val.includes(pattern)) {
                        expressions.add(val);
                    }
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

    // Update mock response default and api name when stepping into API call OR User Interaction with retrieved_answers
    // AND Re-hydrate inputs if we have visited this step before (e.g. Back button)
    useEffect(() => {
        if (!currentStep) return;

        if (currentStep.type === 'api_call') {
            const rawName = currentStep.response || currentStep.api_name || 'unknown_api';
            const cleanName = rawName.replace(/\s+/g, '_').toLowerCase();
            setApiNameInput(cleanName);

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

        if (currentStep.type === 'user_interaction') {
            // Restore inputs
            if (currentStep.fields) {
                const restoredInputs = {};
                currentStep.fields.forEach(field => {
                    if (context.replies[field.name] !== undefined) {
                        restoredInputs[field.name] = context.replies[field.name];
                    }
                });
                setCurrentInputs(restoredInputs);
            }

            // Initialize retrieved_answers mocks
            if (currentStep.retrieved_answers) {
                const initialMocks = {};
                Object.keys(currentStep.retrieved_answers).forEach(key => {
                    // Check if we already have this in context (from previous visit or pre-fill)
                    if (context.replies[key] !== undefined) {
                        initialMocks[key] = JSON.stringify(context.replies[key], null, 2);
                    } else {
                        // Default mock
                        initialMocks[key] = JSON.stringify({
                            status: "success",
                            data: "Mock Data for " + key,
                            items: []
                        }, null, 2);
                    }
                });
                setRetrievedMocks(initialMocks);
            } else {
                setRetrievedMocks({});
            }
        }
    }, [currentStep, context.replies]);

    const handleNext = async () => {
        if (!currentStep) return;

        let nextContext = JSON.parse(JSON.stringify(context));

        // 1. Handle User Interaction
        if (currentStep.type === 'user_interaction') {
            // Handle Retrieved Answers (Mocking)
            if (currentStep.retrieved_answers) {
                for (const key of Object.keys(currentStep.retrieved_answers)) {
                    const mockValue = retrievedMocks[key];
                    try {
                        const parsed = JSON.parse(mockValue);
                        // Save to replies as requested: "replies.search_results"
                        nextContext.replies[key] = parsed;
                    } catch (e) {
                        alert(`Invalid JSON in mock editor for '${key}'`);
                        return; // Stop processing
                    }
                }
            }

            // Handle Fields
            if (currentStep.fields) {
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
                        // If it's single choice, we might want to store the object if the option was an object?
                        // Currently we store the value (ID/Code). 
                        // The user request didn't specify changing this behavior, just using the result of retrieved keys.
                    }
                });
            }
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

        // Correctly update stack without mutation
        const newStack = executionStack.map(frame => ({ ...frame })); // Shallow copy frames
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

            // Critical: Ensure we use a fresh copy of the stack to force React to detect change if needed
            const stackToRestore = JSON.parse(JSON.stringify(prevState.stack));

            setExecutionStack(stackToRestore);
            setContext(contextToRestore);
            setHistory(history.slice(0, -1));
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

    // Generic function to generate mock
    // targetKey: the key in 'retrievedMocks' to update, or null for 'mockResponse' (standard API call)
    // varName: the variable name to search in expressions (e.g. 'search_results')
    const handleGenerateMock = (targetKey = null, varName = null) => {
        console.log('[Mock Gen] Function called with:', { targetKey, varName, currentStep });
        if (!currentStep) {
            console.log('[Mock Gen] No current step, aborting');
            return;
        }

        // If targetKey is an Event (from click handler), treat as null (API call mock)
        const actualTargetKey = (targetKey && typeof targetKey === 'object' && targetKey.nativeEvent) ? null : targetKey;
        console.log('[Mock Gen] Actual target key:', actualTargetKey);

        setIsGeneratingMock(true);
        console.log('[Mock Gen] Set generating state to true');

        let cleanName = varName;
        if (!cleanName) {
            const rawName = currentStep.response || currentStep.api_name || 'unknown_api';
            cleanName = rawName.replace(/\s+/g, '_').toLowerCase();
        }
        console.log('[Mock Gen] Clean name:', cleanName);

        const expressions = findAllExpressionUsages(workflow, cleanName);
        console.log('[Mock Gen] Found expressions:', expressions);

        // Construct prompt with variable name and expression list
        const namespace = actualTargetKey ? 'replies' : 'api_responses';
        const prompt = expressions.length > 0
            ? `Give a json example as the value of '${namespace}.${cleanName}' to match value of these freemarker expressions: ${JSON.stringify(expressions)}, return the json value only, do not include the key ${namespace}.${cleanName}`
            : `create a realistic json response for an API named "${cleanName}" (variable: ${namespace}.${cleanName})`;

        // Use specified model for mock generation
        const modelToUse = 'gpt-5.1';
        console.log('[Mock Gen] Using model:', modelToUse, 'from available:', availableModels);

        const logPayload = { model: modelToUse, message: prompt };
        setDebugLogs(prev => [...prev, `[Mock Gen] Invoking Chat Endpoint. Payload: ${JSON.stringify(logPayload)}`]);
        console.log('[Mock Gen] Invoking Chat Endpoint:', logPayload);

        // Timeout wrapper to prevent hanging indefinitely
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out')), 15000)
        );

        console.log('[Mock Gen] Starting Promise.race...');
        Promise.race([sendMessage(prompt, modelToUse), timeoutPromise])
            .then(response => {
                console.log('[Mock Gen] Response received:', response);
                let json = response.content;
                // Extract JSON from code block if present
                if (json.includes('```json')) {
                    json = json.split('```json')[1].split('```')[0].trim();
                } else if (json.includes('```')) {
                    json = json.split('```')[1].split('```')[0].trim();
                }

                console.log('[Mock Gen] Processed JSON:', json);
                console.log('[Mock Gen] Updating state for key:', actualTargetKey);

                if (actualTargetKey) {
                    setRetrievedMocks(prev => {
                        console.log('[Mock Gen] Previous mocks:', prev);
                        const updated = { ...prev, [actualTargetKey]: json };
                        console.log('[Mock Gen] Updated mocks:', updated);
                        return updated;
                    });
                } else {
                    setMockResponse(json);
                }
                setIsGeneratingMock(false);
                console.log('[Mock Gen] Generation complete, state reset');
            })
            .catch(err => {
                console.error('[Mock Gen] Error caught:', err);
                setIsGeneratingMock(false);
                alert(`Failed to generate mock: ${err.message}`);
            });
    };



    // Render Field Helper
    const renderField = (field, context) => {
        // console.log(`[Debug] Rendering field ${field.name} with context keys:`, Object.keys(context.replies || {}));
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
            let optionsSource = field.attributes.options;
            // Handle multilingual options object (simple check)
            if (optionsSource && typeof optionsSource === 'object' && !Array.isArray(optionsSource) && optionsSource['en-US']) {
                optionsSource = optionsSource['en-US'];
            }

            let result;

            // If it looks like a template (has tags), interpolate FIRST to handle <#list>, <#assign> etc.
            if (typeof optionsSource === 'string' && (optionsSource.includes('<#') || optionsSource.includes('${'))) {
                const interpolated = interpolateString(optionsSource, context);
                try {
                    result = JSON.parse(interpolated);
                } catch (e) {
                    console.warn('Failed to parse interpolated options:', interpolated, e);
                    // Fallback: try evaluateExpression if interpolation failed to produce JSON 
                    // (though unlikely to help if it really is a template)
                    result = evaluateExpression(optionsSource, context);
                }
            } else {
                // No tags, standard expression evaluation
                result = evaluateExpression(optionsSource, context);
            }

            if (Array.isArray(result)) {
                options = result.map(opt => {
                    if (typeof opt === 'string' || typeof opt === 'number') {
                        return { label: String(opt), value: String(opt) };
                    }
                    return opt;
                });
            }
            // Handle simple string fallback if expression fails (and not already parsed above)
            else if (typeof optionsSource === 'string' && optionsSource.trim().startsWith('[')) {
                try {
                    const parsed = JSON.parse(optionsSource);
                    options = parsed.map(opt => {
                        if (typeof opt === 'string' || typeof opt === 'number') {
                            return { label: String(opt), value: String(opt) };
                        }
                        return opt;
                    });
                } catch (e) {
                    console.error("Failed to parse optionsSource JSON:", e);
                }
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


    // Helper to get context with current mocks applied for rendering
    const getRenderContext = () => {
        const renderContext = JSON.parse(JSON.stringify(context));
        if (currentStep && currentStep.retrieved_answers) {
            // console.log('[Debug] Building Render Context. retrievedMocks:', retrievedMocks);
            Object.keys(currentStep.retrieved_answers).forEach(key => {
                const mockValue = retrievedMocks[key];
                try {
                    if (mockValue) {
                        const parsed = JSON.parse(mockValue);
                        renderContext.replies[key] = parsed;
                        // console.log(`[Debug] Merged mock for ${key}:`, parsed);
                    }
                } catch (e) {
                    // Ignore parse errors during typing
                    // console.log(`[Debug] Failed to parse mock for ${key}:`, e.message);
                }
            });
            // console.log('[Debug] Final renderContext.replies:', JSON.stringify(renderContext.replies, null, 2));
        }
        // Also merge currentInputs into replies for immediate feedback?
        // Standard behavior usually waits for next step, but for label_expressions referring to OTHER fields, it might be needed.
        // For now, let's just focus on retrieved_answers.
        return renderContext;
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

    const renderContext = getRenderContext();

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
                        {/* Retrieved Answers Mock Editors */}
                        {currentStep.retrieved_answers && Object.keys(currentStep.retrieved_answers).map(key => (
                            <div key={key} className="flex flex-col gap-4 p-6 border-2 border-dashed border-border rounded-lg bg-secondary/20 mb-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col flex-1 mr-4">
                                        <label className="text-[10px] text-muted-foreground font-mono mb-1">Mock Data for:</label>
                                        <div className="font-mono text-xs font-semibold text-primary">
                                            {key} (mapped to replies.{key})
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleGenerateMock(key, key)}
                                        disabled={isGeneratingMock}
                                        className="text-xs px-3 py-1 bg-primary/10 text-primary hover:bg-primary/20 rounded border border-primary/20 transition-colors flex items-center gap-1"
                                    >
                                        {isGeneratingMock ? 'Generating...' : '✨ AI Generate Mock'}
                                    </button>
                                </div>
                                <textarea
                                    value={retrievedMocks[key] || ''}
                                    onChange={(e) => setRetrievedMocks(prev => ({ ...prev, [key]: e.target.value }))}
                                    className="w-full h-48 font-mono text-xs p-3 bg-secondary border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                                    placeholder={`{\n  "status": "success",\n  "data": "..."\n}`}
                                />
                                <div className="text-[10px] text-muted-foreground flex items-center justify-between">
                                    <span>Simulates backend data retrieval.</span>
                                </div>
                            </div>
                        ))}

                        <div className="mb-6 prose prose-invert max-w-none prose-headings:text-lg prose-p:text-sm">
                            <ErrorBoundary fallback={<div className="text-red-400">Error rendering prompt</div>}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {interpolateString(extractPrompt(currentStep.prompt), renderContext) || ''}
                                </ReactMarkdown>
                            </ErrorBoundary>
                        </div>
                        {currentStep.fields?.map(f => renderField(f, renderContext))}
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

            {/* Debug Logs Panel - Collapsible */}
            <div className="flex-shrink-0 bg-black/90 border-t border-white/10">
                {/* Header with toggle */}
                <button
                    onClick={() => setShowRuntimeLogs(!showRuntimeLogs)}
                    className="w-full flex items-center justify-between px-2 py-1 hover:bg-white/5 transition-colors"
                >
                    <div className="flex items-center gap-2 text-green-400 font-mono text-[10px] font-bold">
                        <Terminal className="w-3 h-3" />
                        <span>Runtime Logs</span>
                    </div>
                    {showRuntimeLogs ? (
                        <ChevronDown className="w-3 h-3 text-green-400" />
                    ) : (
                        <ChevronUp className="w-3 h-3 text-green-400" />
                    )}
                </button>

                {/* Logs content */}
                {showRuntimeLogs && (
                    <div className="text-green-400 font-mono text-[10px] p-2 h-32 overflow-auto">
                        {debugLogs.map((log, i) => (
                            <div key={i}>{log}</div>
                        ))}
                    </div>
                )}
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
