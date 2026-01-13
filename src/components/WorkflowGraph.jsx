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
    const expr = data.condition?.expression?.['en-US'] || data.condition?.expression || data.expression?.['en-US'] || data.expression || 'Condition';
    return (
        <div className="px-4 py-3 bg-yellow-500/20 border-2 border-yellow-500 rounded-lg min-w-[200px] max-w-[300px]">
            <Handle type="target" position={Position.Top} className="!bg-yellow-500" />
            <div className="font-semibold text-yellow-400 text-sm mb-1">🔀 Decision</div>
            <div className="text-xs text-foreground/80 line-clamp-2 font-mono">
                {expr}
            </div>
            <Handle type="source" position={Position.Bottom} className="!bg-yellow-500" />
        </div>
    );
}

// Custom node component for loops
function LoopNode({ data }) {
    const isDoWhile = data.type === 'do_while';
    const expr = data.condition?.expression?.['en-US'] || data.condition?.expression || data.expression?.['en-US'] || data.expression || 'Condition';
    return (
        <div className="px-4 py-3 bg-purple-500/20 border-2 border-purple-500 rounded-lg min-w-[200px] max-w-[300px]">
            <Handle type="target" position={Position.Top} className="!bg-purple-500" />
            <div className="font-semibold text-purple-400 text-sm mb-1">
                {isDoWhile ? '🔄 Do While Loop' : '🔄 While Loop'}
            </div>
            <div className="text-xs text-foreground/80 line-clamp-2 font-mono">
                {expr}
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
function parseWaveToGraph(workflow) {
    if (!workflow) {
        return { nodes: [], edges: [] };
    }

    // Normalize input: extract actions if it's a V2 wave object
    let wave = [];
    if (Array.isArray(workflow)) {
        wave = workflow;
    } else if (typeof workflow === 'object' && Array.isArray(workflow.actions)) {
        wave = workflow.actions;
    }

    if (wave.length === 0) {
        return { nodes: [], edges: [] };
    }

    const nodes = [];
    const edges = [];
    const NODE_WIDTH = 350; // Increased to cover max-width (300px) + padding
    const MIN_X_SPACING = 100; // Increased gap between branches
    const Y_SPACING = 150;

    // Helper: recursively calculate the width required for a block of nodes
    function getBlockWidth(nodeList) {
        if (!nodeList || nodeList.length === 0) return NODE_WIDTH;

        let maxWidth = NODE_WIDTH;

        // We assume the block flows vertically. 
        // If there's a decision, the width is the sum of its branches.
        // We scan all nodes in this linear list to find the widest point (nested decisions).
        for (const node of nodeList) {
            if (node.type === 'decision') {
                const ifWidth = getBlockWidth(node.if_block);
                const elseWidth = getBlockWidth(node.else_block);
                const decisionWidth = ifWidth + elseWidth + MIN_X_SPACING;
                if (decisionWidth > maxWidth) {
                    maxWidth = decisionWidth;
                }
            } else if (node.type === 'while_loop' || node.type === 'do_while') {
                // Loops are effectively a nested block visually indented or same column
                // For simplicity, let's treat them as slightly wider or same as block
                const loopWidth = getBlockWidth(node.actions);
                if (loopWidth > maxWidth) {
                    maxWidth = loopWidth;
                }
            }
        }
        return maxWidth;
    }

    // Recursive function to render nodes
    // Returns the max Y coordinate consumed by this block and the last node IDs to connect to next block
    const processNodes = (nodeList, parentId, startX, startY, isIfBranch = false, isElseBranch = false) => {
        let currentY = startY;
        let lastNodeIds = parentId ? [parentId] : [];
        let currentLastNodeIds = [...lastNodeIds]; // Track IDs to connect FROM

        nodeList.forEach((node, index) => {
            if (!node || !node.type) return;

            // Ensure ID is a string and unique 
            const nodeId = node.id ? String(node.id) : `node-${parentId || 'root'}-${index}`;

            // Create ReactFlow node
            nodes.push({
                id: nodeId,
                type: node.type,
                position: { x: startX, y: currentY },
                data: node,
            });

            // Create edge from parent/previous node(s)
            if (currentLastNodeIds.length > 0) {
                currentLastNodeIds.forEach(sourceId => {
                    if (sourceId !== nodeId) {
                        const edgeLabel = isIfBranch && index === 0 ? 'Yes' : isElseBranch && index === 0 ? 'No' : '';
                        const edgeColor = isIfBranch && index === 0 ? '#22c55e' : isElseBranch && index === 0 ? '#ef4444' : '#64748b';
                        const edgeStyle = (isIfBranch || isElseBranch) && index === 0 ? { stroke: edgeColor, strokeWidth: 2, strokeDasharray: '5,5' } : { stroke: edgeColor, strokeWidth: 2 };

                        edges.push({
                            id: `${sourceId}-${nodeId}`,
                            source: sourceId,
                            target: nodeId,
                            label: edgeLabel,
                            animated: true,
                            style: edgeStyle,
                            type: 'smoothstep',
                        });
                    }
                });
            }

            // Reset branch flags after first node connection
            // (Only the very first link in a branch gets the Yes/No label)
            if (index === 0) {
                // We don't need to unset them for the loop, but we used them for the edge check above.
                // Actually the recursion handles the 'isIfBranch' arg, so 'index === 0' check is sufficient.
            }

            currentY += Y_SPACING;

            // Default: next node connects from this node
            let nextSourceIds = [nodeId];

            // Handle decision nodes
            if (node.type === 'decision') {
                const ifBlock = node.if_block || [];
                const elseBlock = node.else_block || [];

                let maxBranchY = currentY;
                let branchExitIds = [];

                // Calculate required widths for branches to center them under this node
                const ifWidth = getBlockWidth(ifBlock);
                const elseWidth = getBlockWidth(elseBlock);

                const totalWidth = ifWidth + elseWidth + MIN_X_SPACING;
                const leftStart = startX - (totalWidth / 2);

                const ifCenterX = leftStart + (ifWidth / 2);
                const elseStart = leftStart + ifWidth + MIN_X_SPACING;
                const elseCenterX = elseStart + (elseWidth / 2);

                // Process IF branch
                if (ifBlock.length > 0) {
                    const ifResult = processNodes(ifBlock, nodeId, ifCenterX, currentY, true, false);
                    maxBranchY = Math.max(maxBranchY, ifResult.endY);
                    if (ifResult.lastNodeIds) branchExitIds.push(...ifResult.lastNodeIds);
                } else {
                    // Empty branch means flow continues from decision node itself for this path?
                    // But effectively it means "No Action" -> Join. 
                    // So proper source is the decision node.
                    branchExitIds.push(nodeId);
                }

                // Process ELSE branch
                if (elseBlock.length > 0) {
                    const elseResult = processNodes(elseBlock, nodeId, elseCenterX, currentY, false, true);
                    maxBranchY = Math.max(maxBranchY, elseResult.endY);
                    if (elseResult.lastNodeIds) branchExitIds.push(...elseResult.lastNodeIds);
                } else {
                    branchExitIds.push(nodeId);
                }

                currentY = maxBranchY;
                // Next node in THIS list should connect from all branch exits
                nextSourceIds = branchExitIds;
            }

            // Handle Loops
            else if (node.type === 'while_loop' || node.type === 'do_while') {
                const loopActions = node.actions || [];
                if (loopActions.length > 0) {
                    const loopX = startX + 50;
                    const loopResult = processNodes(loopActions, nodeId, loopX, currentY);
                    currentY = loopResult.endY;

                    // Back-cycle edges
                    if (loopResult.lastNodeIds) {
                        loopResult.lastNodeIds.forEach(lid => {
                            edges.push({
                                id: `${lid}-${nodeId}-cycle`,
                                source: lid,
                                target: nodeId,
                                label: 'Repeat',
                                animated: true,
                                type: 'default',
                                style: { stroke: '#a855f7', strokeDasharray: 5 },
                            });
                        });
                    }
                }
                // Flow continues from the loop node (exit condition)
                nextSourceIds = [nodeId];
            }

            currentLastNodeIds = nextSourceIds;
        });

        return { endY: currentY, lastNodeIds: currentLastNodeIds };
    }

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
