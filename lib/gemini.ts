import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';

interface JekyllSiteStructure {
  name: string;
  title: string;
  description: string;
  theme: string;
  config: Record<string, any>;
  layouts: Array<{
    name: string;
    content: string;
  }>;
  includes: Array<{
    name: string;
    content: string;
  }>;
  posts: Array<{
    title: string;
    date: string;
    content: string;
    tags?: string[];
    categories?: string[];
  }>;
  pages: Array<{
    name: string;
    title: string;
    content: string;
    permalink?: string;
  }>;
  assets: {
    css?: string;
    js?: string;
  };
}

class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required');
    }
    
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // GeminiService initialized with models gemini-2.5-flash and gemini-2.0-flash
  }

  /**
   * Generate Jekyll site structure from user prompt
   */
async generateSiteStructure(prompt: string): Promise<JekyllSiteStructure> {
    // --- PROMPT BARU YANG LEBIH TEGAS ---
    const systemPrompt = `
      You are an expert Jekyll developer who ALWAYS returns valid JSON.
      Generate a complete Jekyll site structure based on the user's prompt.

      **CRITICAL RULE: You MUST return ONLY a single, valid JSON object. Do not include any markdown fences like \`\`\`json or any text outside of the JSON object. The JSON response must be 100% compliant and parsable.**

      **JSON Content Rule: Inside the JSON string values (like the "content" fields), ALL double quotes (") MUST be properly escaped with a backslash (\\"). For example, if you generate HTML like <div class="container">, it MUST be represented in the JSON as "<div class=\\"container\\">". This is the most important rule.**

      The JSON structure MUST follow this schema:
      {
        "name": "site-slug",
        "title": "Site Title",
        "description": "Site description",
        "config": { "...": "..." },
        "layouts": [{ "name": "...", "content": "..." }],
        "includes": [{ "name": "...", "content": "..." }],
        "posts": [{ "title": "...", "date": "...", "content": "..." }],
        "pages": [{ "name": "...", "title": "...", "content": "..." }],
        "assets": { "css": "...", "js": "..." }
      }

      User prompt: ${prompt}
    `;

    let rawText = ''; // Variabel untuk menyimpan teks mentah untuk debugging

    try {
      const result = await this.model.generateContent(systemPrompt);
      const response = await result.response;
      rawText = response.text();
      
      // --- METODE PEMBERSIHAN YANG LEBIH ROBUST ---

      // 1. Hapus markdown code blocks jika ada
      let cleanedText = rawText.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.substring(7);
      }
      if (cleanedText.endsWith('```')) {
        cleanedText = cleanedText.substring(0, cleanedText.length - 3);
      }
      cleanedText = cleanedText.trim();

      // 2. Temukan JSON object yang sebenarnya
      const firstBracket = cleanedText.indexOf('{');
      const lastBracket = cleanedText.lastIndexOf('}');
      
      if (firstBracket === -1 || lastBracket === -1) {
        throw new Error("Respons dari AI tidak mengandung format JSON.");
      }
      
      let jsonString = cleanedText.substring(firstBracket, lastBracket + 1);

      // 3. Perbaiki unescaped quotes di dalam string values
      // Regex untuk menemukan dan memperbaiki quotes yang tidak di-escape
      jsonString = jsonString.replace(/: "([^"]*)"/g, (match, content) => {
        // Escape semua double quotes di dalam content
        const escapedContent = content.replace(/"/g, '\\"');
        return `: "${escapedContent}"`;
      });

      // 4. Parse JSON
      const siteStructure = JSON.parse(jsonString);
      return this.validateAndCleanStructure(siteStructure);

    } catch (error: any) {
      // Penanganan error yang informatif
      console.error(chalk.red('================= AI JSON PARSE ERROR ================='));
      console.error(chalk.yellow('Gagal mem-parsing JSON dari respons AI.'));
      console.error(chalk.cyan('Pesan Error:'), error.message);
      
      console.error(chalk.grey('--- Raw AI Response Start ---'));
      console.error(rawText);
      console.error(chalk.grey('--- Raw AI Response End ---'));
      console.error(chalk.red('====================================================='));

      throw new Error(`Failed to generate site structure from AI: ${error.message}`);
    }
  }

  /**
   * Generate individual Jekyll component (layout, include, post, etc.)
   */
  async generateComponent(type: 'layout' | 'include' | 'post' | 'page', prompt: string, context?: any): Promise<string> {
    const systemPrompts = {
      layout: `Generate a Jekyll layout file. Include proper HTML structure, Liquid templating, and responsive design. Return only the HTML content.`,
      include: `Generate a Jekyll include file. Create reusable HTML component with Liquid templating. Return only the HTML content.`,
      post: `Generate a Jekyll blog post with proper front matter. Include engaging content and proper Markdown formatting. Return the complete post with front matter.`,
      page: `Generate a Jekyll page with front matter. Create meaningful content for the requested page type. Return the complete page with front matter.`
    };

    const fullPrompt = `
${systemPrompts[type]}

Context: ${context ? JSON.stringify(context) : 'None'}
Request: ${prompt}

Generate content that follows Jekyll best practices and includes proper front matter where applicable.
`;

    try {
      const result = await this.model.generateContent(fullPrompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      console.error(`Error generating ${type}:`, error);
      throw new Error(`Failed to generate ${type}`);
    }
  }

  /**
   * Improve existing Jekyll content
   */
  async improveContent(content: string, improvements: string): Promise<string> {
    const prompt = `
Improve this Jekyll content based on the requested improvements:

Current content:
${content}

Improvements requested:
${improvements}

Return the improved content maintaining Jekyll structure and front matter.
`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      console.error('Error improving content:', error);
      throw new Error('Failed to improve content');
    }
  }

  /**
   * Generate CSS styles for Jekyll site
   */
  async generateStyles(prompt: string, siteContext?: any): Promise<string> {
    const systemPrompt = `
Generate modern, responsive CSS styles for a Jekyll site.

Requirements:
1. Use modern CSS (Grid, Flexbox, Custom Properties)
2. Include responsive design
3. Provide good typography
4. Include hover effects and transitions
5. Use a cohesive color scheme
6. Include print styles

Site context: ${siteContext ? JSON.stringify(siteContext) : 'General Jekyll site'}
Style requirements: ${prompt}

Return only CSS code, no explanations.
`;

    try {
      const result = await this.model.generateContent(systemPrompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      console.error('Error generating styles:', error);
      throw new Error('Failed to generate styles');
    }
  }

  /**
   * Validate and clean the generated site structure
   */
  private validateAndCleanStructure(structure: any): JekyllSiteStructure {
    // Ensure required fields exist
    const cleaned: JekyllSiteStructure = {
      name: structure.name || 'my-site',
      title: structure.title || 'My Jekyll Site',
      description: structure.description || 'A Jekyll site generated by AI',
      theme: structure.theme || 'custom',
      config: structure.config || {},
      layouts: structure.layouts || [],
      includes: structure.includes || [],
      posts: structure.posts || [],
      pages: structure.pages || [],
      assets: structure.assets || {}
    };

    // Ensure we have at least a default layout
    if (cleaned.layouts.length === 0) {
      cleaned.layouts.push({
        name: 'default.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ page.title | default: site.title }}</title>
    <link rel="stylesheet" href="{{ '/assets/css/style.css' | relative_url }}">
</head>
<body>
    <header>
        <h1>{{ site.title }}</h1>
        <p>{{ site.description }}</p>
    </header>
    <main>
        {{ content }}
    </main>
    <footer>
        <p>&copy; {{ 'now' | date: '%Y' }} {{ site.title }}</p>
    </footer>
</body>
</html>`
      });
    }

    // Ensure we have an index page
    if (!cleaned.pages.find(p => p.name === 'index.html' || p.name === 'index.md')) {
      cleaned.pages.push({
        name: 'index.html',
        title: 'Home',
        content: `---
layout: default
---

<h2>Welcome to {{ site.title }}</h2>
<p>{{ site.description }}</p>

<div class="posts">
  {% for post in site.posts limit:5 %}
    <article>
      <h3><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h3>
      <p>{{ post.date | date: "%B %d, %Y" }}</p>
      <p>{{ post.excerpt }}</p>
    </article>
  {% endfor %}
</div>`,
        permalink: '/'
      });
    }

    return cleaned;
  }
}

export default GeminiService;