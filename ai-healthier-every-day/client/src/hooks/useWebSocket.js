import { useRef, useEffect, useState, useCallback } from 'react';

const WS_URL = `ws://${window.location.hostname}:3001/ws`;

export function useWebSocket(userId) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const messageHandlers = useRef(new Set());
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(`${WS_URL}?userId=${userId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected');
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setMessages((prev) => [...prev, data]);

          if (data.type === 'connected') {
            console.log('[WS] Session connected:', data.userId);
          } else if (data.type === 'stream') {
            setStreaming(true);
          } else if (data.type === 'done' || data.type === 'error') {
            setStreaming(false);
          }

          // Notify all registered handlers
          messageHandlers.current.forEach((handler) => handler(data));
        } catch (e) {
          console.error('[WS] Parse error:', e);
        }
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected, reconnecting in 3s...');
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
      };
    } catch (e) {
      console.error('[WS] Connection failed:', e);
      reconnectTimer.current = setTimeout(connect, 3000);
    }
  }, [userId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  const send = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    console.warn('[WS] Not connected, message not sent');
    return false;
  }, []);

  const onMessage = useCallback((handler) => {
    messageHandlers.current.add(handler);
    return () => messageHandlers.current.delete(handler);
  }, []);

  return {
    wsRef,
    connected,
    messages,
    streaming,
    send,
    onMessage,
  };
}
