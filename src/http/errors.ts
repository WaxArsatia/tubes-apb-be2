import type { Context } from 'hono'
import { ZodError } from 'zod'

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE_ENTITY'
  | 'INTERNAL_ERROR'

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message)
  }
}

export function errorBody(code: ErrorCode, message: string, details?: unknown) {
  return { error: { code, message, ...(details ? { details } : {}) } }
}

export function handleError(error: Error, c: Context) {
  if (error instanceof AppError) {
    return c.json(errorBody(error.code, error.message, error.details), error.status as never)
  }

  if (error instanceof ZodError) {
    return c.json(errorBody('VALIDATION_ERROR', 'Validation failed', error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }))), 400)
  }

  console.error(error)
  return c.json(errorBody('INTERNAL_ERROR', 'Internal server error'), 500)
}
