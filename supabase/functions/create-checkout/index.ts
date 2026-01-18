/**
 * Create Stripe Checkout Session Edge Function
 * 
 * POST /functions/v1/create-checkout
 * 
 * Body: {
 *   reservation_id: string,
 *   success_url: string,
 *   cancel_url: string
 * }
 * 
 * Returns: { checkout_url: string, session_id: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CheckoutRequest {
  reservation_id: string;
  success_url: string;
  cancel_url: string;
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
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!;
    const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });

    // Get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: CheckoutRequest = await req.json();
    const { reservation_id, success_url, cancel_url } = body;

    if (!reservation_id || !success_url || !cancel_url) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: reservation_id, success_url, cancel_url' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get reservation details
    const { data: reservation, error: resError } = await supabase.rpc(
      'get_reservation',
      { p_reservation_id: reservation_id }
    );

    if (resError || !reservation || reservation.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Reservation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const res = reservation[0];

    // Verify reservation belongs to user
    if (res.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: reservation belongs to different user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if reservation is still valid
    if (res.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: `Reservation is ${res.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (res.is_expired) {
      // Release expired reservation
      await supabase.rpc('release_reservation', { p_reservation_id: reservation_id });
      return new Response(
        JSON.stringify({ error: 'Reservation has expired' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get event and organizer details
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select(`
        id,
        title,
        organizer_id,
        organizers!inner(stripe_connect_account_id)
      `)
      .eq('id', res.event_id)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get ticket type pricing
    let price_cents = 0;
    if (res.ticket_type_id) {
      const { data: ticketType } = await supabase
        .from('ticket_types')
        .select('price_cents')
        .eq('id', res.ticket_type_id)
        .single();
      
      if (ticketType) {
        price_cents = ticketType.price_cents;
      }
    }

    if (price_cents === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid ticket pricing' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const total_amount = price_cents * res.quantity;
    const platform_fee = Math.floor(total_amount * 0.10); // 10% platform fee
    const organizer_payout = total_amount - platform_fee;

    // Create Stripe Checkout Session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${event.title} - ${res.quantity} Ticket${res.quantity > 1 ? 's' : ''}`,
              description: `General Admission Ticket${res.quantity > 1 ? 's' : ''}`,
            },
            unit_amount: price_cents,
          },
          quantity: res.quantity,
        },
      ],
      success_url: `${success_url}?session_id={CHECKOUT_SESSION_ID}&reservation_id=${reservation_id}`,
      cancel_url: `${cancel_url}?reservation_id=${reservation_id}`,
      client_reference_id: reservation_id,
      metadata: {
        reservation_id: reservation_id,
        event_id: res.event_id,
        user_id: user.id,
        quantity: res.quantity.toString(),
      },
      expires_at: Math.floor(new Date(res.expires_at).getTime() / 1000), // Match reservation expiry
    };

    // If organizer has Stripe Connect, use it
    if (event.organizers?.stripe_connect_account_id) {
      sessionParams.payment_intent_data = {
        application_fee_amount: platform_fee,
        on_behalf_of: event.organizers.stripe_connect_account_id,
        transfer_data: {
          destination: event.organizers.stripe_connect_account_id,
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Update reservation with checkout session ID
    await supabase
      .from('reservations')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', reservation_id);

    return new Response(
      JSON.stringify({
        checkout_url: session.url,
        session_id: session.id,
        expires_at: res.expires_at,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Checkout creation error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to create checkout session', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
