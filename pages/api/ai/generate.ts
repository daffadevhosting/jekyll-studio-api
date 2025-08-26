// pages/api/ai/generate.ts
import { NextApiRequest, NextApiResponse } from 'next';
import GeminiService from '../../../lib/gemini';
import { applySecurityMiddleware, sanitizeInput } from '../../../middleware/cors-rate-limit';

const gemini = new GeminiService();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apply security middleware with AI rate limiting
  const securityPassed = await applySecurityMiddleware(req, res, {
    rateLimitType: 'ai',
    requiredFields: ['type', 'prompt']
  });
  
  if (!securityPassed) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, prompt, context = {} } = req.body;

    if (!type || !prompt) {
      return res.status(400).json({
        success: false,
        error: 'Type and prompt are required'
      });
    }

    const sanitizedPrompt = sanitizeInput(prompt);
    
    if (sanitizedPrompt.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Prompt must be at least 10 characters long'
      });
    }

    if (sanitizedPrompt.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Prompt must be less than 2000 characters'
      });
    }

    console.log(`AI Generation request - Type: ${type}, Prompt length: ${sanitizedPrompt.length}`);

    let result;
    const startTime = Date.now();

    switch (type) {
      case 'site':
        result = await gemini.generateSiteStructure(sanitizedPrompt);
        break;
        
      case 'component':
        const { componentType } = context;
        if (!componentType || !['layout', 'include', 'post', 'page'].includes(componentType)) {
          return res.status(400).json({
            success: false,
            error: 'Valid componentType is required (layout, include, post, page)'
          });
        }
        result = await gemini.generateComponent(componentType, sanitizedPrompt, context);
        break;
        
      case 'styles':
        result = await gemini.generateStyles(sanitizedPrompt, context);
        break;
        
      case 'improve':
        const { content, improvements } = context;
        if (!content) {
          return res.status(400).json({
            success: false,
            error: 'Content is required for improvement type'
          });
        }
        result = await gemini.improveContent(content, improvements || sanitizedPrompt);
        break;
        
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid generation type. Must be one of: site, component, styles, improve'
        });
    }

    const processingTime = Date.now() - startTime;
    console.log(`AI Generation completed - Type: ${type}, Time: ${processingTime}ms`);

    res.json({
      success: true,
      result,
      type,
      metadata: {
        processingTime,
        promptLength: sanitizedPrompt.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('AI generation error:', error);
    
    // Handle specific AI service errors
    let errorMessage = 'Failed to generate content';
    let statusCode = 500;
    
    if (error.message?.includes('API key')) {
      errorMessage = 'AI service configuration error';
      statusCode = 503;
    } else if (error.message?.includes('quota') || error.message?.includes('limit')) {
      errorMessage = 'AI service rate limit exceeded';
      statusCode = 429;
    } else if (error.message?.includes('timeout')) {
      errorMessage = 'AI service timeout';
      statusCode = 504;
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}