import { io } from 'socket.io-client';

let socket = null;
export const initSocket = (backendUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000')) => {
  if (socket) return socket;
  const url = backendUrl.replace(/\/api$/, '');
  socket = io(url, { transports: ['websocket'], path: '/socket.io' });
  socket.on('connect', () => console.log('Dashboard connected to socket', socket.id));
  socket.on('disconnect', () => console.log('Dashboard socket disconnected'));
  return socket;
};

export const subscribe = (event, handler) => {
  if (!socket) initSocket();
  socket.on(event, handler);
};

export const unsubscribe = (event, handler) => {
  if (!socket) return;
  socket.off(event, handler);
};

export default { initSocket, subscribe, unsubscribe };
