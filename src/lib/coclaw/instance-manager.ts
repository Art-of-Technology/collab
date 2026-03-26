/**
 * Coclaw Instance Manager — Unified Interface
 *
 * Dual-mode: Local (child_process.spawn) for dev, Remote (HTTP to coclaw-manager)
 * for Docker Swarm production. Auto-selects based on COCLAW_MANAGER_URL env var.
 */

import { spawn, type ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { decryptVariable } from '@/lib/secrets/crypto';
import type { CoclawManagerConfig, CoclawProcessInfo, CoclawSpawnConfig } from './types';
import { getInstanceDir, writeInstanceConfig } from './config-generator';

// ---------------------------------------------------------------------------
// Shared Interface — both local and remote modes implement this
// ---------------------------------------------------------------------------

export interface ICoclawManager {
  getOrCreateInstance(
    userId: string,
    workspaceId: string,
    spawnConfig: CoclawSpawnConfig,
  ): Promise<CoclawProcessInfo>;
  stopInstance(
    userId: string,
    workspaceId: string,
    options?: { cleanupConfigDir?: boolean },
  ): Promise<void>;
  restartInstance(
    userId: string,
    workspaceId: string,
    spawnConfig: CoclawSpawnConfig,
  ): Promise<CoclawProcessInfo>;
  touchInstance(userId: string, workspaceId: string): Promise<void>;
  getInstanceInfo(userId: string, workspaceId: string): CoclawProcessInfo | null;
  healthCheck(userId: string, workspaceId: string): Promise<boolean>;
  shutdownAll(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Configuration (from env)
// ---------------------------------------------------------------------------

function loadConfig(): CoclawManagerConfig {
  return {
    binaryPath: process.env.COCLAW_BINARY_PATH
      || path.resolve(process.cwd(), '..', 'coclaw', 'target', 'release', 'coclaw'),
    ttlMs: Number(process.env.COCLAW_INSTANCE_TTL_MS) || 4 * 60 * 60 * 1000, // 4 hours
    maxInstances: Number(process.env.COCLAW_MAX_INSTANCES) || 100,
    portRangeStart: Number(process.env.COCLAW_PORT_RANGE_START) || 9100,
    sweepIntervalMs: Number(process.env.COCLAW_SWEEP_INTERVAL_MS) || 60_000, // 1 min
    instancesDir: process.env.COCLAW_INSTANCES_DIR
      || path.resolve(process.cwd(), '..', 'data', 'coclaw-instances'),
  };
}

// ===========================================================================
// LOCAL MODE — Direct child_process.spawn (for development)
// ===========================================================================

class LocalCoclawManager implements ICoclawManager {
  private instances = new Map<string, CoclawProcessInfo>();
  private processes = new Map<string, ChildProcess>();
  private usedPorts = new Set<number>();
  private config: CoclawManagerConfig;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.config = loadConfig();
    process.env.COCLAW_INSTANCES_DIR = this.config.instancesDir;
    this.startSweep();
  }

  // ---- Helpers -----------------------------------------------------------

  private key(userId: string, workspaceId: string): string {
    return `${userId}:${workspaceId}`;
  }

  /** Find the next available port starting from the configured range. */
  private allocatePort(): number {
    let port = this.config.portRangeStart;
    while (this.usedPorts.has(port)) {
      port++;
    }
    this.usedPorts.add(port);
    return port;
  }

  private releasePort(port: number): void {
    this.usedPorts.delete(port);
  }

  // ---- TTL Sweep ---------------------------------------------------------

  private startSweep(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      this.sweepIdleInstances().catch((err) =>
        console.error('[CoclawManager] sweep error:', err),
      );
    }, this.config.sweepIntervalMs);
    // Allow the Node process to exit even if the timer is running.
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }

  private async sweepIdleInstances(): Promise<void> {
    const now = Date.now();
    for (const [k, info] of this.instances) {
      if (info.status !== 'RUNNING') continue;

      // Check DB for last activity timestamp
      const record = await prisma.coclawInstance.findFirst({
        where: { userId: info.userId, workspaceId: info.workspaceId },
        select: { lastActiveAt: true },
      });

      const lastActive = record?.lastActiveAt?.getTime() ?? info.startedAt.getTime();
      if (now - lastActive > this.config.ttlMs) {
        console.log(`[CoclawManager] TTL expired for ${k}, stopping`);
        await this.stopInstance(info.userId, info.workspaceId);
      }
    }
  }

  // ---- Core Lifecycle ----------------------------------------------------

  async getOrCreateInstance(
    userId: string,
    workspaceId: string,
    spawnConfig: CoclawSpawnConfig,
  ): Promise<CoclawProcessInfo> {
    const k = this.key(userId, workspaceId);

    // 1. Check in-memory map
    const existing = this.instances.get(k);
    if (existing && existing.status === 'RUNNING') {
      return existing;
    }

    // 2. Check if we're at capacity
    const runningCount = Array.from(this.instances.values())
      .filter((i) => i.status === 'RUNNING').length;
    if (runningCount >= this.config.maxInstances) {
      throw new Error(
        `Maximum Coclaw instances (${this.config.maxInstances}) reached. Try again later.`,
      );
    }

    // 3. Spawn new process
    const port = this.allocatePort();
    const channelConfigs = await prisma.coclawChannelConfig.findMany({
      where: { userId, workspaceId, enabled: true },
    });

    const channels = channelConfigs.map((channelConfig) => {
      const decryptedConfig = decryptVariable(channelConfig.config, workspaceId);
      const parsedConfig = JSON.parse(decryptedConfig) as unknown;
      return {
        channelType: channelConfig.channelType,
        config: parsedConfig && typeof parsedConfig === 'object' && !Array.isArray(parsedConfig)
          ? parsedConfig as Record<string, unknown>
          : {},
        enabled: channelConfig.enabled,
      };
    });

    const configWithPort: CoclawSpawnConfig = {
      ...spawnConfig,
      userId,
      workspaceId,
      channels,
      port,
    };
    const instanceDir = getInstanceDir(userId, workspaceId);
    await writeInstanceConfig(instanceDir, configWithPort);

    const info: CoclawProcessInfo = {
      pid: 0,
      port,
      userId,
      workspaceId,
      status: 'STARTING',
      startedAt: new Date(),
      apiKeySource: spawnConfig.apiKeySource,
      providerId: spawnConfig.provider,
    };
    this.instances.set(k, info);

    // Update DB record
    await prisma.coclawInstance.upsert({
      where: { userId_workspaceId: { userId, workspaceId } },
      create: {
        userId,
        workspaceId,
        status: 'STARTING',
        port,
        apiKeySource: spawnConfig.apiKeySource,
        providerId: spawnConfig.provider,
        startedAt: new Date(),
      },
      update: {
        status: 'STARTING',
        port,
        apiKeySource: spawnConfig.apiKeySource,
        providerId: spawnConfig.provider,
        startedAt: new Date(),
        lastError: null,
        stoppedAt: null,
      },
    });

    try {
      const child = spawn(this.config.binaryPath, [
        'daemon',
        '--config-dir', instanceDir,
        '--port', String(port),
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      if (!child.pid) {
        throw new Error('Failed to spawn Coclaw process — no PID returned');
      }

      info.pid = child.pid;
      info.status = 'RUNNING';
      this.processes.set(k, child);

      // Persist PID + status
      await prisma.coclawInstance.update({
        where: { userId_workspaceId: { userId, workspaceId } },
        data: {
          processId: child.pid,
          status: 'RUNNING',
          lastActiveAt: new Date(),
        },
      });

      // Handle unexpected exit
      child.on('exit', (code, signal) => {
        console.log(
          `[CoclawManager] Process ${k} exited (code=${code}, signal=${signal})`,
        );
        this.handleProcessExit(userId, workspaceId, code, signal);
      });

      // Log stderr for debugging
      child.stderr?.on('data', (data: Buffer) => {
        console.error(`[Coclaw:${k}] ${data.toString().trim()}`);
      });

      return info;
    } catch (err) {
      // Clean up on spawn failure
      this.releasePort(port);
      this.instances.delete(k);

      const errorMessage = err instanceof Error ? err.message : String(err);
      await prisma.coclawInstance.update({
        where: { userId_workspaceId: { userId, workspaceId } },
        data: { status: 'ERROR', lastError: errorMessage, stoppedAt: new Date() },
      });
      throw err;
    }
  }

  /** Gracefully stop a Coclaw instance. SIGTERM first, SIGKILL after 5s. */
  async stopInstance(
    userId: string,
    workspaceId: string,
    options?: { cleanupConfigDir?: boolean },
  ): Promise<void> {
    const k = this.key(userId, workspaceId);
    const child = this.processes.get(k);
    const info = this.instances.get(k);
    const instanceDir = getInstanceDir(userId, workspaceId);

    if (!child || !info) {
      if (options?.cleanupConfigDir) {
        await fs.rm(instanceDir, { recursive: true, force: true }).catch(() => {
          /* best-effort cleanup */
        });
      }
      return;
    }

    info.status = 'STOPPING';
    await prisma.coclawInstance.update({
      where: { userId_workspaceId: { userId, workspaceId } },
      data: { status: 'STOPPING' },
    }).catch(() => { /* DB write is best-effort during shutdown */ });

    return new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already dead */ }
      }, 5000);

      child.once('exit', async () => {
        clearTimeout(killTimer);
        this.cleanup(userId, workspaceId, 'STOPPED');
        if (options?.cleanupConfigDir) {
          await fs.rm(instanceDir, { recursive: true, force: true }).catch(() => {
            /* best-effort cleanup */
          });
        }
        resolve();
      });

      try { child.kill('SIGTERM'); } catch { /* already dead */ }
    });
  }

  async restartInstance(
    userId: string,
    workspaceId: string,
    spawnConfig: CoclawSpawnConfig,
  ): Promise<CoclawProcessInfo> {
    await this.stopInstance(userId, workspaceId, { cleanupConfigDir: true });
    return this.getOrCreateInstance(userId, workspaceId, spawnConfig);
  }

  /** Update lastActiveAt — call on each user message. */
  async touchInstance(userId: string, workspaceId: string): Promise<void> {
    await prisma.coclawInstance.update({
      where: { userId_workspaceId: { userId, workspaceId } },
      data: { lastActiveAt: new Date() },
    }).catch(() => { /* best-effort */ });
  }

  /** Get the current status of a user's instance. */
  getInstanceInfo(userId: string, workspaceId: string): CoclawProcessInfo | null {
    return this.instances.get(this.key(userId, workspaceId)) ?? null;
  }

  /** Health check — attempt a TCP connect to the instance port. */
  async healthCheck(userId: string, workspaceId: string): Promise<boolean> {
    const info = this.instances.get(this.key(userId, workspaceId));
    if (!info || info.status !== 'RUNNING') return false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`http://127.0.0.1:${info.port}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Stop all running instances (for server shutdown). */
  async shutdownAll(): Promise<void> {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }

    const stops = Array.from(this.instances.values())
      .filter((i) => i.status === 'RUNNING' || i.status === 'STARTING')
      .map((i) => this.stopInstance(i.userId, i.workspaceId));

    await Promise.allSettled(stops);
  }

  // ---- Internal ----------------------------------------------------------

  private handleProcessExit(
    userId: string,
    workspaceId: string,
    code: number | null,
    signal: string | null,
  ): void {
    const wasRunning =
      this.instances.get(this.key(userId, workspaceId))?.status === 'RUNNING';

    const errorMsg = wasRunning
      ? `Process exited unexpectedly (code=${code}, signal=${signal})`
      : null;

    this.cleanup(
      userId,
      workspaceId,
      wasRunning ? 'ERROR' : 'STOPPED',
      errorMsg,
    );
  }

  private cleanup(
    userId: string,
    workspaceId: string,
    status: 'STOPPED' | 'ERROR',
    errorMessage?: string | null,
  ): void {
    const k = this.key(userId, workspaceId);
    const info = this.instances.get(k);

    if (info) {
      this.releasePort(info.port);
    }

    this.instances.delete(k);
    this.processes.delete(k);

    prisma.coclawInstance.update({
      where: { userId_workspaceId: { userId, workspaceId } },
      data: {
        status,
        lastError: errorMessage ?? undefined,
        stoppedAt: new Date(),
        processId: null,
        port: null,
      },
    }).catch((err) =>
      console.error('[CoclawManager] cleanup DB update failed:', err),
    );
  }
}

// ===========================================================================
// REMOTE MODE — HTTP client to coclaw-manager service (Docker Swarm)
// ===========================================================================

class RemoteCoclawManager implements ICoclawManager {
  private managerUrl: string;
  private authToken: string;

  // Local cache of instance info for synchronous getInstanceInfo() calls
  private infoCache = new Map<string, CoclawProcessInfo>();

  constructor(managerUrl: string, authToken: string) {
    // Strip trailing slash
    this.managerUrl = managerUrl.replace(/\/+$/, '');
    this.authToken = authToken;
  }

  private key(userId: string, workspaceId: string): string {
    return `${userId}:${workspaceId}`;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) {
      h['Authorization'] = `Bearer ${this.authToken}`;
    }
    return h;
  }

  /** Convert remote InstanceInfo (ISO date strings) to CoclawProcessInfo (Date objects). */
  private toProcessInfo(remote: {
    pid: number;
    port: number;
    userId: string;
    workspaceId: string;
    status: string;
    startedAt: string;
    apiKeySource: 'user' | 'system';
    providerId: string;
  }): CoclawProcessInfo {
    return {
      pid: remote.pid,
      port: remote.port,
      userId: remote.userId,
      workspaceId: remote.workspaceId,
      status: remote.status as CoclawProcessInfo['status'],
      startedAt: new Date(remote.startedAt),
      apiKeySource: remote.apiKeySource,
      providerId: remote.providerId,
    };
  }

  async getOrCreateInstance(
    userId: string,
    workspaceId: string,
    spawnConfig: CoclawSpawnConfig,
  ): Promise<CoclawProcessInfo> {
    // Load channel configs (same as local — decrypt from DB)
    const channelConfigs = await prisma.coclawChannelConfig.findMany({
      where: { userId, workspaceId, enabled: true },
    });

    const channels = channelConfigs.map((channelConfig) => {
      const decryptedConfig = decryptVariable(channelConfig.config, workspaceId);
      const parsedConfig = JSON.parse(decryptedConfig) as unknown;
      return {
        channelType: channelConfig.channelType,
        config: parsedConfig && typeof parsedConfig === 'object' && !Array.isArray(parsedConfig)
          ? parsedConfig as Record<string, unknown>
          : {},
        enabled: channelConfig.enabled,
      };
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(`${this.managerUrl}/api/instances`, {
        method: 'POST',
        headers: this.headers(),
        signal: controller.signal,
        body: JSON.stringify({
          userId,
          workspaceId,
          config: {
            provider: spawnConfig.provider,
            apiKey: spawnConfig.apiKey,
            apiKeySource: spawnConfig.apiKeySource,
            model: spawnConfig.model,
            collabApiUrl: spawnConfig.collabApiUrl,
            mcpToken: spawnConfig.mcpToken,
            userId: spawnConfig.userId,
            workspaceId: spawnConfig.workspaceId,
            memoryBackend: spawnConfig.memoryBackend,
            qdrantUrl: spawnConfig.qdrantUrl || process.env.QDRANT_URL || '',
            qdrantCollection: spawnConfig.qdrantCollection,
            embeddingProvider: spawnConfig.embeddingProvider,
            embeddingModel: spawnConfig.embeddingModel,
            embeddingDimensions: spawnConfig.embeddingDimensions,
            channels,
            githubToken: spawnConfig.githubToken,
            githubDefaultOwner: spawnConfig.githubDefaultOwner,
            githubDefaultRepo: spawnConfig.githubDefaultRepo,
          },
        }),
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(
          `coclaw-manager returned ${res.status}: ${(body as { error?: string }).error || 'Unknown error'}`,
        );
      }

      const data = await res.json() as { instance: {
        pid: number; port: number; userId: string; workspaceId: string;
        status: string; startedAt: string; apiKeySource: 'user' | 'system'; providerId: string;
      }};
      const info = this.toProcessInfo(data.instance);

      // Update local cache + DB
      this.infoCache.set(this.key(userId, workspaceId), info);
      await prisma.coclawInstance.upsert({
        where: { userId_workspaceId: { userId, workspaceId } },
        create: {
          userId,
          workspaceId,
          status: info.status,
          port: info.port,
          processId: info.pid,
          apiKeySource: spawnConfig.apiKeySource,
          providerId: spawnConfig.provider,
          startedAt: info.startedAt,
          lastActiveAt: new Date(),
        },
        update: {
          status: info.status,
          port: info.port,
          processId: info.pid,
          apiKeySource: spawnConfig.apiKeySource,
          providerId: spawnConfig.provider,
          startedAt: info.startedAt,
          lastActiveAt: new Date(),
          lastError: null,
          stoppedAt: null,
        },
      });

      return info;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  async stopInstance(
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await fetch(
        `${this.managerUrl}/api/instances/${encodeURIComponent(userId)}/${encodeURIComponent(workspaceId)}`,
        {
          method: 'DELETE',
          headers: this.headers(),
          signal: controller.signal,
        },
      );
      clearTimeout(timeout);

      if (!res.ok && res.status !== 404) {
        console.error(`[CoclawManager:remote] Stop failed: ${res.status}`);
      }
    } catch (err) {
      clearTimeout(timeout);
      console.error('[CoclawManager:remote] Stop error:', err);
    }

    // Update local state
    this.infoCache.delete(this.key(userId, workspaceId));
    await prisma.coclawInstance.update({
      where: { userId_workspaceId: { userId, workspaceId } },
      data: { status: 'STOPPED', stoppedAt: new Date(), processId: null, port: null },
    }).catch(() => { /* best-effort */ });
  }

  async restartInstance(
    userId: string,
    workspaceId: string,
    spawnConfig: CoclawSpawnConfig,
  ): Promise<CoclawProcessInfo> {
    await this.stopInstance(userId, workspaceId);
    return this.getOrCreateInstance(userId, workspaceId, spawnConfig);
  }

  async touchInstance(userId: string, workspaceId: string): Promise<void> {
    // Touch the remote manager's TTL
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    try {
      await fetch(
        `${this.managerUrl}/api/instances/${encodeURIComponent(userId)}/${encodeURIComponent(workspaceId)}/touch`,
        {
          method: 'POST',
          headers: this.headers(),
          signal: controller.signal,
        },
      );
    } catch {
      // Best-effort
    } finally {
      clearTimeout(timeout);
    }

    // Also update Collab DB
    await prisma.coclawInstance.update({
      where: { userId_workspaceId: { userId, workspaceId } },
      data: { lastActiveAt: new Date() },
    }).catch(() => { /* best-effort */ });
  }

  /**
   * Synchronous info lookup — returns cached data from last getOrCreate.
   * For remote mode, callers needing fresh data should use the async
   * status endpoint instead.
   */
  getInstanceInfo(userId: string, workspaceId: string): CoclawProcessInfo | null {
    return this.infoCache.get(this.key(userId, workspaceId)) ?? null;
  }

  async healthCheck(userId: string, workspaceId: string): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    try {
      const res = await fetch(
        `${this.managerUrl}/api/instances/${encodeURIComponent(userId)}/${encodeURIComponent(workspaceId)}/gateway-status`,
        {
          method: 'GET',
          headers: this.headers(),
          signal: controller.signal,
        },
      );
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json() as { healthy?: boolean };
        return data.healthy === true;
      }
      return false;
    } catch {
      clearTimeout(timeout);
      return false;
    }
  }

  /** In remote mode, shutdownAll is a no-op (manager handles its own lifecycle). */
  async shutdownAll(): Promise<void> {
    this.infoCache.clear();
  }
}

// ---------------------------------------------------------------------------
// Singleton Export — auto-selects local vs remote mode
// ---------------------------------------------------------------------------

const globalForCoclaw = global as unknown as {
  coclawManager?: ICoclawManager;
};

function createManager(): ICoclawManager {
  const remoteUrl = process.env.COCLAW_MANAGER_URL;
  if (remoteUrl) {
    const token = process.env.COCLAW_MANAGER_TOKEN || '';
    console.log(`[CoclawManager] Remote mode → ${remoteUrl}`);
    return new RemoteCoclawManager(remoteUrl, token);
  }
  console.log('[CoclawManager] Local mode → child_process.spawn');
  return new LocalCoclawManager();
}

export const coclawManager: ICoclawManager =
  globalForCoclaw.coclawManager || createManager();

if (process.env.NODE_ENV !== 'production') {
  globalForCoclaw.coclawManager = coclawManager;
}
