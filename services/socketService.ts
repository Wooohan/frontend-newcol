import { io, Socket } from 'socket.io-client';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE || window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
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

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
