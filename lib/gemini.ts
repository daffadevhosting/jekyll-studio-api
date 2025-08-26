import { GoogleGenerativeAI } from '@google/generative-ai';

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
    const systemPrompt = `
You are an expert Jekyll developer and web designer. Generate a complete Jekyll site structure based on the user's prompt.

Rules:
1. Return ONLY valid JSON, no explanations or markdown
2. Create realistic content, not placeholders
3. Include proper Jekyll front matter
4. Generate appropriate layouts, includes, and assets
5. Create at least 2-3 sample posts
6. Include proper CSS styling
7. Use semantic HTML structure

Required JSON structure:
{
  "name": "site-slug",
  "title": "Site Title",
  "description": "Site description",
  "theme": "theme-name",
  "config": {
    "title": "Site Title",
    "description": "Site description",
    "baseurl": "",
    "url": "",
    "markdown": "kramdown",
    "highlighter": "rouge",
    "sass": {"sass_dir": "_sass"},
    "plugins": ["jekyll-feed", "jekyll-sitemap"]
  },
  "layouts": [
    {
      "name": "default.html",
      "content": "<!-- Complete HTML layout with head, body, etc -->"
    }
  ],
  "includes": [
    {
      "name": "head.html", 
      "content": "<!-- HTML head content -->"
    }
  ],
  "posts": [
    {
      "title": "Post Title",
      "date": "2024-01-01",
      "content": "---\\nlayout: post\\ntitle: Title\\ndate: 2024-01-01\\n---\\n\\nPost content here",
      "tags": ["tag1", "tag2"],
      "categories": ["category1"]
    }
  ],
  "pages": [
    {
      "name": "index.html",
      "title": "Home",
      "content": "---\\nlayout: default\\n---\\n\\nHome page content",
      "permalink": "/"
    }
  ],
  "assets": {
    "css": "/* CSS styles */",
    "js": "/* JavaScript code */"
  }
}

User prompt: ${prompt}
`;

    try {
      const result = await this.model.generateContent(systemPrompt);
      const response = await result.response;
      let text = response.text();
      
      // Clean up response to ensure valid JSON
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const siteStructure = JSON.parse(text);
      return this.validateAndCleanStructure(siteStructure);
    } catch (error) {
      console.error('Error generating site structure:', error);
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