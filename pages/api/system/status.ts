// pages/api/system/status.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import { promisify } from 'util';
import JekyllManager from '../../../lib/jekyll-manager';
import { applySecurityMiddleware } from '../../../middleware/cors-rate-limit';

const execAsync = promisify(exec);
const jekyllManager = new JekyllManager();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apply security middleware
  const securityPassed = await applySecurityMiddleware(req, res, {
    rateLimitType: 'api'
  });
  
  if (!securityPassed) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sites = jekyllManager.getAllSites();
    
    // Check Docker status
    let dockerStatus = 'unknown';
    try {
      await execAsync('docker --version', { timeout: 5000 });
      dockerStatus = 'running';
    } catch (error) {
      dockerStatus = 'error';
    }

    // Check Jekyll container
    let jekyllContainerStatus = 'unknown';
    try {
      const { stdout } = await execAsync('docker-compose ps jekyll', { timeout: 5000 });
      jekyllContainerStatus = stdout.includes('Up') ? 'running' : 'stopped';
    } catch (error) {
      jekyllContainerStatus = 'error';
    }

    // System resources
    const memoryUsage = process.memoryUsage();
    
    // Disk usage (simplified)
    let diskUsage = null;
    try {
      const { stdout } = await execAsync("df -h . | tail -1 | awk '{print $2,$3,$4,$5}'", { timeout: 3000 });
      const [total, used, available, percentage] = stdout.trim().split(' ');
      diskUsage = { total, used, available, percentage };
    } catch (error) {
      // Disk info is optional
    }

    res.json({
      success: true,
      system: {
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024)
        },
        disk: diskUsage
      },
      services: {
        docker: dockerStatus,
        jekyllContainer: jekyllContainerStatus,
        api: 'running'
      },
      sites: {
        total: sites.length,
        byStatus: {
          ready: sites.filter(s => s.status === 'ready').length,
          serving: sites.filter(s => s.status === 'serving').length,
          building: sites.filter(s => s.status === 'building').length,
          error: sites.filter(s => s.status === 'error').length
        }
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasGeminiKey: !!process.env.GEMINI_API_KEY,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('Error fetching system status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}