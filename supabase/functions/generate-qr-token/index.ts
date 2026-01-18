/**
 * Generate QR Token Edge Function
 * 
 * POST /functions/v1/generate-qr-token
 * 
 * Body: {
 *   ticket_id: string,
 *   mode?: 'A' | 'B' (default: 'A'),
 *   rotation_interval?: number (default: 60, for Mode B)
 * }
 * 
 * Returns: {
 *   token: string (base64url-encoded),
 *   expires_at: number (Unix timestamp),
 *   mode: 'A' | 'B'
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TokenRequest {
  ticket_id: string;
  mode?: 'A' | 'B';
  rotation_interval?: number;
}

function base64urlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
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

    // Get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: TokenRequest = await req.json();
    const { ticket_id, mode = 'A', rotation_interval = 60 } = body;

    if (!ticket_id) {
      return new Response(
        JSON.stringify({ error: 'Missing ticket_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate token using database function
    let tokenJson: any;
    let expiresAt: number;

    if (mode === 'A') {
      const { data, error } = await supabase.rpc('generate_qr_token_mode_a', {
        p_ticket_id: ticket_id,
      });

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Failed to generate token', details: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      tokenJson = data;
      // Mode A: expires 24 hours from issued_at
      expiresAt = tokenJson.i + (24 * 60 * 60);
    } else {
      const { data, error } = await supabase.rpc('generate_qr_token_mode_b', {
        p_ticket_id: ticket_id,
        p_rotation_interval: rotation_interval,
      });

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Failed to generate token', details: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      tokenJson = data;
      // Mode B: expires at next rotation window
      expiresAt = tokenJson.expires_at || (tokenJson.w + rotation_interval);
    }

    // Encode token as base64url
    const tokenString = base64urlEncode(JSON.stringify(tokenJson));

    return new Response(
      JSON.stringify({
        token: tokenString,
        expires_at: expiresAt,
        mode: mode,
        refresh_interval: mode === 'B' ? rotation_interval : null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Token generation error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
