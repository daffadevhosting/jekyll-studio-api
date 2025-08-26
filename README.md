# Jekyll Studio API - Next.js Backend

Backend API Next.js dengan integrasi Gemini AI untuk Jekyll Studio webapp. API ini menyediakan endpoints lengkap untuk membuat, mengelola, dan meng-deploy Jekyll sites menggunakan AI.

## 🚀 Features

- ✅ **Gemini AI Integration** - Generate Jekyll sites dari natural language prompts
- ✅ **Jekyll Container Management** - Automated Jekyll site creation dan building
- ✅ **Real-time Updates** - WebSocket untuk live updates dan file changes
- ✅ **File Management** - CRUD operations untuk Jekyll files
- ✅ **Security** - Rate limiting, CORS, input validation
- ✅ **Multi-site Support** - Handle multiple Jekyll sites simultaneously
- ✅ **Live Preview** - Development server dengan live reload

## 📋 Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Gemini AI API Key

## ⚡ Quick Start

### 1. Clone dan Setup
```bash
git clone https://github.com/daffadevhosting/jekyll-studio-api.git
cd jekyll-studio-api
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
```bash
cp .env.example .env
# Edit .env dengan your API keys
```

### 4. Start Development Server
```bash
npm run dev
```

### 5. Start dengan Docker
```bash
# Start complete stack
docker-compose -f docker-compose.api.yml up -d

# Start only API + Jekyll
docker-compose -f docker-compose.api.yml up api jekyll redis
```

## 📁 Project Structure

```
jekyll-studio-api/
├── pages/api/                 # Next.js API routes
│   ├── sites/                # Site management endpoints
│   ├── ai/                   # AI generation endpoints
│   └── websocket.ts          # WebSocket server
├── lib/                      # Core libraries
│   ├── gemini.ts            # Gemini AI service
│   ├── jekyll-manager.ts    # Jekyll operations manager
│   └── utils.ts             # Utility functions
├── middleware/               # Security middleware
├── docker/                  # Docker configurations
├── projects/                # Generated Jekyll sites
└── templates/               # Jekyll templates
```

## 🔌 API Endpoints

### Sites Management

#### Create New Site
```http
POST /api/sites/create
Content-Type: application/json

{
  "name": "my-blog",
  "prompt": "Create a personal tech blog with dark theme and syntax highlighting"
}
```

#### List All Sites
```http
GET /api/sites
```

#### Get Site Details
```http
GET /api/sites/[id]
```

#### Delete Site
```http
DELETE /api/sites/[id]
```

### Site Operations

#### Build Site
```http
POST /api/sites/[id]/build
```

#### Start Development Server
```http
POST /api/sites/[id]/serve
Content-Type: application/json

{
  "port": 4001  // optional
}
```

#### Stop Development Server
```http
DELETE /api/sites/[id]/serve
```

### File Management

#### List Files
```http
GET /api/sites/[id]/files?path=/
```

#### Read File
```http
GET /api/sites/[id]/files?path=_config.yml
```

#### Update File
```http
PUT /api/sites/[id]/files
Content-Type: application/json

{
  "filePath": "_posts/2024-01-01-hello-world.md",
  "content": "---\nlayout: post\ntitle: Hello World\n---\n\nContent here..."
}
```

### AI Generation

#### Generate Site Structure
```http
POST /api/ai/generate
Content-Type: application/json

{
  "type": "site",
  "prompt": "Create a portfolio website for a web developer"
}
```

#### Generate Component
```http
POST /api/ai/generate
Content-Type: application/json

{
  "type": "component",
  "prompt": "Create a hero section layout",
  "context": {
    "componentType": "layout"
  }
}
```

#### Generate Styles
```http
POST /api/ai/generate
Content-Type: application/json

{
  "type": "styles",
  "prompt": "Modern dark theme with purple accents"
}
```

#### Improve Content
```http
POST /api/ai/generate
Content-Type: application/json

{
  "type": "improve",
  "prompt": "Make this more engaging",
  "context": {
    "content": "existing content here",
    "improvements": "add more personality and examples"
  }
}
```

## 🔌 WebSocket Events

### Connect to WebSocket
```javascript
const ws = new WebSocket('ws://localhost:8080');

