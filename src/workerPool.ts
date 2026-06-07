export type WorkerPoolMode = "sync-fallback";

export type WorkerPoolStats = {
  readonly mode: WorkerPoolMode;
  readonly maxWorkers: number;
  readonly queuedJobs: number;
  readonly runningJobs: number;
  readonly completedJobs: number;
  readonly canceledJobs: number;
  readonly staleJobs: number;
  readonly failedJobs: number;
  readonly transferredBuffers: number;
  readonly averageWorkerTimeMs: number;
  readonly averageMainThreadUploadMs: number;
};

export type WorkerPoolJobResult<TResult> =
  | {
    readonly status: "completed";
    readonly id: number;
    readonly type: string;
    readonly revision: number;
    readonly result: TResult;
    readonly workerTimeMs: number;
  }
  | {
    readonly status: "canceled" | "stale";
    readonly id: number;
    readonly type: string;
    readonly revision: number;
    readonly workerTimeMs: number;
  }
  | {
    readonly status: "failed";
    readonly id: number;
    readonly type: string;
    readonly revision: number;
    readonly error: unknown;
    readonly workerTimeMs: number;
  };

export type WorkerPoolSyncHandler<TPayload, TResult> = (payload: TPayload) => TResult | Promise<TResult>;

export type WorkerPoolJobRequest<TPayload, TResult> = {
  readonly type: string;
  readonly payload: TPayload;
  readonly revision?: number;
  readonly transfer?: readonly Transferable[];
  readonly isRevisionStale?: (revision: number) => boolean;
  readonly run?: WorkerPoolSyncHandler<TPayload, TResult>;
};

export type WorkerPoolJobHandle<TResult> = {
  readonly id: number;
  readonly promise: Promise<WorkerPoolJobResult<TResult>>;
};

type QueuedWorkerPoolJob<TPayload, TResult> = {
  readonly id: number;
  readonly type: string;
  readonly payload: TPayload;
  readonly revision: number;
  readonly isRevisionStale: (revision: number) => boolean;
  readonly run: WorkerPoolSyncHandler<TPayload, TResult>;
  readonly resolve: (result: WorkerPoolJobResult<TResult>) => void;
};

type WorkerPoolOptions = {
  readonly maxWorkers?: number;
  readonly hardwareConcurrency?: number;
  readonly getNow?: () => number;
};

export class WorkerPool {
  private readonly maxWorkers: number;
  private readonly getNow: () => number;
  private readonly syncHandlers = new Map<string, WorkerPoolSyncHandler<unknown, unknown>>();
  private readonly queue: QueuedWorkerPoolJob<unknown, unknown>[] = [];
  private readonly canceledJobIds = new Set<number>();
  private nextJobId = 1;
  private runningJobs = 0;
  private completedJobs = 0;
  private canceledJobs = 0;
  private staleJobs = 0;
  private failedJobs = 0;
  private transferredBuffers = 0;
  private totalWorkerTimeMs = 0;
  private totalUploadTimeMs = 0;
  private uploadSamples = 0;

  constructor(options: WorkerPoolOptions = {}) {
    this.maxWorkers = normalizeWorkerPoolSize(
      options.maxWorkers ?? getDefaultWorkerPoolSize(options.hardwareConcurrency)
    );
    this.getNow = options.getNow ?? readMonotonicTimeMs;
  }

  registerSyncHandler<TPayload, TResult>(
    type: string,
    handler: WorkerPoolSyncHandler<TPayload, TResult>
  ): void {
    this.syncHandlers.set(type, handler as WorkerPoolSyncHandler<unknown, unknown>);
  }

  enqueue<TPayload, TResult>(
    request: WorkerPoolJobRequest<TPayload, TResult>
  ): WorkerPoolJobHandle<TResult> {
    const handler = request.run ?? this.syncHandlers.get(request.type);
    if (!handler) {
      throw new Error(`WorkerPool has no sync fallback handler for job type "${request.type}".`);
    }

    const id = this.nextJobId;
    this.nextJobId += 1;
    this.transferredBuffers += request.transfer?.length ?? 0;

    const promise = new Promise<WorkerPoolJobResult<TResult>>((resolve) => {
      this.queue.push({
        id,
        type: request.type,
        payload: request.payload,
        revision: request.revision ?? 0,
        isRevisionStale: request.isRevisionStale ?? (() => false),
        run: handler as WorkerPoolSyncHandler<TPayload, TResult>,
        resolve
      } as QueuedWorkerPoolJob<unknown, unknown>);
    });
    this.drainQueue();
    return { id, promise };
  }

