/**
 * Schedule Payout Edge Function
 * 
 * POST /functions/v1/schedule-payout
 * 
 * Schedules a payout for an event based on trust tier and payout rules.
 * 
 * Body: {
 *   event_id: string (optional, for event-specific payout)
 *   organizer_id: string (required)
 *   amount_cents: number (optional, defaults to available_for_payout)
 * }
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

    // Verify user is organizer
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { event_id, organizer_id, amount_cents } = body;

    // Verify organizer
    const finalOrganizerId = organizer_id || user.id;
    const { data: organizer, error: orgError } = await supabase
      .from('organizers')
      .select('id, stripe_connect_account_id, payout_enabled, trust_tier')
      .eq('id', finalOrganizerId)
      .single();

    if (orgError || !organizer) {
      return new Response(
        JSON.stringify({ error: 'Organizer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!organizer.payout_enabled || !organizer.stripe_connect_account_id) {
      return new Response(
        JSON.stringify({ error: 'Payouts not enabled for this organizer' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If event_id provided, verify event belongs to organizer
    if (event_id) {
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id, organizer_id, title, end_at')
        .eq('id', event_id)
        .eq('organizer_id', finalOrganizerId)
        .single();

      if (eventError || !event) {
        return new Response(
          JSON.stringify({ error: 'Event not found or does not belong to organizer' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Calculate available amount
      const { data: ledger } = await supabase
        .from('event_ledger')
        .select('available_for_payout_cents')
        .eq('event_id', event_id)
        .single();

      if (!ledger) {
        // Calculate ledger if it doesn't exist
        await supabase.rpc('calculate_event_ledger', { p_event_id: event_id });
        const { data: newLedger } = await supabase
          .from('event_ledger')
          .select('available_for_payout_cents')
          .eq('event_id', event_id)
          .single();

        if (!newLedger || newLedger.available_for_payout_cents <= 0) {
          return new Response(
            JSON.stringify({ error: 'No funds available for payout' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const availableAmount = ledger?.available_for_payout_cents || 0;
      const payoutAmount = amount_cents || availableAmount;

      if (payoutAmount <= 0) {
        return new Response(
          JSON.stringify({ error: 'No funds available for payout' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (payoutAmount > availableAmount) {
        return new Response(
          JSON.stringify({
            error: 'Insufficient funds',
            available: availableAmount,
            requested: payoutAmount,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get payout schedule
      const { data: schedule } = await supabase.rpc('get_payout_schedule', {
        p_organizer_id: finalOrganizerId,
        p_event_id: event_id,
      });

      // Check minimum payout amount
      if (payoutAmount < schedule.min_payout_amount_cents) {
        return new Response(
          JSON.stringify({
            error: 'Payout amount below minimum',
            minimum: schedule.min_payout_amount_cents,
            requested: payoutAmount,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Calculate when payout can be scheduled
      const { data: availableAt } = await supabase.rpc('calculate_payout_available_at', {
        p_event_id: event_id,
        p_organizer_id: finalOrganizerId,
      });

      // Create payout
      const { data: payout, error: payoutError } = await supabase
        .from('payouts')
        .insert({
          organizer_id: finalOrganizerId,
          event_id: event_id,
          amount_cents: payoutAmount,
          currency: 'usd',
          stripe_connect_account_id: organizer.stripe_connect_account_id,
          status: availableAt <= new Date() ? 'pending' : 'scheduled',
          scheduled_for: availableAt,
          description: `Payout for event: ${event.title}`,
        })
        .select()
        .single();

      if (payoutError) {
        throw new Error(`Failed to create payout: ${payoutError.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          payout_id: payout.id,
          amount_cents: payout.amount_cents,
          scheduled_for: payout.scheduled_for,
          status: payout.status,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Organizer-level payout (aggregated across events)
      // This is more complex - would need to aggregate across multiple events
      return new Response(
        JSON.stringify({ error: 'Event-level payouts only for now' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
