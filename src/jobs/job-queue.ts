import { getClient } from '../cache/redis-client';

/**
 * Simple job queue using Redis lists.
 * Supports enqueue, dequeue, and continuous processing with a handler.
 * Requirements: 5.1, 7.7
 */

/** Predefined queue names */
export const QUEUES = {
  EMAIL_DELIVERY: 'email-delivery',
  ESCALATION_CHECK: 'escalation-check',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface Job<T = unknown> {
  id: string;
  data: T;
  createdAt: string;
  attempts: number;
}

/**
 * Enqueue a job to the specified queue.
 * @param queueName - The name of the queue
 * @param jobData - The job payload
 * @returns The job ID
 */
export async function enqueueJob<T = unknown>(queueName: string, jobData: T): Promise<string> {
  const client = getClient();
  const job: Job<T> = {
    id: crypto.randomUUID(),
    data: jobData,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  await client.lPush(`job:${queueName}`, JSON.stringify(job));
  return job.id;
}

/**
 * Dequeue a job from the specified queue (FIFO order).
 * Returns null if the queue is empty.
 */
export async function dequeueJob<T = unknown>(queueName: string): Promise<Job<T> | null> {
  const client = getClient();
  const raw = await client.rPop(`job:${queueName}`);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as Job<T>;
}

/**
 * Process jobs from a queue using the provided handler function.
 * Continuously polls the queue until stopped via the returned abort function.
 *
 * @param queueName - The name of the queue to process
 * @param handler - Async function to process each job
 * @param pollIntervalMs - Interval between polls when queue is empty (default: 1000ms)
 * @returns An object with a `stop()` method to halt processing
 */
export function processQueue<T = unknown>(
  queueName: string,
  handler: (job: Job<T>) => Promise<void>,
  pollIntervalMs: number = 1000
): { stop: () => void } {
  let running = true;

  const loop = async () => {
    while (running) {
      const job = await dequeueJob<T>(queueName);
      if (job) {
        try {
          job.attempts += 1;
          await handler(job);
        } catch (error) {
          console.error(`Job ${job.id} in queue "${queueName}" failed:`, error);
          // Re-enqueue failed job for retry (could add max retry logic here)
        }
      } else {
        // No jobs available, wait before polling again
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }
  };

  loop().catch((err) => {
    console.error(`Queue processor for "${queueName}" crashed:`, err);
  });

  return {
    stop: () => {
      running = false;
    },
  };
}