  cancel(id: number): boolean {
    if (this.canceledJobIds.has(id)) return false;

    const queuedIndex = this.queue.findIndex((job) => job.id === id);
    if (queuedIndex >= 0) {
      const [job] = this.queue.splice(queuedIndex, 1);
      this.canceledJobs += 1;
      job.resolve({
        status: "canceled",
        id: job.id,
        type: job.type,
        revision: job.revision,
        workerTimeMs: 0
      });
      return true;
    }

    this.canceledJobIds.add(id);
    return true;
  }

  recordMainThreadUpload(durationMs: number): void {
    const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    this.totalUploadTimeMs += safeDuration;
    this.uploadSamples += 1;
  }

  getStats(): WorkerPoolStats {
    return {
      mode: "sync-fallback",
      maxWorkers: this.maxWorkers,
      queuedJobs: this.queue.length,
      runningJobs: this.runningJobs,
      completedJobs: this.completedJobs,
      canceledJobs: this.canceledJobs,
      staleJobs: this.staleJobs,
      failedJobs: this.failedJobs,
      transferredBuffers: this.transferredBuffers,
      averageWorkerTimeMs: this.completedJobs > 0 ? this.totalWorkerTimeMs / this.completedJobs : 0,
      averageMainThreadUploadMs: this.uploadSamples > 0 ? this.totalUploadTimeMs / this.uploadSamples : 0
    };
  }

  private drainQueue(): void {
    while (this.runningJobs < this.maxWorkers && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) return;
      this.runJob(job);
    }
  }

  private runJob(job: QueuedWorkerPoolJob<unknown, unknown>): void {
    this.runningJobs += 1;

    Promise.resolve().then(async () => {
      const startedAt = this.getNow();
      try {
        if (this.canceledJobIds.delete(job.id)) {
          return this.createCanceledResult(job, this.getNow() - startedAt);
        }

        const result = await job.run(job.payload);
        const workerTimeMs = this.getNow() - startedAt;
        if (this.canceledJobIds.delete(job.id)) {
          return this.createCanceledResult(job, workerTimeMs);
        }
        if (job.isRevisionStale(job.revision)) {
          this.staleJobs += 1;
          return {
            status: "stale",
            id: job.id,
            type: job.type,
            revision: job.revision,
            workerTimeMs
          } satisfies WorkerPoolJobResult<unknown>;
        }

        this.completedJobs += 1;
        this.totalWorkerTimeMs += workerTimeMs;
        return {
          status: "completed",
          id: job.id,
          type: job.type,
          revision: job.revision,
          result,
          workerTimeMs
        } satisfies WorkerPoolJobResult<unknown>;
      } catch (error) {
        const workerTimeMs = this.getNow() - startedAt;
        this.failedJobs += 1;
        return {
          status: "failed",
          id: job.id,
          type: job.type,
          revision: job.revision,
          error,
          workerTimeMs
        } satisfies WorkerPoolJobResult<unknown>;
      }
    }).then((result) => {
      this.runningJobs -= 1;
      job.resolve(result);
      this.drainQueue();
    });
  }

  private createCanceledResult(
    job: QueuedWorkerPoolJob<unknown, unknown>,
    workerTimeMs: number
  ): WorkerPoolJobResult<unknown> {
    this.canceledJobs += 1;
    return {
      status: "canceled",
      id: job.id,
      type: job.type,
      revision: job.revision,
      workerTimeMs
    };
  }
}

export function getDefaultWorkerPoolSize(hardwareConcurrency = readHardwareConcurrency()): number {
  const availableCores = Number.isFinite(hardwareConcurrency)
    ? Math.max(1, Math.floor(hardwareConcurrency))
    : 2;
  return normalizeWorkerPoolSize(availableCores - 1);
}

export function normalizeWorkerPoolSize(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(4, Math.floor(value)));
}

function readHardwareConcurrency(): number {
  if (typeof navigator === "undefined") return 2;
  return navigator.hardwareConcurrency;
}

function readMonotonicTimeMs(): number {
  if (typeof performance === "undefined") return Date.now();
  return performance.now();
}
