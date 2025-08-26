// pages/api/sites/[id]/preview.ts
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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const { path = 'index.html' } = req.query;

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
    // If site is being served, redirect to live preview
    if (site.status === 'serving' && site.port) {
      return res.redirect(302, `http://localhost:${site.port}/${path}`);
    }

    // Otherwise, serve static built files
    const sitePath = `${site.path}/_site/${path}`;
    
    try {
      const content = await jekyllManager.readFile(id, `_site/${path}`);
      
      // Set appropriate content type
      let contentType = 'text/html';
      if (path.toString().endsWith('.css')) contentType = 'text/css';
      else if (path.toString().endsWith('.js')) contentType = 'application/javascript';
      else if (path.toString().endsWith('.json')) contentType = 'application/json';
      
      res.setHeader('Content-Type', contentType);
      res.send(content);
      
    } catch (fileError) {
      // If file not found in _site, try to build first
      if (site.status === 'ready') {
        await jekyllManager.buildSite(id);
        return res.status(202).json({
          success: false,
          message: 'Site is being built. Please try again in a moment.',
          buildInProgress: true
        });
      }
      
      res.status(404).json({
        success: false,
        error: 'Preview not available. Site may need to be built first.'
      });
    }

  } catch (error: any) {
    console.error(`Error serving preview for site ${site.name}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}