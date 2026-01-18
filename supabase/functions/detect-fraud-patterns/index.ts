/**
 * Detect Fraud Patterns
 * 
 * POST /functions/v1/detect-fraud-patterns
 * 
 * Runs fraud detection checks and creates risk signals.
 * Can be called manually or via cron.
 * 
 * Body: {
 *   event_id?: string (optional, specific event)
 *   check_types?: string[] (optional, specific checks)
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
    const { event_id, check_types } = body;

    const results = {
      signals_created: 0,
      actions_taken: 0,
      errors: [] as string[],
    };

    // Check 1: Purchase spikes
    if (!check_types || check_types.includes('purchase_spike')) {
      try {
        if (event_id) {
          const { data: signal } = await supabase.rpc('detect_purchase_spike', {
            p_event_id: event_id,
          });

          if (signal) {
            results.signals_created++;
            
            // Auto-require captcha for high-demand events
            if (signal.risk_level === 'high' || signal.risk_level === 'critical') {
              await supabase.from('risk_actions').insert({
                action_type: 'require_captcha',
                status: 'active',
                event_id: event_id,
                description: 'Captcha required due to purchase spike',
                metadata: {
                  signal_id: signal.id,
                  spike_ratio: signal.metadata?.spike_ratio,
                },
                activated_at: new Date().toISOString(),
              });
              results.actions_taken++;
            }
          }
        } else {
          // Check all active events
          const { data: events } = await supabase
            .from('events')
            .select('id')
            .eq('status', 'active')
            .gt('start_at', new Date().toISOString());

          if (events) {
            for (const event of events) {
              const { data: signal } = await supabase.rpc('detect_purchase_spike', {
                p_event_id: event.id,
              });

              if (signal) {
                results.signals_created++;
              }
            }
          }
        }
      } catch (error: any) {
        results.errors.push(`Purchase spike check: ${error.message}`);
      }
    }

    // Check 2: Transfer spam
    if (!check_types || check_types.includes('transfer_spam')) {
      try {
        if (event_id) {
          const { data: signal } = await supabase.rpc('detect_transfer_spam', {
            p_event_id: event_id,
          });

          if (signal) {
            results.signals_created++;
            
            // Auto-freeze transfers for critical
            if (signal.risk_level === 'critical') {
              await supabase.rpc('admin_freeze_transfers', {
                p_event_id: event_id,
                p_reason: 'Transfer spam detected',
                p_admin_user_id: null, // System action
              });
              results.actions_taken++;
            }
          }
        }
      } catch (error: any) {
        results.errors.push(`Transfer spam check: ${error.message}`);
      }
    }

    // Check 3: High refund rates
    if (!check_types || check_types.includes('high_refund_rate')) {
      try {
        const { data: organizers } = await supabase
          .from('admin_organizer_refund_rates')
          .select('*')
          .gt('refund_rate_percent', 25);

        if (organizers) {
          for (const org of organizers) {
            // Create risk signal
            await supabase.from('risk_signals').insert({
              signal_type: 'high_refund_rate',
              risk_level: org.refund_rate_percent > 50 ? 'critical' : 'high',
              organizer_id: org.organizer_id,
              description: `High refund rate: ${org.refund_rate_percent}%`,
              confidence_score: Math.min(org.refund_rate_percent, 100),
              metadata: {
                refund_rate_percent: org.refund_rate_percent,
                total_payments: org.total_payments,
                refunded_payments: org.refunded_payments,
              },
            });
            results.signals_created++;
          }
        }
      } catch (error: any) {
        results.errors.push(`High refund rate check: ${error.message}`);
      }
    }

    // Check 4: Failed scan patterns
    if (!check_types || check_types.includes('failed_scan')) {
      try {
        const { data: devices } = await supabase
          .from('device_risk_profiles')
          .select('device_id')
          .gte('consecutive_failures', 5);

        if (devices) {
          for (const device of devices) {
            const { data: signal } = await supabase.rpc('detect_failed_scan_pattern', {
              p_device_id: device.device_id,
            });

            if (signal) {
              results.signals_created++;
            }
          }
        }
      } catch (error: any) {
        results.errors.push(`Failed scan check: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify(results),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Detect fraud patterns error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
