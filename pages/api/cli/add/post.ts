// pages/api/cli/add/post.ts
import { NextApiRequest, NextApiResponse } from 'next';
import GeminiService from '../../../../lib/gemini';
import { applySecurityMiddleware, sanitizeInput } from '../../../../middleware/cors-rate-limit';

const gemini = new GeminiService();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Terapkan middleware keamanan
  const securityPassed = await applySecurityMiddleware(req, res, {
    rateLimitType: 'ai',
    requiredFields: ['title']
  });
  
  if (!securityPassed) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { title, context = {} } = req.body;
    const sanitizedTitle = sanitizeInput(title);

    console.log(`CLI request received to generate post with title: ${sanitizedTitle}`);

    // Panggil GeminiService untuk membuat konten post
    // (Kamu bisa membuat method baru di GeminiService jika ingin lebih rapi)
    const prompt = `
      Anda adalah seorang penulis blog yang ahli.
      Tulis sebuah postingan blog Jekyll yang lengkap berdasarkan judul berikut: "${sanitizedTitle}".

      Aturan:
      1.  **WAJIB** sertakan front matter Jekyll yang lengkap (layout, title, date).
      2.  Gunakan format Markdown.
      3.  Buat konten yang menarik, informatif, dan relevan dengan judul.
      4.  Panjang konten sekitar 3-5 paragraf.
      5.  Gunakan tanggal hari ini untuk front matter 'date'.

      Contoh output:
      ---
      layout: post
      title: "Judul Postingan Anda"
      date: YYYY-MM-DD
      ---

      Ini adalah paragraf pembuka yang menarik...

      Ini adalah isi konten blog...
    `;
    
    // Asumsikan kita menggunakan metode `improveContent` secara umum atau membuat yang baru
    // Di sini kita akan panggil model generative AI secara langsung untuk simplisitas
    const fullPostContent = await gemini.improveContent('', prompt); // Menggunakan improveContent sebagai generator umum

    // Kirim konten yang sudah jadi kembali ke CLI
    res.status(200).json({
      success: true,
      content: fullPostContent
    });

  } catch (error: any) {
    console.error('CLI add post error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate post content'
    });
  }
}