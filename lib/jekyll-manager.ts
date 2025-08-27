import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import { v4 as uuidv4 } from 'uuid';
import chokidar from 'chokidar';
import { EventEmitter } from 'events';

const execAsync = promisify(exec);

interface JekyllSite {
  id: string;
  name: string;
  path: string;
  status: 'creating' | 'ready' | 'building' | 'serving' | 'error';
  port?: number;
  createdAt: Date;
  lastBuilt?: Date;
}

interface BuildResult {
  success: boolean;
  output: string;
  error?: string;
  buildTime: number;
}

class JekyllManager extends EventEmitter {
  private sites: Map<string, JekyllSite> = new Map();
  private projectsDir: string;
  private dockerComposePath: string;

  constructor() {
    super();
    this.projectsDir = path.join(process.cwd(), 'projects');
    this.dockerComposePath = path.join(process.cwd(), 'docker compose.yml');
    this.ensureProjectsDir();
  }

  /**
   * Create new Jekyll site from AI-generated structure
   */
  async createSite(siteData: any, structure: any): Promise<JekyllSite> {
    const siteId = uuidv4();
    const siteName = structure.name || siteData.name || `site-${siteId}`;
    const sitePath = path.join(this.projectsDir, siteName);

    const site: JekyllSite = {
      id: siteId,
      name: siteName,
      path: sitePath,
      status: 'creating',
      createdAt: new Date()
    };

    this.sites.set(siteId, site);
    this.emit('siteStatusChanged', site);

    try {
      // Create site directory
      await fs.ensureDir(sitePath);

      // Create Jekyll structure
      await this.createJekyllStructure(sitePath, structure);

      // Initialize Git repository (optional)
      await this.initGitRepo(sitePath);

      site.status = 'ready';
      this.sites.set(siteId, site);
      this.emit('siteStatusChanged', site);
      this.emit('siteCreated', site);

      return site;
    } catch (error) {
      site.status = 'error';
      this.sites.set(siteId, site);
      this.emit('siteStatusChanged', site);
      throw error;
    }
  }

  /**
   * Build Jekyll site
   */
  async buildSite(siteId: string): Promise<BuildResult> {
    const site = this.sites.get(siteId);
    if (!site) {
      throw new Error('Site not found');
    }

    site.status = 'building';
    this.sites.set(siteId, site);
    this.emit('siteStatusChanged', site);

    const startTime = Date.now();

    try {
      // Build using Docker container
      const command = `docker compose run --rm jekyll build /workspace/projects/${site.name}`;
      const { stdout, stderr } = await execAsync(command, {
        cwd: path.dirname(this.dockerComposePath),
        timeout: 120000 // 2 minutes timeout
      });

      const buildTime = Date.now() - startTime;
      site.status = 'ready';
      site.lastBuilt = new Date();
      this.sites.set(siteId, site);
      this.emit('siteStatusChanged', site);
      this.emit('siteBuilt', site);

      return {
        success: true,
        output: stdout,
        buildTime
      };
    } catch (error: any) {
      site.status = 'error';
      this.sites.set(siteId, site);
      this.emit('siteStatusChanged', site);

      return {
        success: false,
        output: error.stdout || '',
        error: error.stderr || error.message,
        buildTime: Date.now() - startTime
      };
    }
  }

  /**
   * Start development server for site
   */
  async serveSite(siteId: string, port?: number): Promise<number> {
    const site = this.sites.get(siteId);
    if (!site) {
      throw new Error('Site not found');
    }

    // Find available port if not specified
    const servePort = port || await this.findAvailablePort();

    try {
      // Start development server using Docker
      const command = `docker compose run --rm -d -p ${servePort}:${servePort} jekyll serve /workspace/projects/${site.name} ${servePort}`;
      await execAsync(command, {
        cwd: path.dirname(this.dockerComposePath)
      });

      site.status = 'serving';
      site.port = servePort;
      this.sites.set(siteId, site);
      this.emit('siteStatusChanged', site);
      this.emit('siteServing', site);

      // Setup file watcher for live reload
      this.setupFileWatcher(site);

      return servePort;
    } catch (error) {
      site.status = 'error';
      this.sites.set(siteId, site);
      this.emit('siteStatusChanged', site);
      throw error;
    }
  }

  /**
   * Stop development server
   */
  async stopSite(siteId: string): Promise<void> {
    const site = this.sites.get(siteId);
    if (!site) {
      throw new Error('Site not found');
    }

    try {
      // Stop Docker container (simplified - you might need container ID tracking)
      await execAsync('docker compose down', {
        cwd: path.dirname(this.dockerComposePath)
      });

      site.status = 'ready';
      site.port = undefined;
      this.sites.set(siteId, site);
      this.emit('siteStatusChanged', site);
      this.emit('siteStopped', site);
    } catch (error) {
      console.error('Error stopping site:', error);
    }
  }

  /**
   * Update site file
   */
  async updateFile(siteId: string, filePath: string, content: string): Promise<void> {
    const site = this.sites.get(siteId);
    if (!site) {
      throw new Error('Site not found');
    }

    const fullPath = path.join(site.path, filePath);
    
    // Ensure directory exists
    await fs.ensureDir(path.dirname(fullPath));
    
    // Write file
    await fs.writeFile(fullPath, content, 'utf8');
    
    this.emit('fileUpdated', { site, filePath, content });
  }

  /**
   * Read site file
   */
  async readFile(siteId: string, filePath: string): Promise<string> {
    const site = this.sites.get(siteId);
    if (!site) {
      throw new Error('Site not found');
    }

    const fullPath = path.join(site.path, filePath);
    return await fs.readFile(fullPath, 'utf8');
  }

