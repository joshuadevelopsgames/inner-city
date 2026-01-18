/**
 * Record Scan Result
 * 
 * POST /functions/v1/record-scan-result
 * 
 * Records scanner check-in results and detects fraud patterns.
 * 
 * Body: {
 *   device_id: string,
 *   ticket_id: string,
 *   result: 'valid' | 'invalid' | 'already_used',
 *   scanner_user_id: string
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { device_id, ticket_id, result, scanner_user_id } = body;

    if (!device_id || !ticket_id || !result) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: device_id, ticket_id, result' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update device risk profile
    const isSuccess = result === 'valid';
    const isFailure = result === 'invalid' || result === 'already_used';

    // Upsert device profile
    const { data: deviceProfile } = await supabase
      .from('device_risk_profiles')
      .select('*')
      .eq('device_id', device_id)
      .single();

    const updates: any = {
      total_scans: (deviceProfile?.total_scans || 0) + 1,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (isSuccess) {
      updates.valid_scans = (deviceProfile?.valid_scans || 0) + 1;
      updates.consecutive_failures = 0;
    } else if (isFailure) {
      updates.invalid_scans = (deviceProfile?.invalid_scans || 0) + 1;
      updates.failed_scans = (deviceProfile?.failed_scans || 0) + 1;
      updates.consecutive_failures = (deviceProfile?.consecutive_failures || 0) + 1;
      updates.last_failed_scan_at = new Date().toISOString();
    }

    // Calculate risk score
    const totalScans = updates.total_scans;
    const failedScans = updates.failed_scans || deviceProfile?.failed_scans || 0;
    const failureRate = totalScans > 0 ? (failedScans / totalScans) * 100 : 0;

    let riskScore = 0;
    if (failureRate > 50) riskScore = 80;
    else if (failureRate > 30) riskScore = 60;
    else if (failureRate > 10) riskScore = 40;

    if (updates.consecutive_failures >= 10) riskScore = 100;
    else if (updates.consecutive_failures >= 5) riskScore = Math.max(riskScore, 80);

    updates.risk_score = riskScore;
    updates.is_blocked = riskScore >= 90;

    // Upsert device profile
    await supabase.from('device_risk_profiles').upsert({
      device_id,
      user_id: scanner_user_id || null,
      ...updates,
    }, {
      onConflict: 'device_id',
    });

    // Detect fraud pattern if failure
    if (isFailure && updates.consecutive_failures >= 5) {
      const { data: signal } = await supabase.rpc('detect_failed_scan_pattern', {
        p_device_id: device_id,
      });

      if (signal) {
        // Auto-block device if critical
        if (signal.risk_level === 'critical') {
          await supabase
            .from('device_risk_profiles')
            .update({ is_blocked: true })
            .eq('device_id', device_id);

          // Create risk action
          await supabase.from('risk_actions').insert({
            action_type: 'block_account',
            status: 'active',
            description: `Device auto-blocked due to ${signal.consecutive_failures} consecutive failures`,
            metadata: {
              device_id,
              signal_id: signal.id,
            },
            activated_at: new Date().toISOString(),
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        device_id,
        risk_score: riskScore,
        is_blocked: updates.is_blocked,
        consecutive_failures: updates.consecutive_failures || 0,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Record scan result error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
