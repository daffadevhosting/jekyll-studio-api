// pages/api/sites/[id]/serve.ts
import { NextApiRequest, NextApiResponse } from 'next';
import JekyllManager from '../../../../lib/jekyll-manager';
import { applySecurityMiddleware } from '../../../../middleware/cors-rate-limit';

const jekyllManager = new JekyllManager();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apply security middleware
  const securityPassed = await applySecurityMiddleware(req, res, {
    rateLimitType: 'api'
  });
  
  if (!securityPassed) return;

  const { id } = req.query;

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

  if (req.method === 'POST') {
    try {
      const { port } = req.body || {};
      
      // Validate port if provided
      if (port && (typeof port !== 'number' || port < 3000 || port > 9999)) {
        return res.status(400).json({
          success: false,
          error: 'Port must be a number between 3000 and 9999'
        });
      }

      // Check if site is already serving
      if (site.status === 'serving') {
        return res.status(409).json({
          success: false,
          error: 'Site is already being served',
          currentPort: site.port,
          url: `http://localhost:${site.port}`
        });
      }

      console.log(`Starting development server for site: ${site.name}`);
      
      const servePort = await jekyllManager.serveSite(id, port);
      
      console.log(`Site ${site.name} is now serving on port ${servePort}`);
      
      res.json({
        success: true,
        port: servePort,
        url: `http://localhost:${servePort}`,
        site: {
          id: site.id,
          name: site.name,
          status: 'serving'
        }
      });
    } catch (error: any) {
      console.error(`Error serving site ${site.name}:`, error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  } else if (req.method === 'DELETE') {
    try {
      // Check if site is actually serving
      if (site.status !== 'serving') {
        return res.status(400).json({
          success: false,
          error: 'Site is not currently being served'
        });
      }

      console.log(`Stopping development server for site: ${site.name}`);
      
      await jekyllManager.stopSite(id);
      
      console.log(`Site ${site.name} server stopped`);
      
      res.json({ 
        success: true,
        message: 'Site server stopped successfully'
      });
    } catch (error: any) {
      console.error(`Error stopping site ${site.name}:`, error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}