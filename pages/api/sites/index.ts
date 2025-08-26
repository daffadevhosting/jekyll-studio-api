// pages/api/sites/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import JekyllManager from '../../../lib/jekyll-manager';
import { applySecurityMiddleware } from '../../../middleware/cors-rate-limit';

const jekyllManager = new JekyllManager();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apply security middleware
  const securityPassed = await applySecurityMiddleware(req, res, {
    rateLimitType: 'api'
  });
  
  if (!securityPassed) return;

  if (req.method === 'GET') {
    try {
      const { status, limit = 50, offset = 0 } = req.query;
      
      let sites = jekyllManager.getAllSites();
      
      // Filter by status if provided
      if (status && typeof status === 'string') {
        sites = sites.filter(site => site.status === status);
      }
      
      // Sort by creation date (newest first)
      sites.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      // Pagination
      const limitNum = Math.min(parseInt(limit as string) || 50, 100);
      const offsetNum = parseInt(offset as string) || 0;
      const paginatedSites = sites.slice(offsetNum, offsetNum + limitNum);
      
      // Add statistics for each site
      const sitesWithStats = await Promise.all(
        paginatedSites.map(async (site) => {
          try {
            const files = await jekyllManager.listFiles(site.id, '');
            return {
              ...site,
              fileCount: files.length
            };
          } catch (error) {
            return {
              ...site,
              fileCount: 0
            };
          }
        })
      );
      
      res.json({
        success: true,
        sites: sitesWithStats,
        pagination: {
          total: sites.length,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + limitNum < sites.length
        },
        summary: {
          total: sites.length,
          byStatus: {
            ready: sites.filter(s => s.status === 'ready').length,
            serving: sites.filter(s => s.status === 'serving').length,
            building: sites.filter(s => s.status === 'building').length,
            error: sites.filter(s => s.status === 'error').length
          }
        }
      });
    } catch (error: any) {
      console.error('Error fetching sites:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}