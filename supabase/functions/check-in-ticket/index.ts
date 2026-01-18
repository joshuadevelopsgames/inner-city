/**
 * Check-In Ticket Edge Function
 * 
 * POST /functions/v1/check-in-ticket
 * 
 * Body: {
 *   token: string (base64url-encoded QR token),
 *   event_id: string,
 *   device_id?: string,
 *   location?: { lat: number, lng: number }
 * }
 * 
 * Flow:
 * 1. Validate QR token
 * 2. Verify ticket belongs to event
 * 3. Check ticket status (must be 'active')
 * 4. Atomically mark ticket as 'used'
 * 5. Log check-in (immutable)
 * 
 * Returns: {
 *   success: boolean,
 *   ticket_id: string,
 *   checked_in_at: string
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CheckInRequest {
  token: string; // Base64URL-encoded QR token
  event_id: string;
  device_id?: string;
  location?: {
    lat: number;
    lng: number;
  };
}

function base64urlDecode(str: string): string {
  let padded = str;
  while (padded.length % 4) {
    padded += '=';
  }
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

    const body: CheckInRequest = await req.json();
    const { token: tokenString, event_id, device_id, location } = body;

    if (!tokenString || !event_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: token, event_id' }),
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
          success: false, 
          error: 'Invalid token format',
          details: e.message 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate token using database function
    const { data: validationResult, error: validationError } = await supabase.rpc(
      'validate_qr_token',
      {
        p_token: tokenJson,
        p_rotation_interval: 60,
      }
    );

    if (validationError) {
      console.error('Token validation error:', validationError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Token validation failed',
          details: validationError.message 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!validationResult || validationResult.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Validation returned no result' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validation = validationResult[0];

    if (!validation.valid) {
      // Log invalid scan attempt
      await supabase.from('check_in_logs').insert({
        ticket_id: validation.ticket_id,
        event_id: event_id,
        scanner_user_id: user.id,
        scanner_device_id: device_id || `device-${user.id}`,
        qr_secret: tokenJson.t || 'unknown',
        qr_nonce: tokenJson.n || tokenJson.r || 0,
        result: 'invalid',
        reason: validation.reason,
        location_lat: location?.lat,
        location_lng: location?.lng,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: validation.reason,
          ticket_id: validation.ticket_id 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ticketId = validation.ticket_id;

    // Verify ticket belongs to event
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, event_id, status')
      .eq('id', ticketId)
      .eq('event_id', event_id)
      .single();

    if (ticketError || !ticket) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Ticket not found or does not belong to this event' 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check ticket status (double-check, validation should have caught this)
    if (ticket.status !== 'active') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Ticket status is ${ticket.status}, cannot check in` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Atomically update ticket status and log check-in
    // Use a transaction-like approach with SELECT FOR UPDATE
    const { error: updateError } = await supabase.rpc('check_in_ticket_atomic', {
      p_ticket_id: ticketId,
      p_event_id: event_id,
      p_scanner_user_id: user.id,
      p_scanner_device_id: device_id || `device-${user.id}`,
      p_qr_secret: tokenJson.t || ticketId,
      p_qr_nonce: tokenJson.n || tokenJson.r || 0,
      p_location_lat: location?.lat,
      p_location_lng: location?.lng,
    });

    if (updateError) {
      // Check if it's a "already checked in" error
      if (updateError.message.includes('already') || updateError.message.includes('used')) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Ticket already checked in',
            ticket_id: ticketId 
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.error('Check-in error:', updateError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to check in ticket',
          details: updateError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get check-in timestamp
    const { data: checkInLog } = await supabase
      .from('check_in_logs')
      .select('created_at')
      .eq('ticket_id', ticketId)
      .eq('result', 'valid')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        ticket_id: ticketId,
        checked_in_at: checkInLog?.created_at || new Date().toISOString(),
        mode: validation.mode,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
