'use client';
import { useEffect, useRef, useState } from 'react';

type WSMessage =
  | { type: 'cell-focus'; userId: string; userName: string; cellId: string; color: string }
  | { type: 'cell-blur'; userId: string; cellId: string }
  | { type: 'cell-update'; rowId: string; columnId: string; value: any; userId: string; timestamp: number }
  | { type: 'row-lock'; rowId: string; isLocked: boolean; userId: string; timestamp: number }
  | { type: 'column-permissions-changed'; columnId: string; userId: string; timestamp: number }
  | { type: 'row-comment'; rowId: string; comment: any; userId: string; timestamp: number }
  | { type: 'row-inserted'; row: any; userId: string }
  | { type: 'form-submission'; row: any; userId: string }
  | { type: 'user-disconnected'; userId: string }
  | { type: 'permissions-changed'; action: string; shareId?: string; userId?: string; timestamp?: number }
  | { type: 'row-editing'; rowId: string; userId: string; userName: string; color: string }
  | { type: 'row-editing-done'; rowId: string; userId: string };

type MessageHandler = (message: WSMessage) => void;

export function useWebSocket(tableId: string, session: any) {
  var wsRef = useRef<WebSocket | null>(null);
  var connState = useState(false);
  var isConnected = connState[0]; var setIsConnected = connState[1];
  var handlers = useRef<Set<MessageHandler>>(new Set());
  var mountedRef = useRef(true);
  var reconnectTimer = useRef<any>(null);
  var reconnectAttempts = useRef(0);

  useEffect(function() {
    mountedRef.current = true;
    reconnectAttempts.current = 0;
    if (!session?.user) return;

    function getWsUrl() {
      var hostname = window.location.hostname;
      var isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
      if (isLocal) {
        return 'ws://localhost:3001';
      }
      // Production: connect via Cloudflare tunnel using wss://
      return 'wss://ws.boudreaulogic.com';
    }

    var wsUrl = getWsUrl();
    console.log('Attempting WebSocket connection to:', wsUrl);

    function connect() {
      if (!mountedRef.current) return;

      fetch('/api/auth/ws-token')
        .then(function(res) {
          if (!res.ok) {
            console.error('Failed to get WS token:', res.status);
            scheduleReconnect();
            return;
          }
          return res.json();
        })
        .then(function(data) {
          if (!data || !data.token || !mountedRef.current) return;

          var socket = new WebSocket(wsUrl + '?token=' + encodeURIComponent(data.token));
          wsRef.current = socket;

          socket.onopen = function() {
            if (!mountedRef.current) {
              socket.close();
              return;
            }
            console.log('WebSocket connected (authenticated)');
            setIsConnected(true);
            reconnectAttempts.current = 0;
            socket.send(JSON.stringify({
              type: 'register',
              userId: session.user.id,
              tableId: tableId,
            }));
          };

          socket.onmessage = function(event) {
            if (!mountedRef.current) return;
            try {
              var message = JSON.parse(event.data);
              handlers.current.forEach(function(handler) { handler(message); });
            } catch (error) {
              console.error('WebSocket message error:', error);
            }
          };

          socket.onclose = function() {
            console.log('WebSocket disconnected');
            setIsConnected(false);
            wsRef.current = null;
            if (mountedRef.current) {
              scheduleReconnect();
            }
          };

          socket.onerror = function(error) {
            console.error('WebSocket error:', error);
          };
        })
        .catch(function(error) {
          console.error('Failed to establish WS connection:', error);
          if (mountedRef.current) {
            scheduleReconnect();
          }
        });
    }

    function scheduleReconnect() {
      if (!mountedRef.current) return;
      reconnectAttempts.current = reconnectAttempts.current + 1;
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
      var delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current - 1), 30000);
      console.log('Reconnecting in ' + (delay / 1000) + 's (attempt ' + reconnectAttempts.current + ')');
      reconnectTimer.current = setTimeout(connect, delay);
    }

    connect();

    return function() {
      mountedRef.current = false;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      if (wsRef.current) wsRef.current.close();
    };
  }, [tableId, session?.user?.id]);

  function send(message: any) {
    if (wsRef.current?.readyState === WebSocket.OPEN && session?.user) {
      wsRef.current.send(JSON.stringify(Object.assign({}, message, {
        userId: session.user.id,
        tableId: tableId,
      })));
    }
  }

  function subscribe(handler: MessageHandler) {
    handlers.current.add(handler);
    return function() {
      handlers.current.delete(handler);
    };
  }

  return { isConnected: isConnected, send: send, subscribe: subscribe };
}