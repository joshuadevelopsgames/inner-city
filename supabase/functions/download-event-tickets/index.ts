/**
 * Download Event Tickets Edge Function
 * 
 * GET /functions/v1/download-event-tickets?event_id=xxx
 * 
 * Returns cached ticket data for offline scanner:
 * - All tickets for event
 * - QR secrets and rotation nonces
 * - Ticket statuses
 * - Event metadata
 * 
 * Requires: Staff/Organizer authentication
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

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

    // Get authenticated user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get event_id from query params
    const url = new URL(req.url);
    const eventId = url.searchParams.get('event_id');

    if (!eventId) {
      return new Response(
        JSON.stringify({ error: 'Missing event_id parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is staff/organizer for this event
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select(`
        id,
        title,
        start_at,
        end_at,
        organizer_id,
        organizers!inner(id, user_id)
      `)
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is organizer or staff
    const isOrganizer = event.organizers.user_id === user.id;
    
    // TODO: Check if user is staff (add staff table/relationship)
    // For now, only organizers can download
    if (!isOrganizer) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Must be event organizer or staff' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all tickets for event
    const { data: tickets, error: ticketsError } = await supabase
      .from('tickets')
      .select(`
        id,
        event_id,
        buyer_id,
        ticket_type,
        status,
        qr_secret,
        qr_rotation_nonce,
        created_at
      `)
      .eq('event_id', eventId);

    if (ticketsError) {
      console.error('Error fetching tickets:', ticketsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch tickets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format tickets for cache
    const cachedTickets = tickets.map(ticket => ({
      ticket_id: ticket.id,
      event_id: ticket.event_id,
      qr_secret: ticket.qr_secret,
      qr_rotation_nonce: ticket.qr_rotation_nonce || 0,
      status: ticket.status,
      buyer_id: ticket.buyer_id,
      ticket_type: ticket.ticket_type,
      cached_at: Math.floor(Date.now() / 1000),
    }));

    // Calculate expiration (1 hour after event ends)
    const endTime = new Date(event.end_at).getTime();
    const expiresAt = Math.floor((endTime + 60 * 60 * 1000) / 1000); // +1 hour

    return new Response(
      JSON.stringify({
        event_id: event.id,
        event_title: event.title,
        start_at: event.start_at,
        end_at: event.end_at,
        tickets: cachedTickets,
        synced_at: Math.floor(Date.now() / 1000),
        expires_at: expiresAt,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
