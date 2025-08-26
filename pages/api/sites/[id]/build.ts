// pages/api/sites/[id]/build.ts
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

  try {
    // Check if site is already building
    if (site.status === 'building') {
      return res.status(409).json({
        success: false,
        error: 'Site is already being built'
      });
    }

    console.log(`Building site: ${site.name}`);
    
    const buildResult = await jekyllManager.buildSite(id);
    
    const responseData = {
      success: buildResult.success,
      buildResult: {
        success: buildResult.success,
        output: buildResult.output,
        error: buildResult.error,
        buildTime: buildResult.buildTime,
        timestamp: new Date().toISOString()
      },
      site: {
        id: site.id,
        name: site.name,
        status: site.status,
        lastBuilt: site.lastBuilt
      }
    };

    if (buildResult.success) {
      console.log(`Site ${site.name} built successfully in ${buildResult.buildTime}ms`);
      res.json(responseData);
    } else {
      console.error(`Site ${site.name} build failed:`, buildResult.error);
      res.status(400).json(responseData);
    }
  } catch (error: any) {
    console.error(`Build error for site ${site.name}:`, error);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Build failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}