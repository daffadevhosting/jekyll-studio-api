// pages/api/sites/create.ts
import { NextApiRequest, NextApiResponse } from 'next';
import GeminiService from '../../../lib/gemini';
import JekyllManager from '../../../lib/jekyll-manager';
import { applySecurityMiddleware, validateSiteName, sanitizeInput } from '../../../middleware/cors-rate-limit';
 
const gemini = new GeminiService();
const jekyllManager = new JekyllManager();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apply security middleware
  const securityPassed = await applySecurityMiddleware(req, res, {
    rateLimitType: 'siteCreation',
    requiredFields: ['prompt']
  });
  
  if (!securityPassed) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, prompt, options = {} } = req.body;

    if (!prompt) {
      return res.status(400).json({ 
        success: false,
        error: 'Prompt is required' 
      });
    }

    // Sanitize inputs
    const sanitizedPrompt = sanitizeInput(prompt);
    let sanitizedName = name ? sanitizeInput(name) : null;

    // Validate site name if provided
    if (sanitizedName) {
      const nameValidation = validateSiteName(sanitizedName);
      if (!nameValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: nameValidation.error
        });
      }
    }

    // Check if site name already exists
    if (sanitizedName) {
      const existingSites = jekyllManager.getAllSites();
      const nameExists = existingSites.some(site => site.name === sanitizedName);
      
      if (nameExists) {
        return res.status(409).json({
          success: false,
          error: 'Site name already exists'
        });
      }
    }

    // Log the creation attempt
    console.log(`Creating site with prompt: ${sanitizedPrompt.substring(0, 100)}...`);

    // Generate site structure using Gemini AI
    const structure = await gemini.generateSiteStructure(sanitizedPrompt);

    // Use provided name or generated name from structure
    const finalName = sanitizedName || structure.name;

    // Create Jekyll site
    const site = await jekyllManager.createSite({ name: finalName }, structure);

    // Build the site
    const buildResult = await jekyllManager.buildSite(site.id);

    // Log successful creation
    console.log(`Site created successfully: ${site.name} (${site.id})`);

    res.status(201).json({
      success: true,
      site: {
        id: site.id,
        name: site.name,
        status: site.status,
        createdAt: site.createdAt,
        lastBuilt: site.lastBuilt
      },
      structure: {
        name: structure.name,
        title: structure.title,
        description: structure.description,
        theme: structure.theme,
        layoutsCount: structure.layouts.length,
        postsCount: structure.posts.length,
        pagesCount: structure.pages.length
      },
      buildResult,
      previewUrl: null // Will be set when site is served
    });

  } catch (error: any) {
    console.error('Site creation error:', error);
    
    // Log specific error types
    if (error.message?.includes('rate limit')) {
      console.warn('Rate limit exceeded for site creation');
    } else if (error.message?.includes('GEMINI_API_KEY')) {
      console.error('Gemini API key configuration error');
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create site',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}