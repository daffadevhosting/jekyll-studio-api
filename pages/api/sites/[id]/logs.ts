// pages/api/sites/[id]/logs.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import { promisify } from 'util';
import JekyllManager from '../../../../lib/jekyll-manager';
import { applySecurityMiddleware } from '../../../../middleware/cors-rate-limit';

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

  const { id } = req.query;
  const { lines = 100, type = 'build' } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Site ID is required'
    });
  }

  // Check if site exists
  const site = jekyllManager.getSite(id);
  if (!site) {
    return res.status(404).json({
      success: false,
      error: 'Site not found'
    });
  }

  try {
    const maxLines = Math.min(parseInt(lines as string) || 100, 1000);
    let logs: string[] = [];

    if (type === 'build') {
      // Get Jekyll build logs
      try {
        const { stdout } = await execAsync(
          `docker-compose logs --tail=${maxLines} jekyll`,
          { timeout: 10000 }
        );
        logs = stdout.split('\n').filter(line => line.includes(site.name));
      } catch (error) {
        logs = ['No build logs available'];
      }
    } else if (type === 'serve') {
      // Get development server logs
      try {
        const { stdout } = await execAsync(
          `docker ps --filter name=${site.name} --format "table {{.Names}}\t{{.Status}}"`,
          { timeout: 5000 }
        );
        logs = stdout.split('\n');
      } catch (error) {
        logs = ['No server logs available'];
      }
    }

    res.json({
      success: true,
      logs: logs.slice(-maxLines),
      site: {
        id: site.id,
        name: site.name,
        status: site.status
      },
      metadata: {
        type,
        lines: logs.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error(`Error fetching logs for site ${site.name}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
