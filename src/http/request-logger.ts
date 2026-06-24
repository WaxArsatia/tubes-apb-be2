import type { MiddlewareHandler } from 'hono'

type RequestLogEvent = {
  level: 'info'
  event: 'request.started' | 'request.completed'
  requestId: string
  method: string
  path: string
  status?: number
  durationMs?: number
}

const requestIdHeader = 'x-request-id'

function getRequestId(request: Request) {
  return request.headers.get(requestIdHeader) || crypto.randomUUID()
}

function writeLog(event: RequestLogEvent) {
  console.info(JSON.stringify(event))
}

export function requestLogger(): MiddlewareHandler {
  return async (c, next) => {
    const requestId = getRequestId(c.req.raw)
    const method = c.req.method
    const path = c.req.path
    const startedAt = performance.now()

    c.header(requestIdHeader, requestId)
    writeLog({
      level: 'info',
      event: 'request.started',
      requestId,
      method,
      path,
    })

    await next()

    c.header(requestIdHeader, requestId)
    writeLog({
      level: 'info',
      event: 'request.completed',
      requestId,
      method,
      path,
      status: c.res.status,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    })
  }
}
