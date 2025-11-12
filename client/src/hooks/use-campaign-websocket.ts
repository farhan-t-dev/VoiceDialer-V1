import { useEffect, useRef, useCallback } from 'react';
import { queryClient } from '@/lib/queryClient';

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

interface UseCampaignWebSocketOptions {
  onLoginRequired?: (campaignId: string, campaignName: string) => void;
}

/**
 * Custom hook for WebSocket connection to receive real-time campaign status updates
 * Automatically handles reconnection and invalidates queries when status changes
 */
export function useCampaignWebSocket(options?: UseCampaignWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const onLoginRequiredRef = useRef(options?.onLoginRequired);
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 1000; // Start with 1 second

  // Update ref when callback changes
  useEffect(() => {
    onLoginRequiredRef.current = options?.onLoginRequired;
  }, [options?.onLoginRequired]);

  const connect = useCallback(() => {
    // Clear any pending reconnection attempts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Don't reconnect if we've exceeded max attempts
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.log('[WebSocket] Max reconnection attempts reached, giving up');
      return;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      console.log('[WebSocket] Connecting to', wsUrl);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WebSocket] Connected successfully');
        reconnectAttemptsRef.current = 0; // Reset reconnect counter on successful connection
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'campaign_status_update') {
            const update = data as CampaignStatusUpdate;
            console.log(`[WebSocket] Campaign ${update.campaignId} status changed to: ${update.status}`);
            
            // Update campaign detail cache directly
            queryClient.setQueryData(['/api/campaigns', update.campaignId], (oldData: any) => {
              if (oldData) {
                return { ...oldData, status: update.status };
              }
              return oldData;
            });
            
            // Update campaigns list cache directly to avoid refetch
            queryClient.setQueryData(['/api/campaigns'], (oldData: any) => {
              if (Array.isArray(oldData)) {
                return oldData.map((campaign: any) => 
                  campaign.id === update.campaignId 
                    ? { ...campaign, status: update.status }
                    : campaign
                );
              }
              return oldData;
            });
          } else if (data.type === 'login_required') {
            const alert = data as LoginRequiredAlert;
            console.log(`[WebSocket] 🚨 LOGIN REQUIRED for campaign ${alert.campaignName}`);
            
            // Call the login required callback if provided
            if (onLoginRequiredRef.current) {
              onLoginRequiredRef.current(alert.campaignId, alert.campaignName);
            }
            
            // Update campaign detail cache directly
            queryClient.setQueryData(['/api/campaigns', alert.campaignId], (oldData: any) => {
              if (oldData) {
                return { ...oldData, status: 'waiting_for_login' };
              }
              return oldData;
            });
            
            // Update campaigns list cache directly
            queryClient.setQueryData(['/api/campaigns'], (oldData: any) => {
              if (Array.isArray(oldData)) {
                return oldData.map((campaign: any) => 
                  campaign.id === alert.campaignId 
                    ? { ...campaign, status: 'waiting_for_login' }
                    : campaign
                );
              }
              return oldData;
            });
          } else if (data.type === 'connected') {
            console.log('[WebSocket] Connection confirmed');
          }
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      ws.onclose = () => {
        console.log('[WebSocket] Connection closed');
        wsRef.current = null;
        
        // Attempt to reconnect with exponential backoff
        reconnectAttemptsRef.current++;
        const delay = Math.min(
          baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1),
          30000 // Max 30 seconds
        );
        
        console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[WebSocket] Failed to create connection:', error);
      
      // Retry connection
      reconnectAttemptsRef.current++;
      const delay = Math.min(
        baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1),
        30000
      );
      
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    }
  }, []);

  useEffect(() => {
    // Connect on mount
    connect();

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
