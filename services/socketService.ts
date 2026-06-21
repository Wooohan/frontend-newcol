import { io, Socket } from 'socket.io-client';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE || window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 15000,
      forceNew: false,
    });

    socket.on('connect', () => {
      console.log('Socket.IO connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket.IO connection error:', err.message);
    });
  }
  return socket;
}

export function onNewMessage(callback: (message: any) => void): () => void {
  const s = getSocket();
  s.on('new_message', callback);
  return () => { s.off('new_message', callback); };
}

export function onConversationUpdated(callback: (conversation: any) => void): () => void {
  const s = getSocket();
  s.on('conversation_updated', callback);
  return () => { s.off('conversation_updated', callback); };
}

export function onAgentStatusChanged(callback: (data: any) => void): () => void {
  const s = getSocket();
  s.on('agent_status_changed', callback);
  return () => { s.off('agent_status_changed', callback); };
}

export function emitAgentOnline(agentId: string, agentName: string) {
  const s = getSocket();
  s.emit('agent_online', { agentId, agentName });
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
