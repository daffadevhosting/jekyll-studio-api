import { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import { promisify } from 'util';
 
const execAsync = promisify(exec);

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  services: {
    api: 'running' | 'error';
    jekyll: 'running' | 'error' | 'unknown';
    redis?: 'connected' | 'disconnected' | 'unknown';
    database?: 'connected' | 'disconnected' | 'unknown';
  };
  system: {
    memory: {
      used: number;
      free: number;
      total: number;
    };
    disk: {
      used: number;
      available: number;
    };
  };
  version?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<HealthStatus | { error: string }>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const startTime = Date.now();
    const services: HealthStatus['services'] = {
      api: 'running',
      jekyll: 'unknown'
    };

    // Check Jekyll container
    try {
      await execAsync('docker-compose ps jekyll', { timeout: 5000 });
      services.jekyll = 'running';
    } catch (error: any) {
      services.jekyll = 'error';
    }

    // Check Redis (if configured)
    if (process.env.REDIS_URL || process.env.REDIS_HOST) {
      try {
        // Simple Redis ping check
        const redis = require('redis');
        const client = redis.createClient({
          url: process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
        });
        
        await client.connect();
        await client.ping();
        await client.disconnect();
        services.redis = 'connected';
      } catch (error: any) {
        services.redis = 'disconnected';
      }
    }

    // Check Database (if configured)
    if (process.env.DATABASE_URL) {
      try {
        // Simple database connection check
        // This would depend on your database type (PostgreSQL, MySQL, etc.)
        services.database = 'connected'; // Placeholder
      } catch (error: any) {
        services.database = 'disconnected';
      }
    }

    // Get system information
    const memoryUsage = process.memoryUsage();
    const systemMemory = {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
      free: Math.round((memoryUsage.heapTotal - memoryUsage.heapUsed) / 1024 / 1024), // MB
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024) // MB
    };

    // Get disk usage (simplified)
    let diskInfo = { used: 0, available: 0 };
    try {
      const { stdout } = await execAsync("df -h . | tail -1 | awk '{print $3,$4}'", { timeout: 3000 });
      const [used, available] = stdout.trim().split(' ');
      diskInfo = { 
        used: parseFloat(used.replace(/[^0-9.]/g, '')),
        available: parseFloat(available.replace(/[^0-9.]/g, ''))
      };
    } catch (error: any) {
      // Disk info optional, don't fail health check
    }

    // Determine overall health status
    let overallStatus: HealthStatus['status'] = 'healthy';
    
    if (services.jekyll === 'error' || services.redis === 'disconnected' || services.database === 'disconnected') {
      overallStatus = 'degraded';
    }

    if (services.api === 'error') {
      overallStatus = 'unhealthy';
    }

    const responseTime = Date.now() - startTime;

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services,
      system: {
        memory: systemMemory,
        disk: diskInfo
      },
      version: process.env.npm_package_version || '1.0.0'
    };

    // Set appropriate HTTP status code
    const statusCode = overallStatus === 'healthy' ? 200 : 
                      overallStatus === 'degraded' ? 200 : 503;

    // Add response time header
    res.setHeader('X-Response-Time', `${responseTime}ms`);

    res.status(statusCode).json(healthStatus);

  } catch (error: any) {
    console.error('Health check error:', error);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        api: 'error',
        jekyll: 'unknown'
      },
      system: {
        memory: { used: 0, free: 0, total: 0 },
        disk: { used: 0, available: 0 }
      },
      error: 'Health check failed'
    } as any);
  }
}