import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

export type ConnectClientSocket = Socket;

export function createConnectSocket(accessToken: string): ConnectClientSocket {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? window.location.origin;
  return io(`${baseUrl}/connect`, {
    auth: { token: accessToken },
    autoConnect: false,
    reconnection: false,
    reconnectionDelayMax: 10_000,
  });
}
