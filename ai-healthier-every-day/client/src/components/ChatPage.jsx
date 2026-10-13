import React, { useState, useEffect, useRef, useCallback } from 'react';
import PlusCharacter from './PlusCharacter.jsx';
import MessageList from './MessageList.jsx';
import MessageInput from './MessageInput.jsx';
import HistoryPanel from './HistoryPanel.jsx';

export default function ChatPage({ ws, userId, userData, onNavigate }) {
  const [messages, setMessages] = useState([]);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [hourlyTimer, setHourlyTimer] = useState(null);
  const messagesEndRef = useRef(null);
  const streamBuffer = useRef('');

  // Handle incoming WebSocket messages
  useEffect(() => {
    const unsubscribe = ws.onMessage((data) => {
      if (data.type === 'connected') {
        // Connection established - trigger refresher
        setTimeout(() => {
          ws.send({ type: 'refresher' });
          setIsStreaming(true);
        }, 500);
      } else if (data.type === 'stream') {
        streamBuffer.current += data.content;
        setStreamingText(streamBuffer.current);
        setIsStreaming(true);
      } else if (data.type === 'done') {
        const fullText = streamBuffer.current;
        if (fullText) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: fullText, timestamp: new Date().toISOString() },
          ]);
        }
        streamBuffer.current = '';
        setStreamingText('');
        setIsStreaming(false);
      } else if (data.type === 'error') {
        setIsStreaming(false);
        setStreamingText('');
        streamBuffer.current = '';
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Oops! Something went wrong. Please try again. 😅', timestamp: new Date().toISOString() },
        ]);
      }
    });
    return unsubscribe;
  }, [ws]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Set up hourly refresher
  useEffect(() => {
    const timer = setInterval(() => {
      if (!isStreaming && ws.connected) {
        ws.send({ type: 'refresher' });
      }
    }, 3600000); // 1 hour = 3600000ms
    setHourlyTimer(timer);
    return () => clearInterval(timer);
  }, [ws, isStreaming]);

  const handleSendMessage = useCallback((text) => {
    if (!text.trim() || isStreaming) return;

    // Add user message to UI
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text, timestamp: new Date().toISOString() },
    ]);

    // Send to WebSocket
    streamBuffer.current = '';
    setStreamingText('');
    ws.send({ type: 'chat', message: text, agentType: 'conversation' });
    setIsStreaming(true);
  }, [ws, isStreaming]);

  return (
    <div className="chat-page">
      <div className="chat-layout">
        {/* Left: Character display */}
        <div className="character-section">
          <PlusCharacter isStreaming={isStreaming} />
          <div className="character-speech-bubble">
            {streamingText || messages[messages.length - 1]?.content || 'Hi! I am Plus, your health buddy! 💚'}
          </div>
        </div>

        {/* Right: Chat area */}
        <div className="chat-section">
          <div className="chat-header">
            <h2>Chat with Plus</h2>
            <button className="history-btn" onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? '✕ Close' : '📜 History'}
            </button>
          </div>

          {showHistory ? (
            <HistoryPanel userId={userId} messages={messages} />
          ) : (
            <>
              <MessageList
                messages={messages}
                streamingText={streamingText}
                isStreaming={isStreaming}
                messagesEndRef={messagesEndRef}
              />
              <MessageInput onSend={handleSendMessage} disabled={isStreaming} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
