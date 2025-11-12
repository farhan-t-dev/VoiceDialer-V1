import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

interface CampaignStatusUpdate {
  type: 'campaign_status_update';
  campaignId: string;
  status: string;
  timestamp: number;
}

interface LoginRequiredAlert {
  type: 'login_required';
  campaignId: string;
  campaignName: string;
  timestamp: number;
}

class CampaignWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private cleanupInterval: NodeJS.Timeout | null = null;

  initialize(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WebSocket] Client connected');
      this.clients.add(ws);

      ws.on('close', () => {
        console.log('[WebSocket] Client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('[WebSocket] Error:', error);
        this.clients.delete(ws);
      });

      // Send initial connection confirmation
      ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
    });

    // Periodically clean up stale connections (every 30 seconds)
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleConnections();
    }, 30000);

    console.log('[WebSocket] Server initialized on path /ws');
  }

  /**
   * Remove connections that are not in OPEN state
   */
  private cleanupStaleConnections() {
    let removedCount = 0;
    this.clients.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN) {
        this.clients.delete(client);
        removedCount++;
        // Try to close the connection if it's still lingering
        try {
          client.terminate();
        } catch (error) {
          // Ignore errors during cleanup
        }
      }
    });
    
    if (removedCount > 0) {
      console.log(`[WebSocket] Cleaned up ${removedCount} stale connections (active: ${this.clients.size})`);
    }
  }

  /**
   * Broadcast campaign status update to all connected clients
   */
  broadcastCampaignStatusUpdate(campaignId: string, status: string) {
    const message: CampaignStatusUpdate = {
      type: 'campaign_status_update',
      campaignId,
      status,
      timestamp: Date.now(),
    };

    const payload = JSON.stringify(message);
    let successCount = 0;
    let failureCount = 0;

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
          successCount++;
        } catch (error) {
          console.error('[WebSocket] Failed to send to client:', error);
          failureCount++;
        }
      }
    });

    console.log(`[WebSocket] Broadcast campaign ${campaignId} status update: ${status} (sent to ${successCount} clients, ${failureCount} failed)`);
  }

  /**
   * Broadcast LOGIN REQUIRED alert to all connected clients
   * This is a high-priority notification for immediate user attention
   */
  broadcastLoginRequired(campaignId: string, campaignName: string) {
    const message: LoginRequiredAlert = {
      type: 'login_required',
      campaignId,
      campaignName,
      timestamp: Date.now(),
    };

    const payload = JSON.stringify(message);
    let successCount = 0;
    let failureCount = 0;

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
          successCount++;
        } catch (error) {
          console.error('[WebSocket] Failed to send login alert:', error);
          failureCount++;
        }
      }
    });

    console.log(`[WebSocket] Login alert broadcast: ${campaignName} (sent to ${successCount} clients, ${failureCount} failed)`);
  }

  /**
   * Get the number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Shutdown the WebSocket server and clean up resources
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all client connections
    this.clients.forEach((client) => {
      try {
        client.close();
      } catch (error) {
        // Ignore errors during shutdown
      }
    });
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    console.log('[WebSocket] Server shutdown complete');
  }
}

// Singleton instance
export const campaignWebSocket = new CampaignWebSocketServer();
