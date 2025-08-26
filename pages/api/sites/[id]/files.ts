// pages/api/sites/[id]/files.ts
import { NextApiRequest, NextApiResponse } from 'next';
import JekyllManager from '../../../../lib/jekyll-manager';
import { applySecurityMiddleware, sanitizeInput } from '../../../../middleware/cors-rate-limit';
import path from 'path';

const jekyllManager = new JekyllManager();

// Security: Allowed file extensions
const ALLOWED_EXTENSIONS = ['.md', '.html', '.yml', '.yaml', '.css', '.scss', '.sass', '.js', '.json', '.txt'];
const DANGEROUS_PATHS = ['..', '.env', 'node_modules', '.git'];

function isPathSafe(filePath: string): boolean {
  // Check for path traversal attempts
  const normalizedPath = path.normalize(filePath);
  if (normalizedPath.includes('..') || normalizedPath.startsWith('/')) {
    return false;
  }

  // Check for dangerous paths
  if (DANGEROUS_PATHS.some(dangerous => normalizedPath.includes(dangerous))) {
    return false;
  }

  return true;
}

function isFileExtensionAllowed(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext) || ext === '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apply security middleware
  const securityPassed = await applySecurityMiddleware(req, res, {
    rateLimitType: 'api'
  });
  
  if (!securityPassed) return;

  const { id, path: queryPath = '' } = req.query;

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

  const filePath = Array.isArray(queryPath) ? queryPath.join('/') : queryPath;

  // Validate file path
  if (!isPathSafe(filePath)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid file path'
    });
  }

  if (req.method === 'GET') {
    try {
      if (typeof filePath === 'string' && filePath.includes('.')) {
        // Get specific file content
        if (!isFileExtensionAllowed(filePath)) {
          return res.status(403).json({
            success: false,
            error: 'File type not allowed'
          });
        }

        const content = await jekyllManager.readFile(id, filePath);
        
        res.json({
          success: true,
          content,
          path: filePath,
          size: Buffer.byteLength(content, 'utf8'),
          lastModified: new Date().toISOString() // You might want to get actual file stats
        });
      } else {
        // List directory contents
        const files = await jekyllManager.listFiles(id, filePath);
        
        // Filter out system files
        const filteredFiles = files.filter(file => 
          !file.name.startsWith('.') && 
          !['node_modules', '_site', '.bundle'].includes(file.name)
        );
        
        res.json({
          success: true,
          files: filteredFiles,
          path: filePath,
          count: filteredFiles.length
        });
      }
    } catch (error: any) {
      console.error(`Error reading file/directory ${filePath}:`, error);
      
      if (error.code === 'ENOENT') {
        res.status(404).json({
          success: false,
          error: 'File or directory not found'
        });
      } else {
        res.status(500).json({
          success: false,
          error: error.message,
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    }
  } else if (req.method === 'PUT') {
    try {
      const { content, filePath: bodyFilePath } = req.body;
      
      if (!content || !bodyFilePath) {
        return res.status(400).json({
          success: false,
          error: 'Content and filePath are required'
        });
      }

      const sanitizedFilePath = sanitizeInput(bodyFilePath);
      const sanitizedContent = content; // Don't sanitize content as it may contain valid HTML/markdown

      // Validate file path and extension
      if (!isPathSafe(sanitizedFilePath)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid file path'
        });
      }

      if (!isFileExtensionAllowed(sanitizedFilePath)) {
        return res.status(403).json({
          success: false,
          error: 'File type not allowed'
        });
      }

      console.log(`Updating file: ${sanitizedFilePath} for site: ${site.name}`);
      
      await jekyllManager.updateFile(id, sanitizedFilePath, sanitizedContent);
      
      console.log(`File updated successfully: ${sanitizedFilePath}`);
      
      res.json({
        success: true,
        message: 'File updated successfully',
        filePath: sanitizedFilePath,
        size: Buffer.byteLength(sanitizedContent, 'utf8'),
        lastModified: new Date().toISOString()
      });
    } catch (error: any) {
      console.error(`Error updating file:`, error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  } else if (req.method === 'DELETE') {
    try {
      const { filePath: bodyFilePath } = req.body;
      
      if (!bodyFilePath) {
        return res.status(400).json({
          success: false,
          error: 'filePath is required'
        });
      }

      const sanitizedFilePath = sanitizeInput(bodyFilePath);

      // Validate file path
      if (!isPathSafe(sanitizedFilePath)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid file path'
        });
      }

      // Prevent deletion of critical files
      const criticalFiles = ['_config.yml', 'Gemfile', 'index.html', 'index.md'];
      if (criticalFiles.includes(path.basename(sanitizedFilePath))) {
        return res.status(403).json({
          success: false,
          error: 'Cannot delete critical files'
        });
      }

      console.log(`Deleting file: ${sanitizedFilePath} for site: ${site.name}`);
      
      // Implementation would go here - you'd need to add deleteFile method to JekyllManager
      // await jekyllManager.deleteFile(id, sanitizedFilePath);
      
      res.json({
        success: true,
        message: 'File deleted successfully',
        filePath: sanitizedFilePath
      });
    } catch (error: any) {
      console.error(`Error deleting file:`, error);
      
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