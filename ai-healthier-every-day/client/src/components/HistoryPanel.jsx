import React from 'react';

export default function HistoryPanel({ userId, messages }) {
  // Group messages by time periods
  const today = messages.filter((msg) => {
    const msgDate = new Date(msg.timestamp).toDateString();
    const today = new Date().toDateString();
    return msgDate === today;
  });

  return (
    <div className="history-panel">
      <div className="history-header">
        <h3>Today's History</h3>
        <span className="history-count">{today.length} messages</span>
      </div>
      <div className="history-list">
        {today.length === 0 ? (
          <div className="history-empty">
            <p>No messages today yet.</p>
            <p className="history-empty-hint">Start chatting with Plus to see your history here!</p>
          </div>
        ) : (
          today.map((msg, idx) => (
            <div key={idx} className={`history-item ${msg.role}`}>
              <div className="history-item-header">
                <span className="history-item-role">
                  {msg.role === 'user' ? '😊 You' : '💚 Plus'}
                </span>
                <span className="history-item-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="history-item-content">{msg.content}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
