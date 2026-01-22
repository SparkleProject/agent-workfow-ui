// Mock API service for AI agent interactions
// This will be replaced with real API calls once the backend is available

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const sendMessage = async (message, model, previousResponse = null, previousRequest = null) => {
    try {


        const response = await fetch('/api/azure/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model,
                message: message,
                previousResponse: previousResponse,
                previousRequest: previousRequest
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        let workflowData = data.wave || null;
        let waveSummaryData = data.wave_summary || null;
        let changesData = data.changes || null;

        // If workflow data isn't at the top level, try to parse it from the response text
        if (!workflowData && data.response && typeof data.response === 'string') {
            try {
                // Check if the response looks like JSON
                const trimmedResponse = data.response.trim();
                // Simple heuristic to check if it might be JSON
                if (trimmedResponse.startsWith('{') && (trimmedResponse.includes('"wave"') || trimmedResponse.includes('"type": "wave"'))) {
                    const parsedResponse = JSON.parse(data.response);

                    // Extract wave_summary from parsed response if not already found
                    if (!waveSummaryData && parsedResponse.wave_summary) {
                        waveSummaryData = parsedResponse.wave_summary;
                    }

                    // Extract changes from parsed response if not already found
                    if (!changesData && parsedResponse.changes) {
                        changesData = parsedResponse.changes;
                    }

                    // Case 1: V1 - Wrapped in "wave" array
                    if (parsedResponse.wave && Array.isArray(parsedResponse.wave)) {
                        workflowData = parsedResponse.wave;
                    }
                    // Case 2: V2 - Root object is the wave
                    else if (parsedResponse.type === 'wave' && Array.isArray(parsedResponse.actions)) {
                        workflowData = parsedResponse;
                    }
                    // Case 3: V2 - Wrapped in "wave" object
                    else if (parsedResponse.wave && parsedResponse.wave.type === 'wave') {
                        workflowData = parsedResponse.wave;
                    }
                }
            } catch (e) {
                // Ignore parsing errors, it might just be regular text
            }
        }

        return {
            role: 'assistant',
            content: data.response,
            workflow: workflowData,
            waveSummary: waveSummaryData,
            changes: changesData
        };
    } catch (error) {
        console.error('Error in sendMessage:', error);
        throw error;
    }
};

// Future integration point for real API - keeping for backward compatibility if needed, 
// but pointing to sendMessage
export const connectToAgentAPI = async (apiUrl, message) => {
    return sendMessage(message, 'default-model');
};

export const getModels = async () => {
    try {
        const response = await fetch('/api/azure/models');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        // The backend returns an array of strings e.g. ["gpt-4", "gpt-3.5"]
        // We need to map this to objects for the UI
        return data.map(model => ({
            id: model,
            name: model
        }));
    } catch (error) {
        console.error('Error fetching models:', error);
        // Fallback to empty array or rethrow depending on desired behavior
        // For now, returning empty array to prevent UI crash
        return [];
    }
};
// Streaming version of sendMessage for Server-Sent Events
export const sendStreamingMessage = async (message, model, previousResponse = null, previousRequest = null, onChunk, onComplete, onError) => {
    try {
        const response = await fetch('/api/azure/chat/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model,
                message: message,
                previousResponse: previousResponse,
                previousRequest: previousRequest
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponse = '';

        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            // Keep the last incomplete line in the buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const data = line.slice(5); // Remove 'data:' prefix, keep the space
                    console.log('[SSE] Received data:', data);

                    if (data === '[DONE]') {
                        continue;
                    }

                    // Try to parse as JSON first
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.chunk) {
                            console.log('[SSE] Parsed chunk:', parsed.chunk);
                            fullResponse += parsed.chunk;
                            onChunk(parsed.chunk);
                        } else if (typeof parsed === 'string') {
                            // If parsed is a string, use it directly
                            fullResponse += parsed;
                            onChunk(parsed);
                        }
                    } catch (e) {
                        // If JSON parsing fails, treat it as raw text
                        if (data) {
                            console.log('[SSE] Raw text chunk:', data);
                            fullResponse += data;
                            onChunk(data);
                        }
                    }
                }
            }
        }

        // Parse the complete response
        let workflowData = null;
        let waveSummaryData = null;
        let changesData = null;

        try {
            const trimmedResponse = fullResponse.trim();
            if (trimmedResponse.startsWith('{') && (trimmedResponse.includes('"wave"') || trimmedResponse.includes('"type": "wave"'))) {
                const parsedResponse = JSON.parse(fullResponse);

                if (parsedResponse.wave_summary) {
                    waveSummaryData = parsedResponse.wave_summary;
                }

                if (parsedResponse.changes) {
                    changesData = parsedResponse.changes;
                }

                if (parsedResponse.wave && Array.isArray(parsedResponse.wave)) {
                    workflowData = parsedResponse.wave;
                } else if (parsedResponse.type === 'wave' && Array.isArray(parsedResponse.actions)) {
                    workflowData = parsedResponse;
                } else if (parsedResponse.wave && parsedResponse.wave.type === 'wave') {
                    workflowData = parsedResponse.wave;
                }
            }
        } catch (e) {
            console.warn('Failed to parse complete response:', e);
        }

        const result = {
            role: 'assistant',
            content: fullResponse,
            workflow: workflowData,
            waveSummary: waveSummaryData,
            changes: changesData
        };

        onComplete(result);
        return result;

    } catch (error) {
        console.error('Error in sendStreamingMessage:', error);
        if (onError) {
            onError(error);
        }
        throw error;
    }
};