  /**
   * List site files
   */
  async listFiles(siteId: string, directory: string = ''): Promise<any[]> {
    const site = this.sites.get(siteId);
    if (!site) {
      throw new Error('Site not found');
    }

    const dirPath = path.join(site.path, directory);
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    
    return items.map(item => ({
      name: item.name,
      type: item.isDirectory() ? 'directory' : 'file',
      path: path.join(directory, item.name)
    }));
  }

  /**
   * Delete site
   */
  async deleteSite(siteId: string): Promise<void> {
    const site = this.sites.get(siteId);
    if (!site) {
      throw new Error('Site not found');
    }

    // Stop site if running
    if (site.status === 'serving') {
      await this.stopSite(siteId);
    }

    // Remove directory
    await fs.remove(site.path);

    // Remove from memory
    this.sites.delete(siteId);
    this.emit('siteDeleted', site);
  }

  /**
   * Get site by ID
   */
  getSite(siteId: string): JekyllSite | undefined {
    return this.sites.get(siteId);
  }

  /**
   * Get all sites
   */
  getAllSites(): JekyllSite[] {
    return Array.from(this.sites.values());
  }

  /**
   * Create Jekyll file structure from AI-generated structure
   */
  private async createJekyllStructure(sitePath: string, structure: any): Promise<void> {
    // Create _config.yml
    const configPath = path.join(sitePath, '_config.yml');
    await fs.writeFile(configPath, yaml.stringify(structure.config));

    // Create Gemfile
    const gemfilePath = path.join(sitePath, 'Gemfile');
    const gemfileContent = `source "https://rubygems.org"

gem "jekyll", "~> 4.3"
gem "jekyll-feed", "~> 0.12"
gem "jekyll-sitemap", "~> 1.4"

group :jekyll_plugins do
  gem "jekyll-feed"
  gem "jekyll-sitemap"
end

platforms :mingw, :x64_mingw, :mswin, :jruby do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end

gem "wdm", "~> 0.1.1", :platforms => [:mingw, :x64_mingw, :mswin]
gem "http_parser.rb", "~> 0.6.0", :platforms => [:jruby]
`;
    await fs.writeFile(gemfilePath, gemfileContent);

    // Create layouts
    const layoutsDir = path.join(sitePath, '_layouts');
    await fs.ensureDir(layoutsDir);
    for (const layout of structure.layouts) {
      await fs.writeFile(
        path.join(layoutsDir, layout.name),
        layout.content
      );
    }

    // Create includes
    if (structure.includes && structure.includes.length > 0) {
      const includesDir = path.join(sitePath, '_includes');
      await fs.ensureDir(includesDir);
      for (const include of structure.includes) {
        await fs.writeFile(
          path.join(includesDir, include.name),
          include.content
        );
      }
    }

    // Create posts
    if (structure.posts && structure.posts.length > 0) {
      const postsDir = path.join(sitePath, '_posts');
      await fs.ensureDir(postsDir);
      for (const post of structure.posts) {
        const filename = `${post.date}-${post.title.toLowerCase().replace(/\s+/g, '-')}.md`;
        await fs.writeFile(
          path.join(postsDir, filename),
          post.content
        );
      }
    }

    // Create pages
    for (const page of structure.pages) {
      await fs.writeFile(
        path.join(sitePath, page.name),
        page.content
      );
    }

    // Create assets
    const assetsDir = path.join(sitePath, 'assets');
    await fs.ensureDir(assetsDir);

    if (structure.assets.css) {
      const cssDir = path.join(assetsDir, 'css');
      await fs.ensureDir(cssDir);
      await fs.writeFile(
        path.join(cssDir, 'style.css'),
        structure.assets.css
      );
    }

    if (structure.assets.js) {
      const jsDir = path.join(assetsDir, 'js');
      await fs.ensureDir(jsDir);
      await fs.writeFile(
        path.join(jsDir, 'script.js'),
        structure.assets.js
      );
    }
  }

  /**
   * Initialize Git repository
   */
  private async initGitRepo(sitePath: string): Promise<void> {
    try {
      await execAsync('git init', { cwd: sitePath });
      
      // Create .gitignore
      const gitignoreContent = `_site/
.sass-cache/
.jekyll-cache/
.jekyll-metadata
.bundle/
vendor/
Gemfile.lock
*.gem
.DS_Store
`;
      await fs.writeFile(path.join(sitePath, '.gitignore'), gitignoreContent);
    } catch (error) {
      console.warn('Git initialization failed:', error);
    }
  }

  /**
   * Setup file watcher for live reload
   */
  private setupFileWatcher(site: JekyllSite): void {
    const watcher = chokidar.watch(site.path, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true
    });

    watcher.on('change', (filePath) => {
      this.emit('fileChanged', { site, filePath });
    });

    // Clean up watcher when site stops
    this.once('siteStopped', (stoppedSite) => {
      if (stoppedSite.id === site.id) {
        watcher.close();
      }
    });
  }

  /**
   * Find available port for development server
   */
  private async findAvailablePort(startPort: number = 4000): Promise<number> {
    const usedPorts = Array.from(this.sites.values())
      .map(site => site.port)
      .filter(port => port !== undefined);

    let port = startPort;
    while (usedPorts.includes(port)) {
      port++;
    }
    return port;
  }

  /**
   * Ensure projects directory exists
   */
  private async ensureProjectsDir(): Promise<void> {
    await fs.ensureDir(this.projectsDir);
  }
}

export default JekyllManager;