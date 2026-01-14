
import { sendMessage } from './src/services/agentApi.js';

// Mock the global fetch
global.fetch = async () => ({
    ok: true,
    json: async () => ({
        response: JSON.stringify({
            "type": "wave",
            "wave_summary": "Summary...",
            "actions": [{ "type": "user_interaction", "id": "1" }]
        })
    })
});

// Test
const result = await sendMessage("test", "gpt-wave");
console.log("Workflow extracted:", result.workflow);
if (!result.workflow) {
    console.error("FAIL: Workflow not extracted from V2 response string");
} else {
    console.log("SUCCESS: Workflow extracted");
}
