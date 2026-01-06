import { useCallback, useMemo, useEffect } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    Handle,
    Position,
} from 'reactflow';
import 'reactflow/dist/style.css';

// Custom node component for user interactions
function UserInteractionNode({ data }) {
    const promptText = Array.isArray(data.prompt?.['en-US'])
        ? data.prompt['en-US'][0]
        : (typeof data.prompt === 'string' ? data.prompt : 'User input required');

    return (
        <div className="px-4 py-3 bg-blue-500/20 border-2 border-blue-500 rounded-lg min-w-[200px] max-w-[300px]">
            <Handle type="target" position={Position.Top} className="!bg-blue-500" />
            <div className="font-semibold text-blue-400 text-sm mb-1">👤 User Interaction</div>
            <div className="text-xs text-foreground/80 line-clamp-2">
                {typeof promptText === 'string' ? promptText.substring(0, 100) : ''}
            </div>
            {data.ended && (
                <div className="mt-1 text-xs text-red-400 font-semibold">🔴 End</div>
            )}
            <Handle type="source" position={Position.Bottom} className="!bg-blue-500" />
        </div>
    );
}

// Custom node component for API calls
function ApiCallNode({ data }) {
    return (
        <div className="px-4 py-3 bg-green-500/20 border-2 border-green-500 rounded-lg min-w-[200px] max-w-[300px]">
            <Handle type="target" position={Position.Top} className="!bg-green-500" />
            <div className="font-semibold text-green-400 text-sm mb-1">🔌 API Call</div>
            <div className="text-xs text-foreground/80">
                {data.api_name || 'API Request'}
            </div>
            {data.ended && (
                <div className="mt-1 text-xs text-red-400 font-semibold">🔴 End</div>
            )}
            <Handle type="source" position={Position.Bottom} className="!bg-green-500" />
        </div>
    );
}

// Custom node component for decisions
function DecisionNode({ data }) {
    return (
        <div className="px-4 py-3 bg-yellow-500/20 border-2 border-yellow-500 rounded-lg min-w-[200px] max-w-[300px]">
            <Handle type="target" position={Position.Top} className="!bg-yellow-500" />
            <div className="font-semibold text-yellow-400 text-sm mb-1">🔀 Decision</div>
            <div className="text-xs text-foreground/80 line-clamp-2 font-mono">
                {data.expression?.['en-US'] || data.expression || 'Condition'}
            </div>
            <Handle type="source" position={Position.Bottom} className="!bg-yellow-500" />
        </div>
    );
}

// Custom node component for loops
function LoopNode({ data }) {
    const isDoWhile = data.type === 'do_while';
    return (
        <div className="px-4 py-3 bg-purple-500/20 border-2 border-purple-500 rounded-lg min-w-[200px] max-w-[300px]">
            <Handle type="target" position={Position.Top} className="!bg-purple-500" />
            <div className="font-semibold text-purple-400 text-sm mb-1">
                {isDoWhile ? '🔄 Do While Loop' : '🔄 While Loop'}
            </div>
            <div className="text-xs text-foreground/80 line-clamp-2 font-mono">
                {data.expression?.['en-US'] || data.expression || 'Condition'}
            </div>
            <Handle type="source" position={Position.Bottom} className="!bg-purple-500" />
        </div>
    );
}

const nodeTypes = {
    user_interaction: UserInteractionNode,
    api_call: ApiCallNode,
    decision: DecisionNode,
    while_loop: LoopNode,
    do_while: LoopNode,
};

