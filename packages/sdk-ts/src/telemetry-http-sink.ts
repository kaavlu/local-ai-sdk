import type { TelemetryEvent, TelemetrySink } from './embeddings-runtime.js'

export interface HttpTelemetrySinkOptions {
  endpointUrl: string
  apiKey?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  headers?: Record<string, string>
  maxQueueSize?: number
  maxRetries?: number
  retryBaseDelayMs?: number
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('endpointUrl is required for createHttpTelemetrySink')
  }
  return trimmed
}

function createHeaders(
  apiKey: string | undefined,
  extraHeaders: Record<string, string> | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    ...(extraHeaders ?? {}),
  }
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`
  }
  return headers
}

/**
 * Best-effort HTTP telemetry sink for SDK runtime execution events.
 * Failures are intentionally swallowed to avoid influencing local/cloud decisions.
 */
export function createHttpTelemetrySink(options: HttpTelemetrySinkOptions): TelemetrySink {
  const endpointUrl = normalizeBaseUrl(options.endpointUrl)
  const timeoutMs = Math.max(100, options.timeoutMs ?? 2_000)
  const fetchImpl = options.fetchImpl ?? fetch
  const headers = createHeaders(options.apiKey, options.headers)
  const maxQueueSize = Math.max(1, options.maxQueueSize ?? 100)
  const maxRetries = Math.max(0, options.maxRetries ?? 2)
  const retryBaseDelayMs = Math.max(10, options.retryBaseDelayMs ?? 150)

  const queue: Array<{ event: TelemetryEvent; attempt: number }> = []
  let draining = false

  const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, ms)
    })

  const send = async (event: TelemetryEvent): Promise<void> => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      await fetchImpl(endpointUrl, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          eventType: event.eventType,
          projectId: event.projectId,
          useCase: event.useCase,
          decision: event.decision,
          reason: event.reason,
          reasonCategory: event.reasonCategory,
          durationMs: event.durationMs,
          fallbackInvoked: event.fallbackInvoked,
          itemCount: event.itemCount,
          successCount: event.successCount,
          failureCount: event.failureCount,
          endpoint: '/sdk/embeddings',
          status: 'success',
        }),
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  const drain = async (): Promise<void> => {
    if (draining) {
      return
    }
    draining = true
    try {
      while (queue.length > 0) {
        const next = queue.shift()
        if (!next) {
          break
        }
        try {
          await send(next.event)
        } catch {
          if (next.attempt < maxRetries) {
            queue.push({
              event: next.event,
              attempt: next.attempt + 1,
            })
            await delay(retryBaseDelayMs * 2 ** next.attempt)
          }
        }
      }
    } finally {
      draining = false
      if (queue.length > 0) {
        void drain()
      }
    }
  }

  return async (event: TelemetryEvent) => {
    if (queue.length >= maxQueueSize) {
      // Bounded queue by design: drop newest when queue is full.
      return
    }
    queue.push({ event, attempt: 0 })
    void drain()
  }
}
