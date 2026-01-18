/**
 * Reconcile Events Edge Function
 * 
 * POST /functions/v1/reconcile-events
 * 
 * Runs reconciliation for events to detect mismatches between tickets and payments.
 * 
 * Body: {
 *   event_id?: string (optional, specific event)
 *   hours_ago?: number (default 24, events needing reconciliation)
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
    const { event_id, hours_ago = 24 } = body;

    const results = {
      reconciled: 0,
      failed: 0,
      errors: [] as string[],
      discrepancies: [] as any[],
    };

    if (event_id) {
      // Reconcile specific event
      try {
        const { data: result, error: reconcileError } = await supabase.rpc(
          'reconcile_event',
          { p_event_id: event_id }
        );

        if (reconcileError) {
          throw new Error(reconcileError.message);
        }

        results.reconciled++;
        if (result.has_discrepancies) {
          results.discrepancies.push({
            event_id: result.event_id,
            issues: result.issues,
            revenue_discrepancy_cents: result.revenue_discrepancy_cents,
          });
        }
      } catch (error: any) {
        results.failed++;
        results.errors.push(`Event ${event_id}: ${error.message}`);
      }
    } else {
      // Get events needing reconciliation
      const { data: events, error: eventsError } = await supabase.rpc(
        'get_events_needing_reconciliation',
        { p_hours_ago: hours_ago }
      );

      if (eventsError) {
        throw new Error(`Failed to fetch events: ${eventsError.message}`);
      }

      if (!events || events.length === 0) {
        return new Response(
          JSON.stringify({
            message: 'No events need reconciliation',
            reconciled: 0,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Reconcile each event
      for (const event of events) {
        try {
          const { data: result, error: reconcileError } = await supabase.rpc(
            'reconcile_event',
            { p_event_id: event.event_id }
          );

          if (reconcileError) {
            throw new Error(reconcileError.message);
          }

          results.reconciled++;
          if (result.has_discrepancies) {
            results.discrepancies.push({
              event_id: result.event_id,
              event_title: event.event_title,
              issues: result.issues,
              revenue_discrepancy_cents: result.revenue_discrepancy_cents,
            });
          }
        } catch (error: any) {
          results.failed++;
          results.errors.push(`Event ${event.event_id}: ${error.message}`);
        }
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
