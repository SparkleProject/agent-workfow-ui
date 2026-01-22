import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import WelcomeScreen from './components/WelcomeScreen';
import ChatInput from './components/ChatInput';
import MessageList from './components/MessageList';
import WorkflowGraph from './components/WorkflowGraph';
import WorkflowSimulator from './components/WorkflowSimulator';
import WaveSummary from './components/WaveSummary';
import { sendMessage, sendStreamingMessage } from './services/agentApi';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import './index.css';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [workflow, setWorkflow] = useState(null);
  const [waveSummary, setWaveSummary] = useState(null);
  const [changes, setChanges] = useState(null);
  const [workflowPanelOpen, setWorkflowPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('simulator');
  const [lastUserMessage, setLastUserMessage] = useState(null);
  const [lastAssistantResponse, setLastAssistantResponse] = useState(null);
  const [activeNodeId, setActiveNodeId] = useState(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const handleSendMessage = async (content, modelId, previousResponse = null, previousRequest = null, streamEnabled = false) => {
    // Show loading state
    setIsLoading(true);

    try {
      if (streamEnabled) {
        // Streaming mode
        setIsStreaming(true);
        setStreamingContent('');

        // Add both user message and streaming placeholder in a single update
        // and calculate the correct index for the streaming message
        let streamingMessageIndex;
        setMessages(prev => {
          streamingMessageIndex = prev.length + 1; // User at prev.length, assistant at prev.length + 1
          console.log('[App] Adding messages, streaming will be at index:', streamingMessageIndex);
          return [...prev,
          { role: 'user', content },
          {
            role: 'assistant',
            content: '',
            isStreaming: true,
            streamingContent: ''
          }
          ];
        });

        await sendStreamingMessage(
          content,
          modelId,
          previousResponse,
          previousRequest,
          // onChunk callback
          (chunk) => {
            setStreamingContent(prev => prev + chunk);
            console.log('[App] onChunk called with chunk:', chunk, 'updating index:', streamingMessageIndex);
            setMessages(prev => {
              const newMessages = [...prev];
              if (newMessages[streamingMessageIndex]) {
                newMessages[streamingMessageIndex] = {
                  ...newMessages[streamingMessageIndex],
                  streamingContent: (newMessages[streamingMessageIndex].streamingContent || '') + chunk
                };
              }
              return newMessages;
            });
          },
          // onComplete callback
          (result) => {
            setIsStreaming(false);
            console.log('[App] onComplete called with result:', result);
            setStreamingContent('');

            // Replace streaming message with final result
            setMessages(prev => {
              const newMessages = [...prev];
              newMessages[streamingMessageIndex] = {
                ...result,
                isStreaming: false
              };
              console.log('[App] Updated message at index', streamingMessageIndex, 'with isStreaming: false');
              return newMessages;
            });

            // Update conversation context
            setLastUserMessage(content);
            setLastAssistantResponse(result.content);

            // Check if response contains workflow data
            const hasWorkflow = result.workflow && (
              (Array.isArray(result.workflow) && result.workflow.length > 0) ||
              (typeof result.workflow === 'object' && !Array.isArray(result.workflow))
            );

            if (hasWorkflow) {
              setWorkflow(result.workflow);
              setWaveSummary(result.waveSummary);
              setChanges(result.changes);
              setWorkflowPanelOpen(true);
            }
          },
          // onError callback
          (error) => {
            setIsStreaming(false);
            setStreamingContent('');
            console.error('Streaming error:', error);
          }
        );
      } else {
        // Non-streaming mode (original behavior)
        const userMessage = { role: 'user', content };
        setMessages(prev => [...prev, userMessage]);

        const response = await sendMessage(content, modelId, previousResponse, previousRequest);
        setMessages(prev => [...prev, response]);

        // Update conversation context
        setLastUserMessage(content);
        setLastAssistantResponse(response.content);

        // Check if response contains workflow data
        const hasWorkflow = response.workflow && (
          (Array.isArray(response.workflow) && response.workflow.length > 0) ||
          (typeof response.workflow === 'object' && !Array.isArray(response.workflow))
        );

        if (hasWorkflow) {
          setWorkflow(response.workflow);
          setWaveSummary(response.waveSummary);
          setChanges(response.changes);
          setWorkflowPanelOpen(true);
        }
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

          <div className="flex-shrink-0 p-6 border-t border-border/50">
            <ChatInput
              onSendMessage={handleSendMessage}
              disabled={isLoading}
              lastUserMessage={lastUserMessage}
              lastAssistantResponse={lastAssistantResponse}
            />
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
                  onClick={() => setActiveTab('summary')}
                  className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-all border-b-2 ${activeTab === 'summary'
                    ? 'bg-secondary text-foreground border-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30 border-transparent'
                    }`}
                >
                  📄 Summary
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
              <div className={`absolute inset-0 bg-background ${activeTab === 'summary' ? 'block' : 'hidden'}`}>
                <WaveSummary summary={waveSummary} changes={changes} />
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
