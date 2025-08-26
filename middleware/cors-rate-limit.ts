import { NextApiRequest, NextApiResponse } from 'next';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import cors from 'cors';
 
// Rate limiter configurations
const rateLimiters = {
  // General API rate limit
  api: new RateLimiterMemory({
    keyGenerator: (req: NextApiRequest) => {
      const forwardedFor = req.headers['x-forwarded-for'];
      return (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) || req.connection.remoteAddress || 'unknown';
    },
    points: 100, // Number of requests
    duration: 60, // Per 60 seconds
  } as any),
  
  // AI generation rate limit (more restrictive)
  ai: new RateLimiterMemory({
    keyGenerator: (req: NextApiRequest) => {
      const forwardedFor = req.headers['x-forwarded-for'];
      return (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) || req.connection.remoteAddress || 'unknown';
    },
    points: 10, // Number of AI requests
    duration: 60, // Per 60 seconds
  } as any),
  
  // Site creation rate limit
  siteCreation: new RateLimiterMemory({
    keyGenerator: (req: NextApiRequest) => {
      const forwardedFor = req.headers['x-forwarded-for'];
      return (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) || req.connection.remoteAddress || 'unknown';
    },
    points: 5, // Number of sites
    duration: 300, // Per 5 minutes
  } as any)
};

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
    : true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
};

const corsMiddleware = cors(corsOptions);

/**
 * Apply CORS middleware
 */
export function applyCors(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    corsMiddleware(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve();
    });
  });
}

/**
 * Apply rate limiting
 */
export async function applyRateLimit(
  req: NextApiRequest, 
  res: NextApiResponse, 
  type: 'api' | 'ai' | 'siteCreation' = 'api'
): Promise<boolean> {
  try {
    await rateLimiters[type].consume(
      (Array.isArray(req.headers['x-forwarded-for']) ? req.headers['x-forwarded-for'][0] : req.headers['x-forwarded-for']) || req.connection.remoteAddress || 'unknown'
    );
    return true;
  } catch (rateLimiterRes) {
    const remainingPoints = rateLimiterRes?.remainingPoints || 0;
    const msBeforeNext = rateLimiterRes?.msBeforeNext || 0;
    
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      retryAfter: Math.round(msBeforeNext / 1000) || 1,
      remainingPoints
    });
    
    return false;
  }
}

/**
 * Validate request body
 */
export function validateRequestBody(req: NextApiRequest, requiredFields: string[]): { isValid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  for (const field of requiredFields) {
    if (!req.body || req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
      missing.push(field);
    }
  }
  
  return {
    isValid: missing.length === 0,
    missing
  };
}

/**
 * Sanitize input strings
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  
  // Remove potential XSS and injection attempts
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

/**
 * Validate site name
 */
export function validateSiteName(name: string): { isValid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { isValid: false, error: 'Site name is required' };
  }
  
  // Check length
  if (name.length < 3 || name.length > 50) {
    return { isValid: false, error: 'Site name must be between 3 and 50 characters' };
  }
  
  // Check format (alphanumeric, hyphens, underscores only)
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return { isValid: false, error: 'Site name can only contain letters, numbers, hyphens, and underscores' };
  }
  
  // Check for reserved names
  const reservedNames = ['api', 'admin', 'www', 'mail', 'ftp', 'localhost', 'example'];
  if (reservedNames.includes(name.toLowerCase())) {
    return { isValid: false, error: 'Site name is reserved' };
  }
  
  return { isValid: true };
}

/**
 * Security headers middleware
 */
export function setSecurityHeaders(res: NextApiResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

/**
 * Combined security middleware
 */
export async function applySecurityMiddleware(
  req: NextApiRequest,
  res: NextApiResponse,
  options: {
    rateLimitType?: 'api' | 'ai' | 'siteCreation';
    requiredFields?: string[];
    skipCors?: boolean;
  } = {}
): Promise<boolean> {
  const { rateLimitType = 'api', requiredFields = [], skipCors = false } = options;
  
  try {
    // Apply security headers
    setSecurityHeaders(res);
    
    // Apply CORS
    if (!skipCors) {
      await applyCors(req, res);
    }
    
    // Apply rate limiting
    const rateLimitPassed = await applyRateLimit(req, res, rateLimitType);
    if (!rateLimitPassed) {
      return false;
    }
    
    // Validate required fields for POST/PUT requests
    if ((req.method === 'POST' || req.method === 'PUT') && requiredFields.length > 0) {
      const validation = validateRequestBody(req, requiredFields);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields',
          missing: validation.missing
        });
        return false;
      }
    }
    
    return true;
  } catch (error: any) {
    console.error('Security middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal security error'
    });
    return false;
  }
}