// Parse wave array and convert to ReactFlow nodes and edges
function parseWaveToGraph(wave) {
    if (!wave || !Array.isArray(wave) || wave.length === 0) {
        return { nodes: [], edges: [] };
    }

    const nodes = [];
    const edges = [];
    const xSpacing = 350;
    const ySpacing = 150;

    // Process nodes recursively with proper Y positioning
    function processNodes(nodeList, parentId = null, baseX = 0, startY = 0, isIfBranch = false, isElseBranch = false) {
        let currentY = startY;
        let lastNodeId = parentId;

        nodeList.forEach((node, index) => {
            if (!node || !node.type) {
                console.warn('Invalid node:', node);
                return;
            }

            // Ensure ID is a string and unique (fallback to index if missing)
            const nodeId = node.id ? String(node.id) : `node-${parentId || 'root'}-${index}`;

            // Create ReactFlow node
            nodes.push({
                id: nodeId,
                type: node.type,
                position: { x: baseX, y: currentY },
                data: node,
            });

            // Create edge from parent/previous node
            if (lastNodeId && lastNodeId !== nodeId) {
                const edgeLabel = isIfBranch ? 'Yes' : isElseBranch ? 'No' : '';
                const edgeColor = isIfBranch ? '#22c55e' : isElseBranch ? '#ef4444' : '#64748b';

                edges.push({
                    id: `${lastNodeId}-${nodeId}`,
                    source: lastNodeId, // Source ID
                    target: nodeId,     // Target ID (must match node.id)
                    label: edgeLabel,
                    animated: true,
                    style: { stroke: edgeColor, strokeWidth: 2 }, // Made visible
                    type: 'smoothstep', // Better routing
                });
            }

            // Reset branch flags after first node in list uses them
            if (isIfBranch) isIfBranch = false;
            if (isElseBranch) isElseBranch = false;

            currentY += ySpacing;

            // Handle decision nodes with if/else blocks
            if (node.type === 'decision') {
                const ifBlock = node.if_block || [];
                const elseBlock = node.else_block || [];

                // Track max Y to continue main branch correctly
                let maxBranchY = currentY;

                // Process if-block (left branch)
                if (ifBlock.length > 0) {
                    const ifX = baseX - xSpacing;
                    const ifResult = processNodes(ifBlock, nodeId, ifX, currentY, true, false);
                    maxBranchY = Math.max(maxBranchY, ifResult.endY);
                }

                // Process else-block (right branch)
                if (elseBlock.length > 0) {
                    const elseX = baseX + xSpacing;
                    const elseResult = processNodes(elseBlock, nodeId, baseX + xSpacing, currentY, false, true);
                    maxBranchY = Math.max(maxBranchY, elseResult.endY);
                }

                currentY = maxBranchY;
            }

            // Handle Loops (while_loop, do_while)
            if (node.type === 'while_loop' || node.type === 'do_while') {
                const loopActions = node.actions || [];

                if (loopActions.length > 0) {
                    // Render loop body slightly indented
                    const loopX = baseX + (node.type === 'do_while' ? 0 : xSpacing * 0.5);
                    // For visualization, we treat loop body effectively like a linear sequence starting from the loop node
                    // But we want to indicate the cycle.

                    const loopResult = processNodes(loopActions, nodeId, loopX, currentY);
                    currentY = loopResult.endY;

                    // Add BACK edge from last action to loop node to define cycle
                    if (loopResult.lastNodeId) {
                        edges.push({
                            id: `${loopResult.lastNodeId}-${nodeId}-cycle`,
                            source: loopResult.lastNodeId,
                            target: nodeId,
                            label: 'Repeat',
                            animated: true,
                            type: 'default',
                            style: { stroke: '#a855f7', strokeDasharray: 5 },
                        });
                    }
                }
            }

            lastNodeId = nodeId;
        });

        return { endY: currentY, lastNodeId };
    }

    // Process all top-level nodes
    processNodes(wave, null, 0, 0, false, false);

    return { nodes, edges };
}

export default function WorkflowGraph({ workflow, onNodeClick }) {
    // Derive nodes and edges directly from prop
    const { nodes, edges, parseError } = useMemo(() => {
        try {
            const { nodes, edges } = parseWaveToGraph(workflow || []);
            return { nodes, edges, parseError: null };
        } catch (err) {
            console.error("Graph Parse Error:", err);
            return { nodes: [], edges: [], parseError: err };
        }
    }, [workflow]);

    // We use a key to force re-mounting ReactFlow when workflow changes significant
    const graphKey = useMemo(() => {
        if (!workflow) return 'empty';
        return `wf-${workflow.length}-${nodes.length}`;
    }, [workflow, nodes.length]);

    // Handle node click
    const onNodeClickCallback = useCallback((event, node) => {
        if (onNodeClick && node && node.id) {
            onNodeClick(node.id);
        }
    }, [onNodeClick]);

    if (parseError) {
        return (
            <div className="flex items-center justify-center h-full text-red-500 p-4">
                Graph Error: {parseError.message}
            </div>
        );
    }

    if (!workflow || workflow.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                No workflow data available
            </div>
        );
    }

    return (
        <div className="w-full h-full bg-background" key={graphKey}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                // onNodesChange/onEdgesChange omitted for read-only stability
                // Add them back if dragging needed, but requires careful state management
                onNodeClick={onNodeClickCallback}
                nodeTypes={nodeTypes}
                fitView
                attributionPosition="bottom-left"
            >
                <Background />
                <Controls />
                <MiniMap
                    nodeColor={(node) => {
                        switch (node.type) {
                            case 'user_interaction': return '#3b82f6';
                            case 'api_call': return '#22c55e';
                            case 'decision': return '#eab308';
                            case 'while_loop':
                            case 'do_while': return '#a855f7';
                            default: return '#64748b';
                        }
                    }}
                />
            </ReactFlow>
        </div>
    );
}
