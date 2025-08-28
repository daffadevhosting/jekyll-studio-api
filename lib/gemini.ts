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
  // Tambahan untuk dukungan e-commerce seperti online store
  collections?: Record<string, Array<{
    name: string;
    title: string;
    content: string;
    permalink?: string;
    [key: string]: any; // Untuk front matter tambahan seperti price, image, dll.
  }>>;
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
   * Generate content dengan mencoba mekanisme untuk JSON parsing
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
        const jsonString = this.extractJsonFromResponse(rawText);
        const fixedJsonString = this.fixJsonString(jsonString);
        const parsedJson = JSON.parse(fixedJsonString);
        console.log(chalk.green(`[Percobaan ke-${attempt}] JSON berhasil di-parsing!`));
        return parsedJson; // Pastikan keluar setelah sukses
      } catch (parseError: any) {
        console.error(chalk.red(`[Percobaan ke-${attempt}] Gagal mem-parsing JSON. Error: ${parseError.message}`));
        console.error(chalk.grey('--- Respons dari AI ---\n'), rawText, '\n--- Akhir Respons ---');
        
        // Hanya retry jika error terkait JSON parsing, bukan error lain
        if (parseError instanceof SyntaxError) {
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
          return this.generateAndParse(fixupPrompt, attempt + 1);
        }
        throw parseError; // Jika bukan SyntaxError, lempar error tanpa retry
      }
    } catch (error: any) {
      console.error(chalk.red(`[Percobaan ke-${attempt}] Error generating content: ${error.message}`));
      if (attempt >= this.maxRetries) {
        throw error;
      }
      // Hanya retry untuk error tertentu (misalnya network error)
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return this.generateAndParse(prompt, attempt + 1);
      }
      throw error; // Lempar error lain tanpa retry
    }
  }

  /**
   * Generate Jekyll site structure dari user prompt
   */
  async generateSiteStructure(prompt: string): Promise<JekyllSiteStructure> {
    const initialPrompt = `
You are an expert Jekyll developer who ALWAYS returns valid JSON.
Generate a complete Jekyll site structure based on the user's prompt.

CRITICAL RULES:
1. Return ONLY a single, valid JSON object. No markdown fences or extra text.
2. Escape ALL double quotes inside string values with backslashes (e.g., "<div class=\\"container\\">").
3. If user asks for Tailwind CSS, use the placeholder <!-- TAILWIND-CSS --> in layout files.
4. If the prompt is for an online store or e-commerce (e.g., mentions "toko online", "online store", "snipcart"), include a "collections" object with "products" array for product items, each with front matter like identifier, price, image, description.
5. Ensure all layouts, includes, posts, pages, and collections have meaningful content relevant to the prompt.
6. For empty or missing content, generate meaningful default content based on the prompt.
7. Posts should have at least 2-3 paragraphs of content, and pages should have structured HTML/Markdown.

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
  "assets": { "css": "...", "js": "..." },
  "collections": { "products": [{ "name": "...", "title": "...", "content": "..." }] }
}

User prompt: ${prompt}
    `;

    const siteStructure = await this.generateAndParse(initialPrompt);
    
    // Handle Tailwind CSS jika diminta
    if (prompt.toLowerCase().includes('tailwind')) {
      const tailwindScript = '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>';
      
      if (siteStructure.layouts) {
        for (const layout of siteStructure.layouts) {
          if (layout.content.includes('<!-- TAILWIND-CSS -->')) {
            layout.content = layout.content.replace('<!-- TAILWIND-CSS -->', tailwindScript);
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

    // Handle Snipcart jika user meminta di prompt
    if (prompt.toLowerCase().includes('snipcart')) {
      const snipcartScript = `
    <script src="https://cdn.snipcart.com/themes/v3.0.0-beta.3/default/snipcart.js" data-api-key="{{ site.snipcart_api_key }}" id="snipcart" defer></script>
    <link href="https://cdn.snipcart.com/themes/v3.0.0-beta.3/default/snipcart.css" rel="stylesheet" type="text/css" />
      `;
      if (siteStructure.config) {
        siteStructure.config.snipcart_api_key = "<your_snipcart_api_key>";
      }
      if (siteStructure.layouts) {
        for (const layout of siteStructure.layouts) {
          if (layout.content.includes('<head>')) {
            layout.content = layout.content.replace('<head>', `<head>${snipcartScript}`);
          }
        }
      }
    }

    return this.validateAndCleanStructure(siteStructure, prompt);
  }

  /**
   * Generate individual komponen Jekyll
   */
  async generateComponent(type: 'layout' | 'include' | 'post' | 'page' | 'collection_item', prompt: string, context?: any): Promise<string> {
    const systemPrompts = {
      layout: `Generate a Jekyll layout file. Include proper HTML structure, Liquid templating, and responsive design. Return only the HTML content with meaningful structure based on the prompt.`,
      include: `Generate a Jekyll include file. Create reusable HTML component with Liquid templating. Return only the HTML content with relevant elements based on the prompt.`,
      post: `Generate a Jekyll blog post with proper front matter. Include engaging content with at least 2-3 paragraphs of Markdown content relevant to the prompt. Return the complete post with front matter.`,
      page: `Generate a Jekyll page with front matter. Create meaningful content with structured HTML/Markdown relevant to the prompt. Return the complete page with front matter.`,
      collection_item: `Generate a Jekyll collection item (e.g., product) with front matter. Include fields like title, price, image, description if e-commerce. Return the complete item with front matter and Markdown content.`
    };

    const fullPrompt = `
${systemPrompts[type] || systemPrompts.page}

Context: ${context ? JSON.stringify(context) : 'None'}
Request: ${prompt}

Generate content that follows Jekyll best practices and includes proper front matter where applicable.
Ensure the content is meaningful, relevant to the prompt, and not empty.
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
Ensure the content remains meaningful and relevant.
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
  private validateAndCleanStructure(structure: any, prompt: string): JekyllSiteStructure {
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
      assets: structure.assets || {},
      collections: structure.collections || {}
    };

    const isEcommerce = prompt.toLowerCase().includes('toko online') || prompt.toLowerCase().includes('online store') || prompt.toLowerCase().includes('snipcart');

    if (isEcommerce) {
      // Ensure config has collections for products
      if (!cleaned.config.collections) {
        cleaned.config.collections = {
          products: {
            output: true,
            permalink: "/products/:title"
          }
        };
      }

      // Ensure product layout
      if (!cleaned.layouts.find(l => l.name === 'product.html')) {
        cleaned.layouts.push({
          name: 'product.html',
          content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ page.title | default: site.title }}</title>
    <link rel="stylesheet" href="{{ '/assets/css/style.css' | relative_url }}">
    ${prompt.toLowerCase().includes('tailwind') ? '<script src="https://cdn.tailwindcss.com"></script>' : ''}
    ${prompt.toLowerCase().includes('snipcart') ? '<script src="https://cdn.snipcart.com/themes/v3.0.0-beta.3/default/snipcart.js" data-api-key="{{ site.snipcart_api_key }}" id="snipcart" defer></script><link href="https://cdn.snipcart.com/themes/v3.0.0-beta.3/default/snipcart.css" rel="stylesheet" type="text/css" />' : ''}
</head>
<body class="bg-gray-100 font-sans">
    <header class="bg-blue-900 text-white py-4">
        <div class="container mx-auto px-4 flex justify-between items-center">
            <h1 class="text-2xl font-bold">{{ site.title }}</h1>
            {% include navigation.html %}
            <button class="snipcart-checkout text-white hover:text-blue-200">Cart (<span class="snipcart-items-count">0</span>)</button>
        </div>
    </header>
    <main class="container mx-auto px-4 py-8">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <img src="{{ page.image }}" alt="{{ page.title }}" class="w-full rounded-lg shadow-md">
            <div>
                <h2 class="text-3xl font-bold mb-4">{{ page.title }}</h2>
                <p class="text-gray-600 mb-4">{{ page.description }}</p>
                <p class="text-2xl font-semibold mb-4">$\{{ page.price }}</p>
                <button class="snipcart-add-item mt-4 w-full bg-blue-900 text-white rounded-md py-3 px-8 hover:bg-blue-700"
                        data-item-id="{{ page.identifier }}"
                        data-item-name="{{ page.title }}"
                        data-item-price="{{ page.price }}"
                        data-item-image="{{ page.image }}"
                        data-item-url="{{ site.url }}{{ page.url }}"
                        data-item-description="{{ page.description }}">Add to Cart</button>
            </div>
        </div>
        {{ content }}
    </main>
    <footer class="bg-gray-800 text-white py-4 text-center">
        <p>&copy; {{ 'now' | date: '%Y' }} {{ site.title }}</p>
    </footer>
</body>
</html>`
        });
      }

      // Ensure products collection has items
      if (!cleaned.collections.products || cleaned.collections.products.length === 0) {
        cleaned.collections.products = [
          {
            name: 'product1.md',
            title: 'Cool Gadget',
            content: `---
layout: product
identifier: gadget-001
title: Cool Gadget
price: 29.99
image: /assets/images/gadget.jpg
description: A sleek and modern gadget for everyday use.
---

## Product Details

This gadget is designed with cutting-edge technology to make your life easier. Perfect for tech enthusiasts!

- **Feature 1**: High durability
- **Feature 2**: Compact design
- **Feature 3**: Easy to use`,
            permalink: '/products/cool-gadget'
          },
          // Tambahkan lebih banyak produk jika diperlukan
        ];
      }

      // Ensure shop page
      if (!cleaned.pages.find(p => p.permalink === '/products')) {
        cleaned.pages.push({
          name: 'products.md',
          title: 'Shop',
          content: `---
layout: default
title: Shop
permalink: /products
---

# Our Products

<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
  {% for product in site.products %}
    <div class="bg-white p-4 rounded-lg shadow-md">
      <img src="{{ product.image }}" alt="{{ product.title }}" class="w-full h-48 object-cover rounded-md mb-4">
      <h3 class="text-xl font-semibold">{{ product.title }}</h3>
      <p class="text-gray-600">$\{{ product.price }}</p>
      <a href="{{ product.url | relative_url }}" class="mt-4 inline-block w-full bg-blue-900 text-white rounded-md py-2 px-4 text-center hover:bg-blue-700">View Product</a>
    </div>
  {% endfor %}
</div>`,
          permalink: '/products'
        });
      }
    }

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
    ${prompt.toLowerCase().includes('tailwind') ? '<script src="https://cdn.tailwindcss.com"></script>' : ''}
    ${isEcommerce && prompt.toLowerCase().includes('snipcart') ? '<script src="https://cdn.snipcart.com/themes/v3.0.0-beta.3/default/snipcart.js" data-api-key="{{ site.snipcart_api_key }}" id="snipcart" defer></script><link href="https://cdn.snipcart.com/themes/v3.0.0-beta.3/default/snipcart.css" rel="stylesheet" type="text/css" />' : ''}
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

    // Tambahkan default includes jika kosong
    if (cleaned.includes.length === 0) {
      cleaned.includes.push({
        name: 'navigation.html',
        content: `<nav>
<ul>
  {% for page in site.pages %}
    {% if page.title %}
      <li><a href="{{ page.url | relative_url }}">{{ page.title }}</a></li>
    {% endif %}
  {% endfor %}
  ${isEcommerce ? '<li><a href="/products">Shop</a></li>' : ''}
</ul>
</nav>`
      });
    }

    return cleaned;
  }
}

export default GeminiService;