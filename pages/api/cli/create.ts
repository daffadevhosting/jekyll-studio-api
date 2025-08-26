// pages/api/cli/create.ts
import { NextApiRequest, NextApiResponse } from 'next';
import GeminiService from '../../../lib/gemini';
import { applySecurityMiddleware, sanitizeInput } from '../../../middleware/cors-rate-limit';

const gemini = new GeminiService();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const securityPassed = await applySecurityMiddleware(req, res, {
    rateLimitType: 'ai', // Menggunakan rate limit AI karena ini adalah tugas intensif AI
    requiredFields: ['prompt']
  });
  
  if (!securityPassed) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt } = req.body;

    // Sanitasi input prompt
    const sanitizedPrompt = sanitizeInput(prompt);

    console.log(`CLI request received to generate structure with prompt: ${sanitizedPrompt.substring(0, 100)}...`);

    // 1. Panggil Gemini AI untuk men-generate struktur situs
    const structure = await gemini.generateSiteStructure(sanitizedPrompt);

    // 2. Langsung kirim struktur sebagai respons JSON
    res.status(200).json({
      success: true,
      message: 'Site structure generated successfully.',
      structure: structure
    });

  } catch (error: any) {
    console.error('CLI structure generation error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate site structure',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}