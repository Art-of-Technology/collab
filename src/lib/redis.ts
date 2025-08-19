import { createClient, type RedisClientType } from 'redis';

let baseClient: RedisClientType | null = null;
let connectPromise: Promise<RedisClientType | null> | null = null;

export async function getRedisClient(): Promise<RedisClientType | null> {
  try {
    if (!baseClient) {
      const url = process.env.REDIS_URL;
      if (!url) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('Redis disabled: REDIS_URL is not set');
        }
        return null;
      }
      baseClient = createClient({ url });
      baseClient.on('error', (err) => console.error('Redis Client Error', err));
    }
    if (!baseClient.isOpen) {
      // Guard concurrent connects
      if (!connectPromise) {
        connectPromise = baseClient.connect().then(() => baseClient).catch((e) => {
          console.error('Redis connect failed', e);
          return null;
        }).finally(() => {
          connectPromise = null;
        });
      }
      const connected = await connectPromise;
      return connected;
    }
    return baseClient;
  } catch (err) {
    console.error('Failed to initialize Redis client', err);
    return null;
  }
}

export async function getRedisSubscriber(): Promise<RedisClientType | null> {
  const client = await getRedisClient();
  if (!client) return null;
  const sub = client.duplicate();
  await sub.connect();
  return sub;
}

export async function publishEvent(channel: string, message: any): Promise<boolean> {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    await client.publish(channel, payload);
    return true;
  } catch (err) {
    console.warn('Redis publish failed', err);
    return false;
  }
}

// Global helpers for ergonomics (avoid repeating client acquisition in modules)
export async function withRedisOrVoid(fn: (redis: RedisClientType) => Promise<void>): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;
  await fn(client);
}

export async function withRedisOr<T>(fallback: T, fn: (redis: RedisClientType) => Promise<T>): Promise<T> {
  const client = await getRedisClient();
  if (!client) return fallback;
  return fn(client);
}