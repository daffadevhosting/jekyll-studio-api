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
  private maxRetries = 3;

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required');
    }
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }

  /**
   * Extract and clean JSON from AI response
   */
  private extractJsonFromResponse(rawText: string): string {
    // Remove markdown code blocks if present
    let cleanedText = rawText.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.substring(7);
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.substring(3);
    }
    if (cleanedText.endsWith('```')) {
      cleanedText = cleanedText.substring(0, cleanedText.length - 3);
    }
    cleanedText = cleanedText.trim();

    // Find JSON object boundaries
    const firstBracket = cleanedText.indexOf('{');
    const lastBracket = cleanedText.lastIndexOf('}');
    
    if (firstBracket === -1 || lastBracket === -1) {
      throw new Error("Respons dari AI tidak mengandung format JSON yang valid.");
    }
    
    return cleanedText.substring(firstBracket, lastBracket + 1);
  }

  /**
   * Fix JSON string by properly escaping quotes
   */
  private fixJsonString(jsonString: string): string {
    // Use a state machine to properly handle string escaping
    let inString = false;
    let escapeNext = false;
    let result = '';

    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString[i];

      if (escapeNext) {
        result += char;
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        result += char;
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        if (inString) {
          // Look ahead to see if this is the end of a string
          let isEndOfString = true;
          for (let j = i + 1; j < jsonString.length; j++) {
            const nextChar = jsonString[j];
            if (nextChar === ' ' || nextChar === ',' || nextChar === '}' || nextChar === ']' || nextChar === ':') {
              break;
            }
            if (nextChar === '"') {
              isEndOfString = false;
              break;
            }
          }

          if (isEndOfString) {
            inString = false;
            result += char;
          } else {
            // This quote should be escaped
            result += '\\"';
          }
        } else {
          inString = true;
          result += char;
        }
      } else {
        result += char;
      }
    }

    return result;
  }

  /**
   * Generate content with retry mechanism for JSON parsing
   */
  private async generateAndParse(prompt: string, attempt: number = 1): Promise<any> {
    if (attempt > this.maxRetries) {
      throw new Error(`Gagal mendapatkan JSON yang valid dari AI setelah ${this.maxRetries} kali percobaan.`);
    }

    console.log(chalk.yellow(`[Percobaan ke-${attempt}] Meminta struktur JSON dari AI...`));
    
    try {
      const result = await this.model.generateContent(prompt);
      const rawText = (await result.response).text();

      try {
        // Extract and clean JSON
        const jsonString = this.extractJsonFromResponse(rawText);
        
        // Fix JSON string
        const fixedJsonString = this.fixJsonString(jsonString);
        
        // Parse JSON
        const parsedJson = JSON.parse(fixedJsonString);
        console.log(chalk.green(`[Percobaan ke-${attempt}] JSON berhasil di-parsing!`));
        return parsedJson;
      } catch (parseError: any) {
        console.error(chalk.red(`[Percobaan ke-${attempt}] Gagal mem-parsing JSON. Error: ${parseError.message}`));
        console.error(chalk.grey('--- Respons dari AI ---\n'), rawText, '\n--- Akhir Respons ---');
        
        // Ask AI to fix its mistake
        const fixupPrompt = `
You previously provided the following text which is NOT valid JSON.
It produced the parsing error: "${parseError.message}".

--- BROKEN TEXT START ---
${rawText}
--- BROKEN TEXT END ---

Analyze the broken text and the error message.
Now, provide ONLY the corrected, 100% valid JSON object. Do not add any extra text or markdown.
Ensure ALL double quotes inside string values are properly escaped with backslashes.
        `;
        
        // Retry with fix prompt
        return this.generateAndParse(fixupPrompt, attempt + 1);
      }
    } catch (error: any) {
      console.error(chalk.red(`[Percobaan ke-${attempt}] Error generating content: ${error.message}`));
      if (attempt >= this.maxRetries) {
        throw error;
      }
      return this.generateAndParse(prompt, attempt + 1);
    }
  }

  /**
   * Generate Jekyll site structure from user prompt
   */
  async generateSiteStructure(prompt: string): Promise<JekyllSiteStructure> {
    const initialPrompt = `
You are an expert Jekyll developer who ALWAYS returns valid JSON.
Generate a complete Jekyll site structure based on the user's prompt.

CRITICAL RULES:
1. Return ONLY a single, valid JSON object. No markdown fences or extra text.
2. Escape ALL double quotes inside string values with backslashes (e.g., "<div class=\\"container\\">").
3. If user asks for Tailwind CSS, use the placeholder <!-- TAILWIND-CSS --> in layout files.

JSON structure must follow this exact schema:
{
  "name": "site-slug",
  "title": "Site Title",
  "description": "Site description",
  "theme": "theme-name",
  "config": { ... },
  "layouts": [{ "name": "...", "content": "..." }],
  "includes": [{ "name": "...", "content": "..." }],
  "posts": [{ "title": "...", "date": "...", "content": "..." }],
  "pages": [{ "name": "...", "title": "...", "content": "..." }],
  "assets": { "css": "...", "js": "..." }
}

User prompt: ${prompt}
    `;

    const siteStructure = await this.generateAndParse(initialPrompt);
    
    // Handle Tailwind CSS if requested
    if (prompt.toLowerCase().includes('tailwind')) {
      const tailwindScript = '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>';
      
      if (siteStructure.layouts) {
        for (const layout of siteStructure.layouts) {
          if (layout.content.includes('<!-- TAILWIND-CSS -->')) {
            layout.content = layout.content.replace('<!-- TAILWIND-CSS -->');
          } else if (layout.content.includes('<head>')) {
            layout.content = layout.content.replace('<head>', `<head>${tailwindScript}`);
          }
        }
      }

      if (siteStructure.includes) {
        for (const include of siteStructure.includes) {
          if (include.content.includes('<!-- TAILWIND-CSS -->')) {
            include.content = include.content.replace('<!-- TAILWIND-CSS -->', tailwindScript);
          }
        }
      }
    }

    return this.validateAndCleanStructure(siteStructure);
  }

  /**
   * Generate individual Jekyll component
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