ws.on('message', (data) => {
  const event = JSON.parse(data);
  console.log('Event:', event.type, event.data);
});
```

### Event Types
- `sites` - Initial sites list
- `siteStatusChanged` - Site status updates
- `fileChanged` - File change notifications
- `siteBuilt` - Build completion notifications

## 🛡️ Security Features

### Rate Limiting
- **API Calls**: 100 requests/minute
- **AI Generation**: 10 requests/minute  
- **Site Creation**: 5 sites/5 minutes

### Input Validation
- XSS protection
- SQL injection prevention
- File path traversal protection
- Site name validation

### CORS Configuration
- Configurable allowed origins
- Secure headers
- Credential support

## 🐳 Docker Deployment

### Development
```bash
docker-compose -f docker-compose.api.yml up -d
```

### Production
```bash
# With HTTPS and database
docker-compose -f docker-compose.api.yml --profile production --profile persistence up -d
```

### Services Included
- **API**: Next.js application
- **Jekyll**: Jekyll container for site operations
- **Redis**: Caching and session storage
- **Nginx**: Reverse proxy (production)
- **PostgreSQL**: Data persistence (optional)
- **FileBrowser**: File management UI (optional)

## 🔧 Configuration

### Environment Variables

#### Required
```bash
GEMINI_API_KEY=your_gemini_api_key
NEXTAUTH_SECRET=your_secure_secret
```

#### Optional
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/jekyll_studio

# Redis
REDIS_URL=redis://localhost:6379

# Security
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Email (notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

### Docker Compose Profiles
- **Default**: API + Jekyll + Redis
- **Production**: + Nginx with SSL
- **Persistence**: + PostgreSQL database
- **Tools**: + FileBrowser for file management

## 📊 Usage Examples

### Frontend Integration

#### React/Next.js Frontend
```javascript
// Create new site
async function createSite(prompt) {
  const response = await fetch('/api/sites/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'my-site',
      prompt: prompt
    })
  });
  
  return response.json();
}

// Watch site status
const ws = new WebSocket('ws://localhost:8080');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'siteStatusChanged') {
    updateSiteStatus(data.data);
  }
};
```

#### Vue.js Integration
```javascript
// composables/useSites.js
import { ref, onMounted } from 'vue'

export function useSites() {
  const sites = ref([])
  const loading = ref(false)
  
  const createSite = async (siteData) => {
    loading.value = true
    try {
      const response = await $fetch('/api/sites/create', {
        method: 'POST',
        body: siteData
      })
      sites.value.push(response.site)
      return response
    } finally {
      loading.value = false
    }
  }
  
  const fetchSites = async () => {
    const response = await $fetch('/api/sites')
    sites.value = response.sites
  }
  
  onMounted(fetchSites)
  
  return { sites, createSite, fetchSites, loading }
}
```

### CLI Integration

#### cURL Examples
```bash
# Create site
curl -X POST http://localhost:3000/api/sites/create \
  -H "Content-Type: application/json" \
  -d '{"name": "blog", "prompt": "Create a minimalist blog"}'

# Build site
curl -X POST http://localhost:3000/api/sites/{id}/build

# Update file
curl -X PUT http://localhost:3000/api/sites/{id}/files \
  -H "Content-Type: application/json" \
  -d '{"filePath": "index.md", "content": "# Hello World"}'
```

#### Python Integration
```python
import requests
import json

class JekyllStudioClient:
    def __init__(self, base_url="http://localhost:3000"):
        self.base_url = base_url
    
    def create_site(self, name, prompt):
        response = requests.post(
            f"{self.base_url}/api/sites/create",
            json={"name": name, "prompt": prompt}
        )
        return response.json()
    
    def build_site(self, site_id):
        response = requests.post(
            f"{self.base_url}/api/sites/{site_id}/build"
        )
        return response.json()
    
    def serve_site(self, site_id, port=None):
        data = {"port": port} if port else {}
        response = requests.post(
            f"{self.base_url}/api/sites/{site_id}/serve",
            json=data
        )
        return response.json()

