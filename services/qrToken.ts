/**
 * QR Token Client-Side Utilities
 * Handles token generation, encoding, and refresh logic
 */

export type QRTokenMode = 'A' | 'B';

export interface QRTokenModeA {
  t: string; // ticket_id
  i: number; // issued_at
  n: string; // nonce
  s: string; // signature
  mode: 'A';
}

export interface QRTokenModeB {
  t: string; // ticket_id
  w: number; // time_window
  r: number; // rotation_nonce
  s: string; // signature
  mode: 'B';
  expires_at: number;
}

export type QRToken = QRTokenModeA | QRTokenModeB;

/**
 * Base64URL encoding/decoding
 */
export function base64urlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function base64urlDecode(str: string): string {
  // Add padding if needed
  let padded = str;
  while (padded.length % 4) {
    padded += '=';
  }
  
  // Replace URL-safe characters
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  
  try {
    return atob(base64);
  } catch (e) {
    throw new Error('Invalid base64url encoding');
  }
}

/**
 * Parse QR token from base64url string
 */
export function parseQRToken(tokenString: string): QRToken {
  try {
    const decoded = base64urlDecode(tokenString);
    const parsed = JSON.parse(decoded);
    
    // Detect mode
    if (parsed.w !== undefined) {
      return parsed as QRTokenModeB;
    } else {
      return parsed as QRTokenModeA;
    }
  } catch (e) {
    throw new Error('Invalid token format');
  }
}

/**
 * Check if token is expired
 */
export function isTokenExpired(token: QRToken): boolean {
  const now = Math.floor(Date.now() / 1000);
  
  if (token.mode === 'A') {
    // Mode A: expires 24 hours after issued_at
    const expiresAt = token.i + (24 * 60 * 60);
    return now >= expiresAt;
  } else {
    // Mode B: expires at expires_at timestamp
    return now >= token.expires_at;
  }
}

/**
 * Get time until token expires (seconds)
 */
export function getTokenTTL(token: QRToken): number {
  const now = Math.floor(Date.now() / 1000);
  
  if (token.mode === 'A') {
    const expiresAt = token.i + (24 * 60 * 60);
    return Math.max(0, expiresAt - now);
  } else {
    return Math.max(0, token.expires_at - now);
  }
}

/**
 * QR Token Manager (for Mode B rotation)
 */
export class QRTokenManager {
  private ticketId: string;
  private mode: QRTokenMode;
  private currentToken: QRToken | null = null;
  private refreshTimer: number | null = null;
  private onTokenUpdate: (token: string) => void;
  private supabase: any;
  private rotationInterval: number;

  constructor(
    ticketId: string,
    mode: QRTokenMode,
    supabaseClient: any,
    onTokenUpdate: (token: string) => void,
    rotationInterval: number = 60
  ) {
    this.ticketId = ticketId;
    this.mode = mode;
    this.supabase = supabaseClient;
    this.onTokenUpdate = onTokenUpdate;
    this.rotationInterval = rotationInterval;
  }

  /**
   * Start token refresh loop (Mode B only)
   */
  async start(): Promise<void> {
    if (this.mode !== 'B') {
      // Mode A doesn't need refresh
      await this.refresh();
      return;
    }

    // Initial token
    await this.refresh();

    // Set up refresh timer (refresh 5 seconds before expiration)
    const refreshDelay = (this.rotationInterval - 5) * 1000;
    
    this.refreshTimer = window.setInterval(async () => {
      try {
        await this.refresh();
      } catch (error) {
        console.error('Token refresh failed:', error);
        // Retry after 5 seconds
        setTimeout(() => this.refresh(), 5000);
      }
    }, refreshDelay);
  }

  /**
   * Stop token refresh
   */
  stop(): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Refresh token from server
   */
  async refresh(): Promise<string> {
    const { data, error } = await this.supabase.functions.invoke('generate-qr-token', {
      body: {
        ticket_id: this.ticketId,
        mode: this.mode,
        rotation_interval: this.rotationInterval,
      },
    });

    if (error) {
      throw new Error(`Failed to generate token: ${error.message}`);
    }

    this.currentToken = parseQRToken(data.token);
    
    // Notify listener
    this.onTokenUpdate(data.token);
    
    return data.token;
  }

  /**
   * Get current token
   */
  getCurrentToken(): string | null {
    if (!this.currentToken) {
      return null;
    }

    // Re-encode current token
    return base64urlEncode(JSON.stringify(this.currentToken));
  }

  /**
   * Check if token needs refresh (Mode B)
   */
  shouldRefresh(): boolean {
    if (this.mode !== 'B' || !this.currentToken) {
      return false;
    }

    const ttl = getTokenTTL(this.currentToken);
    // Refresh if less than 10 seconds remaining
    return ttl < 10;
  }
}

/**
 * Generate QR code data URL from token string
 */
export async function generateQRCodeDataURL(
  tokenString: string,
  size: number = 256
): Promise<string> {
  // Use a QR code library (e.g., qrcode.js)
  // This is a placeholder - you'll need to install a QR code library
  
  // Example with qrcode library:
  // import QRCode from 'qrcode';
  // return await QRCode.toDataURL(tokenString, { width: size });
  
  // For now, return a placeholder
  // In production, use: npm install qrcode
  throw new Error('QR code generation requires qrcode library. Install: npm install qrcode');
}

/**
 * React hook for QR token management
 * Note: Requires React import - uncomment if using in React component
 */
/*
import { useState, useEffect, useRef, useCallback } from 'react';

export function useQRToken(
  ticketId: string,
  mode: QRTokenMode = 'A',
  supabaseClient: any
): {
  token: string | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
} {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const managerRef = useRef<QRTokenManager | null>(null);

  useEffect(() => {
    if (!ticketId) return;

    const manager = new QRTokenManager(
      ticketId,
      mode,
      supabaseClient,
      (newToken) => {
        setToken(newToken);
        setIsLoading(false);
        setError(null);
      },
      60 // rotation interval
    );

    managerRef.current = manager;

    manager.start().catch((err) => {
      setError(err);
      setIsLoading(false);
    });

    return () => {
      manager.stop();
    };
  }, [ticketId, mode, supabaseClient]);

  const refresh = useCallback(async () => {
    if (managerRef.current) {
      setIsLoading(true);
      try {
        await managerRef.current.refresh();
      } catch (err: any) {
        setError(err);
      } finally {
        setIsLoading(false);
      }
    }
  }, []);

  return { token, isLoading, error, refresh };
}
*/

// For non-React usage, use QRTokenManager class directly
