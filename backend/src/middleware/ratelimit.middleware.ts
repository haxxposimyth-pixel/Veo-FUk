import { Request, Response, NextFunction } from 'express';

interface ClientLimitData {
  count: number;
  firstRequestTime: number;
}

const ipCache = new Map<string, ClientLimitData>();

/**
 * A lightweight in-memory API rate limiter.
 * Blocks requests from IPs that exceed the request limit count per windowMs duration.
 */
export function rateLimit(limit = 5000, windowMs = 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    
    // Resolve single string IP if list returned from proxy header
    const resolvedIp = Array.isArray(ip) ? ip[0] : (ip as string).split(',')[0].trim();

    const clientData = ipCache.get(resolvedIp);

    if (!clientData) {
      ipCache.set(resolvedIp, { count: 1, firstRequestTime: now });
      next();
      return;
    }

    // Reset window limit if time elapsed
    if (now - clientData.firstRequestTime > windowMs) {
      ipCache.set(resolvedIp, { count: 1, firstRequestTime: now });
      next();
      return;
    }

    // Block request if quota exceeded
    if (clientData.count >= limit) {
      res.status(429).json({
        success: false,
        error: 'Too many requests. Please wait a moment before trying again.',
        code: 'API_RATE_LIMIT_EXCEEDED',
      });
      return;
    }

    clientData.count++;
    next();
  };
}
