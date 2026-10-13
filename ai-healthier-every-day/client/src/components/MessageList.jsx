import React, { useEffect, useRef } from 'react';

export default function MessageList({ messages, streamingText, isStreaming, messagesEndRef }) {
  return (
    <div className="message-list">
      {messages.length === 0 && !streamingText && (
        <div className="empty-state">
          <div className="empty-icon">💬</div>
          <p>Start chatting with Plus!</p>
          <p className="empty-hint">Tell me what you had for lunch, or ask about your health goals.</p>
        </div>
      )}

      {messages.map((msg, idx) => (
        <div key={idx} className={`message ${msg.role}`}>
          <div className="message-avatar">
            {msg.role === 'user' ? '😊' : '💚'}
          </div>
          <div className="message-content">
            <div className="message-text">{msg.content}</div>
            <div className="message-time">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      ))}

      {isStreaming && streamingText && (
        <div className="message assistant streaming">
          <div className="message-avatar">💚</div>
          <div className="message-content">
            <div className="message-text">{streamingText}</div>
            <div className="typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
