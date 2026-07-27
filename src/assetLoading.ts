export interface RetryOptions {
  /** Total attempts, including the first call. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Retry a transient operation with capped exponential backoff and light jitter. */
export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 4,
    baseDelayMs = 250,
    maxDelayMs = 2_000,
    shouldRetry = () => true,
    sleep = defaultSleep,
    random = Math.random,
  } = options;

  if (!Number.isInteger(attempts) || attempts < 1)
    throw new RangeError("attempts must be a positive integer");

  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !shouldRetry(error)) throw error;
      const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = 0.8 + random() * 0.4;
      await sleep(Math.round(exponential * jitter));
    }
  }
}

/** Map a list while keeping no more than `limit` operations in flight. */
export async function mapConcurrent<T, R>(
  values: readonly T[],
  limit: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1)
    throw new RangeError("limit must be a positive integer");

  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await operation(values[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );
  return results;
}

export class AssetHttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    readonly statusText: string,
  ) {
    super(`failed to load ${url}: ${status}${statusText ? ` ${statusText}` : ""}`);
    this.name = "AssetHttpError";
  }
}

const isTransientFetchError = (error: unknown) =>
  error instanceof AssetHttpError
    ? error.status === 408
      || error.status === 425
      || error.status === 429
      || error.status >= 500
    : error instanceof TypeError;

/** Fetch startup JSON, retrying network errors and retryable HTTP responses only. */
export async function fetchJson<T>(url: string): Promise<T> {
  return retry(async () => {
    const response = await fetch(url);
    if (!response.ok)
      throw new AssetHttpError(url, response.status, response.statusText);
    return response.json() as Promise<T>;
  }, { shouldRetry: isTransientFetchError });
}
