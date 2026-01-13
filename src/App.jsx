import { useState } from 'react';
import Sidebar from './components/Sidebar';
import WelcomeScreen from './components/WelcomeScreen';
import ChatInput from './components/ChatInput';
import MessageList from './components/MessageList';
import WorkflowGraph from './components/WorkflowGraph';
import WorkflowSimulator from './components/WorkflowSimulator';
import { sendMessage } from './services/agentApi';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import './index.css';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [workflow, setWorkflow] = useState(null);
  const [workflowPanelOpen, setWorkflowPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('simulator'); // 'simulator' or 'graph'
  const [activeNodeId, setActiveNodeId] = useState(null);








  const handleSendMessage = async (content, modelId) => {
    // Add user message
    const userMessage = { role: 'user', content };
    setMessages(prev => [...prev, userMessage]);

    // Show loading state
    setIsLoading(true);

    try {
      // Call API
      const response = await sendMessage(content, modelId);
      setMessages(prev => [...prev, response]);

      // Check if response contains workflow data
      // Fix: Handle both array (V1) and object (V2 wave) formats
      const hasWorkflow = response.workflow && (
        (Array.isArray(response.workflow) && response.workflow.length > 0) ||
        (typeof response.workflow === 'object' && !Array.isArray(response.workflow))
      );

      if (hasWorkflow) {
        setWorkflow(response.workflow);
        setWorkflowPanelOpen(true);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, there was an error processing your request.'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen(prev => !prev);
  };

  const toggleWorkflowPanel = () => {
    setWorkflowPanelOpen(prev => !prev);
  };

  const closeWorkflowPanel = () => {
    setWorkflowPanelOpen(false);
  };

  const handleNodeClick = (nodeId) => {
    setActiveNodeId(nodeId);
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} toggleSidebar={toggleSidebar} />

      {/* Main Content */}
      <div
        className="flex-1 flex transition-all duration-300"
        style={{ marginLeft: sidebarOpen ? '256px' : '64px' }}
      >
        {/* Chat Area */}
        <div className={`flex flex-col overflow-hidden transition-all duration-300 ${workflowPanelOpen ? 'w-1/2' : 'w-full'}`}>
          <div className="flex-1 flex flex-col overflow-hidden">
            {messages.length === 0 ? (
              <WelcomeScreen />
            ) : (
              <MessageList
                messages={messages}
                isLoading={isLoading}
                activeNodeId={activeNodeId}
              />
            )}
          </div>

          {/* Input Area */}
          <div className="flex-shrink-0 p-6 border-t border-border/50">
            <ChatInput onSendMessage={handleSendMessage} disabled={isLoading} />
          </div>
        </div>

        {/* Workflow Panel */}
        {workflowPanelOpen && (
          <div className="w-1/2 border-l border-border/50 flex flex-col bg-background">
            {/* Panel Header with Tabs */}
            <div className="border-b border-border/50">
              <div className="flex items-center justify-between p-4 pb-0">
                <h2 className="text-lg font-semibold">Workflow</h2>
                <button
                  onClick={closeWorkflowPanel}
                  className="p-1 hover:bg-secondary rounded transition-colors"
                  aria-label="Close workflow panel"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 px-4 pt-3 pb-1">
                <button
                  onClick={() => setActiveTab('simulator')}
                  className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-all border-b-2 ${activeTab === 'simulator'
                    ? 'bg-secondary text-foreground border-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30 border-transparent'
                    }`}
                >
                  📝 Simulator
                </button>
                <button
                  onClick={() => setActiveTab('graph')}
                  className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-all border-b-2 ${activeTab === 'graph'
                    ? 'bg-secondary text-foreground border-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30 border-transparent'
                    }`}
                >
                  📊 Graph
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden relative">
              <div className={`absolute inset-0 bg-background ${activeTab === 'simulator' ? 'block' : 'hidden'}`}>
                <WorkflowSimulator workflow={workflow} />
              </div>
              <div className={`absolute inset-0 bg-background ${activeTab === 'graph' ? 'block' : 'hidden'}`}>
                <WorkflowGraph
                  workflow={workflow}
                  onNodeClick={handleNodeClick}
                />
              </div>
            </div>
          </div>
        )}

        {/* Workflow Toggle Button (when panel is closed) */}
        {workflow && !workflowPanelOpen && (
          <button
            onClick={toggleWorkflowPanel}
            className="fixed right-4 bottom-24 bg-primary text-primary-foreground p-3 rounded-full shadow-lg hover:bg-primary/90 transition-colors"
            aria-label="Show workflow panel"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
