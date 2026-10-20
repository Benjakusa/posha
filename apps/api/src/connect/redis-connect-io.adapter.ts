import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { RedisClientType } from 'redis';
import type { Server, ServerOptions } from 'socket.io';

/** Installs cross-instance Socket.IO rooms using dedicated Redis Pub/Sub clients. */
export class RedisConnectIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly publisher: RedisClientType,
    private readonly subscriber: RedisClientType,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    server.adapter(createAdapter(this.publisher, this.subscriber));
    return server;
  }
}
