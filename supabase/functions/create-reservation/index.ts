/**
 * Create Reservation Edge Function
 * 
 * POST /functions/v1/create-reservation
 * 
 * Body: {
 *   event_id: string,
 *   ticket_type_id?: string,
 *   quantity: number,
 *   expires_in_minutes?: number (default: 10)
 * }
 * 
 * Returns: { reservation_id: string } or error
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReservationRequest {
  event_id: string;
  ticket_type_id?: string;
  quantity: number;
  expires_in_minutes?: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: ReservationRequest = await req.json();
    const { event_id, ticket_type_id, quantity, expires_in_minutes = 10 } = body;

    // Validate input
    if (!event_id || !quantity || quantity <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: event_id and quantity (positive) required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (quantity > 10) {
      return new Response(
        JSON.stringify({ error: 'Maximum 10 tickets per reservation' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify event exists and is active
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, status, start_at')
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (event.status !== 'active') {
      return new Response(
        JSON.stringify({ error: 'Event is not active' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if event hasn't started
    if (new Date(event.start_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'Event has already started' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create reservation atomically using SQL function
    const { data: reservationResult, error: reservationError } = await supabase.rpc(
      'create_reservation',
      {
        p_event_id: event_id,
        p_ticket_type_id: ticket_type_id || null,
        p_user_id: user.id,
        p_quantity: quantity,
        p_expires_in_minutes: expires_in_minutes,
      }
    );

    if (reservationError) {
      console.error('Reservation error:', reservationError);
      return new Response(
        JSON.stringify({ error: 'Failed to create reservation', details: reservationError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!reservationResult) {
      // NULL means insufficient inventory
      return new Response(
        JSON.stringify({ error: 'Insufficient inventory available' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get reservation details
    const { data: reservation, error: fetchError } = await supabase.rpc(
      'get_reservation',
      { p_reservation_id: reservationResult }
    );

    if (fetchError || !reservation || reservation.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch reservation details' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        reservation_id: reservationResult,
        expires_at: reservation[0].expires_at,
        quantity: reservation[0].quantity,
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
