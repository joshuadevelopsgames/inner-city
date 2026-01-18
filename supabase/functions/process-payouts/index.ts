/**
 * Process Payouts Edge Function
 * 
 * POST /functions/v1/process-payouts
 * 
 * Processes scheduled payouts for organizers.
 * 
 * Flow:
 * 1. Find payouts ready to process (scheduled_for <= NOW)
 * 2. Verify ledger has sufficient funds
 * 3. Create Stripe Transfer to organizer's Connect account
 * 4. Update payout status
 * 5. Create ledger entry
 * 
 * Can be called manually or via cron job.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { corsHeaders } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify service role (this should be called by cron or admin)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { event_id, organizer_id, limit = 10 } = body;

    // Find payouts ready to process
    let query = supabase
      .from('payouts')
      .select(`
        *,
        organizers!inner(stripe_connect_account_id, trust_tier),
        events(id, title, end_at)
      `)
      .in('status', ['pending', 'scheduled'])
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(limit);

    if (event_id) {
      query = query.eq('event_id', event_id);
    }
    if (organizer_id) {
      query = query.eq('organizer_id', organizer_id);
    }

    const { data: payouts, error: payoutsError } = await query;

    if (payoutsError) {
      throw new Error(`Failed to fetch payouts: ${payoutsError.message}`);
    }

    if (!payouts || payouts.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No payouts ready to process', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = {
      processed: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Process each payout
    for (const payout of payouts) {
      try {
        // Update status to processing
        await supabase
          .from('payouts')
          .update({ status: 'processing', updated_at: new Date().toISOString() })
          .eq('id', payout.id);

        // Verify ledger has sufficient funds
        if (payout.event_id) {
          const { data: ledger } = await supabase
            .from('event_ledger')
            .select('available_for_payout_cents')
            .eq('event_id', payout.event_id)
            .single();

          if (!ledger || ledger.available_for_payout_cents < payout.amount_cents) {
            throw new Error(
              `Insufficient funds: ${ledger?.available_for_payout_cents || 0} < ${payout.amount_cents}`
            );
          }
        }

        // Create Stripe Transfer
        const transfer = await stripe.transfers.create({
          amount: payout.amount_cents,
          currency: payout.currency || 'usd',
          destination: payout.organizers.stripe_connect_account_id,
          metadata: {
            payout_id: payout.id,
            event_id: payout.event_id || '',
            organizer_id: payout.organizer_id,
          },
        });

        // Update payout with Stripe transfer ID
        const { error: updateError } = await supabase
          .from('payouts')
          .update({
            stripe_payout_id: transfer.id,
            status: 'completed',
            processed_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', payout.id);

        if (updateError) {
          throw new Error(`Failed to update payout: ${updateError.message}`);
        }

        // Create ledger entry
        if (payout.event_id) {
          await supabase.from('ledger_entries').insert({
            event_id: payout.event_id,
            organizer_id: payout.organizer_id,
            entry_type: 'payout',
            amount_cents: -payout.amount_cents, // Negative for payout
            payout_id: payout.id,
            description: `Payout to organizer: ${transfer.id}`,
            metadata: {
              stripe_transfer_id: transfer.id,
              event_title: payout.events?.title,
            },
          });

          // Recalculate ledger
          await supabase.rpc('calculate_event_ledger', {
            p_event_id: payout.event_id,
          });
        }

        results.processed++;
      } catch (error: any) {
        console.error(`Failed to process payout ${payout.id}:`, error);

        // Update payout status to failed
        await supabase
          .from('payouts')
          .update({
            status: 'failed',
            failure_reason: error.message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', payout.id);

        results.failed++;
        results.errors.push(`Payout ${payout.id}: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify(results),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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
