/**
 * Fraud Check Middleware
 * 
 * POST /functions/v1/fraud-check
 * 
 * Checks purchase requests for fraud indicators before allowing purchase.
 * 
 * Body: {
 *   user_id: string,
 *   event_id: string,
 *   card_fingerprint: string (SHA256 hash),
 *   ip_address: string,
 *   user_agent?: string
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
    const { user_id, event_id, card_fingerprint, ip_address, user_agent } = body;

    if (!user_id || !event_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_id, event_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const checks = {
      allowed: true,
      requires_captcha: false,
      requires_phone_verification: false,
      blocked: false,
      reasons: [] as string[],
      risk_score: 0,
    };

    // Check 1: Rate limits
    const { data: rateLimitCheck, error: rateLimitError } = await supabase.rpc(
      'check_purchase_rate_limit',
      {
        p_user_id: user_id,
        p_card_fingerprint: card_fingerprint || null,
        p_ip_address: ip_address || null,
        p_event_id: event_id,
      }
    );

    if (rateLimitError) {
      console.error('Rate limit check error:', rateLimitError);
    } else if (rateLimitCheck && rateLimitCheck.length > 0) {
      const result = rateLimitCheck[0];
      if (!result.allowed) {
        checks.allowed = false;
        checks.reasons.push(result.reason);
        
        // Create risk signal
        await supabase.from('risk_signals').insert({
          signal_type: 'rate_limit_exceeded',
          risk_level: 'medium',
          user_id: user_id,
          event_id: event_id,
          card_fingerprint: card_fingerprint || null,
          ip_address: ip_address || null,
          description: result.reason,
          metadata: {
            limit_type: result.limit_type,
            current_count: result.current_count,
            max_count: result.max_count,
          },
        });
      }
    }

    // Check 2: User risk profile
    const { data: userProfile } = await supabase
      .from('user_risk_profiles')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (userProfile) {
      checks.risk_score = userProfile.risk_score || 0;

      // Block if user is blocked
      if (userProfile.is_blocked) {
        checks.allowed = false;
        checks.blocked = true;
        checks.reasons.push('Account is blocked');
      }

      // Require phone verification
      if (userProfile.requires_phone_verification && !userProfile.phone_verified_at) {
        checks.requires_phone_verification = true;
        checks.reasons.push('Phone verification required');
      }

      // Require captcha for high-risk users
      if (userProfile.risk_score >= 60) {
        checks.requires_captcha = true;
        checks.reasons.push('High risk score requires captcha');
      }
    }

    // Check 3: Card fingerprint risk
    if (card_fingerprint) {
      const { data: cardProfile } = await supabase
        .from('card_fingerprints')
        .select('*')
        .eq('fingerprint', card_fingerprint)
        .single();

      if (cardProfile) {
        if (cardProfile.is_blocked) {
          checks.allowed = false;
          checks.reasons.push('Card is blocked');
        }

        if (cardProfile.total_failed_attempts > 5) {
          checks.requires_captcha = true;
          checks.reasons.push('Card has multiple failed attempts');
        }
      }
    }

    // Check 4: IP address risk
    if (ip_address) {
      const { data: ipProfile } = await supabase
        .from('ip_addresses')
        .select('*')
        .eq('ip_address', ip_address)
        .single();

      if (ipProfile) {
        if (ipProfile.is_blocked) {
          checks.allowed = false;
          checks.reasons.push('IP address is blocked');
        }

        // Multiple users from same IP (potential bot)
        if (ipProfile.unique_users_count > 10) {
          checks.requires_captcha = true;
          checks.reasons.push('Multiple users from same IP');
        }
      }
    }

    // Check 5: Active risk actions
    const { data: activeActions } = await supabase
      .from('risk_actions')
      .select('*')
      .eq('user_id', user_id)
      .in('status', ['pending', 'active'])
      .or(`event_id.eq.${event_id},event_id.is.null`);

    if (activeActions && activeActions.length > 0) {
      for (const action of activeActions) {
        switch (action.action_type) {
          case 'block_account':
            checks.allowed = false;
            checks.blocked = true;
            checks.reasons.push('Account blocked by admin');
            break;
          case 'require_phone_verification':
            checks.requires_phone_verification = true;
            checks.reasons.push('Phone verification required by admin');
            break;
          case 'require_captcha':
            checks.requires_captcha = true;
            checks.reasons.push('Captcha required by admin');
            break;
          case 'freeze_transfers':
            // This doesn't block purchase, just transfers
            break;
        }
      }
    }

    // Check 6: High-demand event (always require captcha)
    const { data: event } = await supabase
      .from('events')
      .select('is_high_demand')
      .eq('id', event_id)
      .single();

    if (event?.is_high_demand) {
      checks.requires_captcha = true;
      checks.reasons.push('High-demand event requires captcha');
    }

    return new Response(
      JSON.stringify(checks),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Fraud check error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message,
        allowed: false, // Fail closed
        reasons: ['Fraud check failed'],
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
