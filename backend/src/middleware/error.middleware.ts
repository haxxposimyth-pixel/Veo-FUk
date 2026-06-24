import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { ZodError } from 'zod';
import { StructuredOutputError } from '../utils/structured-output.error';

export function errorMiddleware(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log the exception stack trace
  logger.error(`${req.method} ${req.url} - Error: ${err.message}`, {
    stack: err.stack,
    details: err.details,
  });

  // Handle StructuredOutputError
  if (err instanceof StructuredOutputError) {
    res.status(422).json({
      success: false,
      error: 'The AI returned an invalid response after 2 attempts. Try regenerating or switching to a more capable model in AI Settings.',
      code: 'STRUCTURED_OUTPUT_ERROR',
      details: err.zodIssues,
    });
    return;
  }

  // Handle Zod Schema Validation Errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Schema validation failed.',
      code: 'VALIDATION_ERROR',
      details: err.errors,
    });
    return;
  }

  // Handle SQLite specific issues
  if (err.code && err.code.startsWith('SQLITE_')) {
    res.status(500).json({
      success: false,
      error: 'A database constraint or connection error occurred.',
      code: 'DATABASE_ERROR',
      details: err.message,
    });
    return;
  }

  // Handle Gemini specific API Key auth failures
  if (err.message && (err.message.includes('API key') || err.message.includes('key is not valid'))) {
    res.status(401).json({
      success: false,
      error: 'Gemini Authentication failed. Please verify your API Key in Settings.',
      code: 'AUTHENTICATION_FAILED',
    });
    return;
  }

  // Handle Gemini Rate Limits
  if (err.message && (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED'))) {
    res.status(429).json({
      success: false,
      error: 'Gemini API quota exceeded. Please check settings or wait before retrying.',
      code: 'RATE_LIMIT_EXCEEDED',
    });
    return;
  }

  // Default server errors
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: err.message || 'An unexpected internal server error occurred.',
    code: err.code || 'INTERNAL_SERVER_ERROR',
  });
}
