import { io } from 'socket.io-client';
import { setTimeout as delay } from 'timers/promises';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5000';
const TOKEN = process.env.TOKEN;

async function connectClient(i) {
  const socket = io(BASE_URL, {
    transports: ['websocket', 'polling'],
    auth: { token: TOKEN },
    reconnection: false,
    timeout: 5000,
  });

  socket.on('connect', () => {
    console.log(`client ${i} connected`);
  });

  socket.on('connect_error', (err) => {
    console.error(`client ${i} connect_error`, err.message);
  });

  socket.on('disconnect', (reason) => {
    console.error(`client ${i} disconnect`, reason);
  });

  await delay(3000);
  socket.disconnect();
}

async function main() {
  const count = Number(process.env.COUNT || 100);
  const promises = [];
  for (let i = 0; i < count; i += 1) {
    promises.push(connectClient(i));
  }
  await Promise.all(promises);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
