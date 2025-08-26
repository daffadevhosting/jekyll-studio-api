// pages/api/sites/[id]/index.ts
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

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Site ID is required'
    });
  }

  if (req.method === 'GET') {
    try {
      const site = jekyllManager.getSite(id);
      if (!site) {
        return res.status(404).json({
          success: false,
          error: 'Site not found'
        });
      }

      // Get additional site statistics
      try {
        const files = await jekyllManager.listFiles(id, '');
        const postsCount = await jekyllManager.listFiles(id, '_posts').then(posts => posts.length).catch(() => 0);
        const pagesCount = files.filter(f => f.name.endsWith('.md') || f.name.endsWith('.html')).length;
        
        res.json({
          success: true,
          site: {
            ...site,
            statistics: {
              totalFiles: files.length,
              postsCount,
              pagesCount,
              lastActivity: site.lastBuilt || site.createdAt
            }
          }
        });
      } catch (statsError) {
        // Return basic site info if stats fail
        res.json({
          success: true,
          site
        });
      }
    } catch (error: any) {
      console.error(`Error fetching site ${id}:`, error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  } else if (req.method === 'DELETE') {
    try {
      const site = jekyllManager.getSite(id);
      if (!site) {
        return res.status(404).json({
          success: false,
          error: 'Site not found'
        });
      }

      // Stop site if it's running
      if (site.status === 'serving') {
        console.log(`Stopping site ${site.name} before deletion`);
        await jekyllManager.stopSite(id);
      }

      console.log(`Deleting site: ${site.name}`);
      await jekyllManager.deleteSite(id);
      console.log(`Site ${site.name} deleted successfully`);

      res.json({
        success: true,
        message: 'Site deleted successfully',
        site: {
          id: site.id,
          name: site.name
        }
      });
    } catch (error: any) {
      console.error(`Error deleting site ${id}:`, error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  } else if (req.method === 'PUT') {
    try {
      const { name, description } = req.body;
      const site = jekyllManager.getSite(id);
      
      if (!site) {
        return res.status(404).json({
          success: false,
          error: 'Site not found'
        });
      }

      // Update site configuration
      if (name || description) {
        const configPath = '_config.yml';
        let configContent = await jekyllManager.readFile(id, configPath);
        
        // Simple YAML update (you might want to use a proper YAML parser)
        if (name) {
          configContent = configContent.replace(/^title:.*$/m, `title: "${name}"`);
        }
        if (description) {
          configContent = configContent.replace(/^description:.*$/m, `description: "${description}"`);
        }
        
        await jekyllManager.updateFile(id, configPath, configContent);
        
        // Rebuild site with new config
        await jekyllManager.buildSite(id);
      }

      res.json({
        success: true,
        message: 'Site updated successfully',
        site: jekyllManager.getSite(id)
      });
    } catch (error: any) {
      console.error(`Error updating site ${id}:`, error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}