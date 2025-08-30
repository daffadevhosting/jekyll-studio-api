// pages/api/websocket.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import JekyllManager from '../../lib/jekyll-manager';
import { applySecurityMiddleware } from '../../middleware/cors-rate-limit';
 
const jekyllManager = new JekyllManager();

interface ExtendedWebSocket extends WebSocket {
  id: string;
  isAlive: boolean;
  subscribedSites: Set<string>;
}

interface WebSocketMessage {
  type: string;
  data?: any;
  siteId?: string;
  timestamp?: string;
}

class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Set<ExtendedWebSocket> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.setupJekyllManagerListeners();
  }

// Replace the initialize method
initialize(server: any): void {
  if (this.wss) {
    console.log('WebSocket server already running');
    return;
  }

  // Use the provided HTTP server instead of creating a separate one
  this.wss = new WebSocketServer({ 
    server: server,
    verifyClient: this.verifyClient.bind(this)
  });

  this.wss.on('connection', this.handleConnection.bind(this));
  this.startHeartbeat();
  
  console.log(`WebSocket server attached to HTTP server`);
}

  private verifyClient(info: { origin: string; secure: boolean; req: IncomingMessage }): boolean {
    // Simple origin check for development
    if (process.env.NODE_ENV === 'development') {
      return true;
    }
    
    // In production, check allowed origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    return allowedOrigins.includes(info.origin);
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const extWs = ws as ExtendedWebSocket;
    extWs.id = this.generateClientId();
    extWs.isAlive = true;
    extWs.subscribedSites = new Set();
    
    this.clients.add(extWs);
    console.log(`WebSocket client connected: ${extWs.id} (${this.clients.size} total)`);

    // Send initial data
    this.sendToClient(extWs, {
      type: 'connected',
      data: {
        clientId: extWs.id,
        serverTime: new Date().toISOString()
      }
    });

    // Send current sites list
    const sites = jekyllManager.getAllSites();
    this.sendToClient(extWs, {
      type: 'sites',
      data: sites
    });

    // Handle incoming messages
    extWs.on('message', (message: Buffer) => {
      this.handleMessage(extWs, message);
    });

    // Handle pong for heartbeat
    extWs.on('pong', () => {
      extWs.isAlive = true;
    });

    // Handle disconnection
    extWs.on('close', (code: number, reason: Buffer) => {
      console.log(`WebSocket client disconnected: ${extWs.id} (code: ${code})`);
      this.clients.delete(extWs);
    });

    // Handle errors
    extWs.on('error', (error: Error) => {
      console.error(`WebSocket error for client ${extWs.id}:`, error);
      this.clients.delete(extWs);
    });
  }

  private handleMessage(ws: ExtendedWebSocket, message: Buffer): void {
    try {
      const data: WebSocketMessage = JSON.parse(message.toString());
      
      switch (data.type) {
        case 'ping':
          this.sendToClient(ws, { type: 'pong' });
          break;
          
        case 'subscribe':
          if (data.siteId) {
            ws.subscribedSites.add(data.siteId);
            this.sendToClient(ws, {
              type: 'subscribed',
              data: { siteId: data.siteId }
            });
            console.log(`Client ${ws.id} subscribed to site ${data.siteId}`);
          }
          break;
          
        case 'unsubscribe':
          if (data.siteId) {
            ws.subscribedSites.delete(data.siteId);
            this.sendToClient(ws, {
              type: 'unsubscribed',
              data: { siteId: data.siteId }
            });
            console.log(`Client ${ws.id} unsubscribed from site ${data.siteId}`);
          }
          break;
          
        case 'getSites':
          const sites = jekyllManager.getAllSites();
          this.sendToClient(ws, {
            type: 'sites',
            data: sites
          });
          break;
          
        default:
          console.log(`Unknown WebSocket message type: ${data.type}`);
          this.sendToClient(ws, {
            type: 'error',
            data: { message: 'Unknown message type' }
          });
      }
    } catch (error: any) {
      console.error(`Error handling WebSocket message from ${ws.id}:`, error);
      this.sendToClient(ws, {
        type: 'error',
        data: { message: 'Invalid message format' }
      });
    }
  }

  private sendToClient(ws: ExtendedWebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        const messageWithTimestamp = {
          ...message,
          timestamp: new Date().toISOString()
        };
        ws.send(JSON.stringify(messageWithTimestamp));
      } catch (error: any) {
        console.error(`Error sending message to client ${ws.id}:`, error);
      }
    }
  }

  private broadcast(message: WebSocketMessage, filterFn?: (ws: ExtendedWebSocket) => boolean): void {
    this.clients.forEach(ws => {
      if (!filterFn || filterFn(ws)) {
        this.sendToClient(ws, message);
      }
    });
  }

  private broadcastToSiteSubscribers(siteId: string, message: WebSocketMessage): void {
    this.broadcast(message, (ws) => ws.subscribedSites.has(siteId));
  }

  private setupJekyllManagerListeners(): void {
    jekyllManager.on('siteStatusChanged', (site) => {
      this.broadcast({
        type: 'siteStatusChanged',
        data: site,
        siteId: site.id
      });
    });

    jekyllManager.on('fileChanged', ({ site, filePath }) => {
      this.broadcastToSiteSubscribers(site.id, {
        type: 'fileChanged',
        data: { site, filePath },
        siteId: site.id
      });
    });

    jekyllManager.on('siteBuilt', (site) => {
      this.broadcast({
        type: 'siteBuilt',
        data: site,
        siteId: site.id
      });
    });

    jekyllManager.on('siteCreated', (site) => {
      this.broadcast({
        type: 'siteCreated',
        data: site,
        siteId: site.id
      });
    });

    jekyllManager.on('siteDeleted', (site) => {
      this.broadcast({
        type: 'siteDeleted',
        data: site,
        siteId: site.id
      });
    });

    jekyllManager.on('siteServing', (site) => {
      this.broadcast({
        type: 'siteServing',
        data: site,
        siteId: site.id
      });
    });

    jekyllManager.on('siteStopped', (site) => {
      this.broadcast({
        type: 'siteStopped',
        data: site,
        siteId: site.id
      });
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach(ws => {
        if (!ws.isAlive) {
          console.log(`Terminating inactive client: ${ws.id}`);
          ws.terminate();
          this.clients.delete(ws);
          return;
        }
        
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // 30 seconds
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getStats(): { totalClients: number; clientsBySubscriptions: Record<string, number> } {
    const clientsBySubscriptions: Record<string, number> = {};
    
    this.clients.forEach(ws => {
      ws.subscribedSites.forEach(siteId => {
        clientsBySubscriptions[siteId] = (clientsBySubscriptions[siteId] || 0) + 1;
      });
    });
    
    return {
      totalClients: this.clients.size,
      clientsBySubscriptions
    };
  }

  cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.clients.forEach(ws => {
      ws.close();
    });
    
    if (this.wss) {
      this.wss.close();
    }
  }
}

// Global WebSocket manager instance
let wsManager: WebSocketManager | null = null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apply security middleware
  const securityPassed = await applySecurityMiddleware(req, res, {
    rateLimitType: 'api',
    skipCors: true // WebSocket upgrade doesn't need CORS
  });
  
  if (!securityPassed) return;

  if (req.method === 'GET') {
    // HTTP endpoint to get WebSocket statistics
    if (!wsManager) {
      return res.status(503).json({
        success: false,
        error: 'WebSocket server not initialized'
      });
    }

    const stats = wsManager.getStats();
    res.json({
      success: true,
      websocket: {
        status: 'running',
        port: process.env.WS_PORT || 8080,
        clients: stats.totalClients,
        subscriptions: stats.clientsBySubscriptions,
        ...stats
      }
    });
  } else if (req.method === 'POST') {
    // Initialize WebSocket server
    try {
      if (!wsManager) {
        wsManager = new WebSocketManager();
        wsManager.initialize(null);
      }

      res.json({
        success: true,
        message: 'WebSocket server initialized',
        port: process.env.WS_PORT || 8080
      });
    } catch (error: any) {
      console.error('Error initializing WebSocket server:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  } else if (req.method === 'DELETE') {
    // Cleanup WebSocket server
    try {
      if (wsManager) {
        wsManager.cleanup();
        wsManager = null;
      }

      res.json({
        success: true,
        message: 'WebSocket server stopped'
      });
    } catch (error: any) {
      console.error('Error stopping WebSocket server:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

// Auto-initialize WebSocket server
if (!wsManager) {
  wsManager = new WebSocketManager();
  // Standalone server langsung di port 8080
  wsManager.initializeStandalone();
}

// Tambahin method baru di class WebSocketManager
initializeStandalone(): void {
  if (this.wss) {
    console.log('WebSocket server already running');
    return;
  }

  this.wss = new WebSocketServer({ port: 8080 });
  this.wss.on('connection', this.handleConnection.bind(this));
  this.startHeartbeat();

  console.log('WebSocket server listening on ws://localhost:8080');
}

// Cleanup on process exit
process.on('SIGINT', () => {
  console.log('Shutting down WebSocket server...');
  wsManager?.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down WebSocket server...');
  wsManager?.cleanup();
  process.exit(0);
});