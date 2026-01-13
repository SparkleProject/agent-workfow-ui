// Mock API service for AI agent interactions
// This will be replaced with real API calls once the backend is available

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const sendMessage = async (message, model) => {
    try {


        const response = await fetch('/api/azure/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model,
                message: message
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        let workflowData = data.wave || null;

        // If workflow data isn't at the top level, try to parse it from the response text
        if (!workflowData && data.response && typeof data.response === 'string') {
            try {
                // Check if the response looks like JSON
                const trimmedResponse = data.response.trim();
                // Simple heuristic to check if it might be JSON
                if (trimmedResponse.startsWith('{') && (trimmedResponse.includes('"wave"') || trimmedResponse.includes('"type": "wave"'))) {
                    const parsedResponse = JSON.parse(data.response);

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
            workflow: workflowData
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
