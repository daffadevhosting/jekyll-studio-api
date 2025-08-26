// pages/api/templates/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs-extra';
import path from 'path';
import { applySecurityMiddleware } from '../../../middleware/cors-rate-limit';

const TEMPLATES_DIR = path.join(process.cwd(), 'templates');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apply security middleware
  const securityPassed = await applySecurityMiddleware(req, res, {
    rateLimitType: 'api'
  });
  
  if (!securityPassed) return;

  if (req.method === 'GET') {
    try {
      await fs.ensureDir(TEMPLATES_DIR);
      
      const templateDirs = await fs.readdir(TEMPLATES_DIR, { withFileTypes: true });
      const templates = [];

      for (const dir of templateDirs) {
        if (dir.isDirectory()) {
          try {
            const configPath = path.join(TEMPLATES_DIR, dir.name, '_config.yml');
            const configExists = await fs.pathExists(configPath);
            
            let metadata = {
              name: dir.name,
              title: dir.name,
              description: 'Jekyll template',
              category: 'general'
            };

            if (configExists) {
              const configContent = await fs.readFile(configPath, 'utf8');
              // Simple YAML parsing for basic fields
              const titleMatch = configContent.match(/^title:\s*"?([^"\n]+)"?/m);
              const descMatch = configContent.match(/^description:\s*"?([^"\n]+)"?/m);
              
              if (titleMatch) metadata.title = titleMatch[1];
              if (descMatch) metadata.description = descMatch[1];
            }

            templates.push(metadata);
          } catch (error) {
            // Skip invalid templates
            continue;
          }
        }
      }

      res.json({
        success: true,
        templates,
        count: templates.length
      });

    } catch (error: any) {
      console.error('Error fetching templates:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