# Usage
client = JekyllStudioClient()
site = client.create_site("my-blog", "Create a tech blog with dark theme")
build_result = client.build_site(site['site']['id'])
serve_result = client.serve_site(site['site']['id'])
```

## 🧪 Testing

### Unit Tests
```bash
npm run test
```

### Integration Tests
```bash
npm run test:integration
```

### API Testing with Postman
Import the Postman collection:
```bash
curl -o jekyll-studio.postman_collection.json \
  https://raw.githubusercontent.com/your-repo/postman-collection.json
```

### Load Testing
```bash
# Install k6
npm install -g k6

# Run load tests
k6 run tests/load-test.js
```

## 🔍 Monitoring & Logging

### Health Checks
```http
GET /api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "services": {
    "jekyll": "running",
    "redis": "connected",
    "database": "connected"
  }
}
```

### Logs
```bash
# View API logs
docker-compose logs -f api

# View Jekyll container logs
docker-compose logs -f jekyll

# View all logs
docker-compose logs -f
```

### Metrics Endpoints
```http
GET /api/metrics
```

## 🚀 Production Deployment

### 1. Environment Setup
```bash
# Production environment
cp .env.example .env.production
# Configure production values
```

### 2. Build Production Image
```bash
docker build -t jekyll-studio-api:latest -f Dockerfile.api .
```

### 3. Deploy with Docker Compose
```bash
# Start production stack
docker-compose -f docker-compose.api.yml --profile production up -d
```

### 4. SSL Configuration
```bash
# Generate SSL certificates (Let's Encrypt)
docker run --rm -v ./nginx/ssl:/etc/letsencrypt \
  certbot/certbot certonly --webroot \
  -w /var/www/certbot -d yourdomain.com
```

### 5. Database Migration (if using PostgreSQL)
```bash
docker-compose exec postgres psql -U jekyll_user -d jekyll_studio -f /app/migrations/init.sql
```

## 🔄 Backup & Recovery

### Database Backup
```bash
# Backup PostgreSQL
docker-compose exec postgres pg_dump -U jekyll_user jekyll_studio > backup.sql

# Restore
docker-compose exec -T postgres psql -U jekyll_user jekyll_studio < backup.sql
```

### Sites Backup
```bash
# Backup all sites
tar -czf sites-backup.tar.gz projects/

# Restore
tar -xzf sites-backup.tar.gz
```

## 🐛 Troubleshooting

### Common Issues

#### 1. Gemini AI Error
```
Error: GEMINI_API_KEY is required
```
**Solution**: Set your Gemini API key in `.env`

#### 2. Docker Permission Error
```
Error: Permission denied accessing /var/run/docker.sock
```
**Solution**: Add user to docker group
```bash
sudo usermod -aG docker $USER
```

#### 3. Port Already in Use
```
Error: Port 3000 is already in use
```
**Solution**: Change port in `.env` or stop conflicting service

#### 4. Jekyll Build Failed
**Check logs**:
```bash
docker-compose logs jekyll
```

### Debug Mode
```bash
# Enable debug logging
DEBUG=jekyll-studio:* npm run dev
```

## 🤝 Contributing

### Development Setup
```bash
# Clone repository
git clone https://github.com/daffadevhosting/jekyll-studio-api.git
cd jekyll-studio-api

# Install dependencies
npm install

# Start development environment
npm run dev

# Run tests
npm test
```

### Code Style
- ESLint configuration
- Prettier formatting
- TypeScript strict mode

### Pull Request Process
1. Fork repository
2. Create feature branch
3. Add tests for new features
4. Ensure all tests pass
5. Update documentation
6. Submit pull request

## 📝 License

CC0 1.0 Universal License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Frontend Repository**: [Jekyll Studio Frontend](https://github.com/your-org/jekyll-studio-frontend)
- **Docker Images**: [Docker Hub](https://hub.docker.com/r/your-org/jekyll-studio)
- **Documentation**: [Full Documentation](https://docs.jekyll-studio.com)
- **Issues**: [GitHub Issues](https://github.com/your-org/jekyll-studio-api/issues)