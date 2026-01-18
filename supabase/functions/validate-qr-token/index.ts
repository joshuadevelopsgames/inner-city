/**
 * QR Token Validation Edge Function
 * 
 * POST /functions/v1/validate-qr-token
 * 
 * Body: {
 *   token: string (base64url-encoded JSON token)
 *   rotation_interval?: number (default: 60, for Mode B)
 * }
 * 
 * Returns: {
 *   valid: boolean,
 *   ticket_id: string,
 *   reason: string,
 *   mode: 'A' | 'B'
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidationRequest {
  token: string; // Base64URL-encoded JSON token
  rotation_interval?: number;
}

function base64urlDecode(str: string): string {
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

function parseToken(tokenString: string): any {
  try {
    const decoded = base64urlDecode(tokenString);
    return JSON.parse(decoded);
  } catch (e) {
    throw new Error('Invalid token format');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get scanner user (staff member)
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: ValidationRequest = await req.json();
    const { token: tokenString, rotation_interval = 60 } = body;

    if (!tokenString) {
      return new Response(
        JSON.stringify({ error: 'Missing token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse token
    let tokenJson: any;
    try {
      tokenJson = parseToken(tokenString);
    } catch (e: any) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          reason: e.message || 'Invalid token format',
          ticket_id: null,
          mode: null
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate token using database function
    const { data: validationResult, error: validationError } = await supabase.rpc(
      'validate_qr_token',
      {
        p_token: tokenJson,
        p_rotation_interval: rotation_interval,
      }
    );

    if (validationError) {
      console.error('Validation error:', validationError);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          reason: validationError.message,
          ticket_id: null,
          mode: null
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!validationResult || validationResult.length === 0) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          reason: 'Validation returned no result',
          ticket_id: null,
          mode: null
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = validationResult[0];

    // If valid, log the check-in attempt (will be finalized by check-in function)
    if (result.valid) {
      // Get device ID from headers or generate
      const deviceId = req.headers.get('x-device-id') || `device-${user.id}`;
      
      // Log scan attempt (for analytics)
      await supabase.from('check_in_logs').insert({
        ticket_id: result.ticket_id,
        event_id: null, // Will be set by check-in function
        scanner_user_id: user.id,
        scanner_device_id: deviceId,
        qr_secret: tokenJson.t || tokenJson.ticket_id, // Snapshot
        qr_nonce: tokenJson.n || tokenJson.r || 0,
        result: 'valid',
        reason: 'Token validated successfully',
      });
    } else {
      // Log invalid scan attempt
      const deviceId = req.headers.get('x-device-id') || `device-${user.id}`;
      
      await supabase.from('check_in_logs').insert({
        ticket_id: result.ticket_id || null,
        event_id: null,
        scanner_user_id: user.id,
        scanner_device_id: deviceId,
        qr_secret: tokenJson.t || tokenJson.ticket_id || 'unknown',
        qr_nonce: tokenJson.n || tokenJson.r || 0,
        result: 'invalid',
        reason: result.reason || 'Unknown error',
      });
    }

    return new Response(
      JSON.stringify({
        valid: result.valid,
        ticket_id: result.ticket_id,
        reason: result.reason,
        mode: result.mode || (tokenJson.w ? 'B' : 'A'),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        valid: false, 
        reason: 'Internal server error',
        details: error.message,
        ticket_id: null,
        mode: null
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
