/**
 * Stripe Webhook Handler
 * 
 * POST /functions/v1/stripe-webhook
 * 
 * Handles:
 * - checkout.session.completed: Issue tickets, consume reservation
 * - checkout.session.expired: Release reservation
 * - payment_intent.succeeded: Backup handler
 * 
 * Idempotency: Uses Stripe event ID + reservation_id to prevent duplicate processing
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookEvent {
  id: string;
  type: string;
  data: {
    object: Stripe.Checkout.Session | Stripe.PaymentIntent;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!;
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!stripeSecretKey || !webhookSecret) {
      return new Response(
        JSON.stringify({ error: 'Stripe webhook not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get signature from header
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response(
        JSON.stringify({ error: 'Missing stripe-signature header' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get raw body
    const body = await req.text();

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Idempotency: Check if we've already processed this event
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('stripe_event_id', event.id)
      .single();

    if (existingEvent) {
      console.log(`Event ${event.id} already processed, skipping`);
      return new Response(
        JSON.stringify({ received: true, message: 'Event already processed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process event
    let result: any = { received: true };

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        result = await handleCheckoutCompleted(session, supabase, stripe);
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        result = await handleCheckoutExpired(session, supabase);
        break;
      }

      case 'payment_intent.succeeded': {
        // Backup handler - in case checkout.session.completed wasn't received
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        result = await handlePaymentSucceeded(paymentIntent, supabase, stripe);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Record processed event for idempotency
    await supabase.from('webhook_events').insert({
      stripe_event_id: event.id,
      event_type: event.type,
      processed_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Webhook processing failed', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Handle successful checkout - issue tickets and consume reservation
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  supabase: any,
  stripe: Stripe
) {
  const reservationId = session.metadata?.reservation_id || session.client_reference_id;
  
  if (!reservationId) {
    throw new Error('No reservation_id in checkout session metadata');
  }

  // Get reservation
  const { data: reservation, error: resError } = await supabase.rpc(
    'get_reservation',
    { p_reservation_id: reservationId }
  );

  if (resError || !reservation || reservation.length === 0) {
    throw new Error(`Reservation not found: ${reservationId}`);
  }

  const res = reservation[0];

  // Check if already consumed (idempotency)
  if (res.status === 'consumed') {
    console.log(`Reservation ${reservationId} already consumed`);
    return { message: 'Reservation already consumed', reservation_id: reservationId };
  }

  // Consume reservation atomically
  const { data: consumed, error: consumeError } = await supabase.rpc(
    'consume_reservation',
    {
      p_reservation_id: reservationId,
      p_stripe_checkout_session_id: session.id,
    }
  );

  if (consumeError || !consumed) {
    throw new Error(`Failed to consume reservation: ${consumeError?.message}`);
  }

  // Get payment intent details
  const paymentIntentId = typeof session.payment_intent === 'string' 
    ? session.payment_intent 
    : session.payment_intent?.id;

  if (!paymentIntentId) {
    throw new Error('No payment_intent in checkout session');
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  
  // Calculate fees
  const totalAmount = paymentIntent.amount;
  const platformFee = Math.floor(totalAmount * 0.10);
  const organizerPayout = totalAmount - platformFee;

  // Get event and organizer
  const { data: event } = await supabase
    .from('events')
    .select('id, organizer_id, organizers!inner(stripe_connect_account_id)')
    .eq('id', res.event_id)
    .single();

  // Issue tickets
  const ticketIds: string[] = [];
  const qrSecrets: string[] = [];

  for (let i = 0; i < res.quantity; i++) {
    const qrSecret = crypto.randomUUID();
    qrSecrets.push(qrSecret);

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .insert({
        event_id: res.event_id,
        ticket_type_id: res.ticket_type_id,
        buyer_id: res.user_id,
        qr_secret: qrSecret,
        purchase_price_cents: Math.floor(totalAmount / res.quantity),
        stripe_payment_intent_id: paymentIntentId,
        expires_at: null, // Will be set based on event.end_at
      })
      .select('id')
      .single();

    if (ticketError) {
      console.error(`Failed to create ticket ${i + 1}:`, ticketError);
      // Continue with other tickets
      continue;
    }

    ticketIds.push(ticket.id);

    // Create payment record
    await supabase.from('payments').insert({
      ticket_id: ticket.id,
      event_id: res.event_id,
      buyer_id: res.user_id,
      organizer_id: event.organizer_id,
      amount_cents: Math.floor(totalAmount / res.quantity),
      platform_fee_cents: Math.floor(platformFee / res.quantity),
      organizer_payout_cents: Math.floor(organizerPayout / res.quantity),
      stripe_payment_intent_id: paymentIntentId,
      stripe_connect_account_id: event.organizers?.stripe_connect_account_id || '',
      status: 'succeeded',
    });
  }

  return {
    message: 'Tickets issued successfully',
    reservation_id: reservationId,
    tickets_issued: ticketIds.length,
    ticket_ids: ticketIds,
  };
}

/**
 * Handle expired checkout - release reservation
 */
async function handleCheckoutExpired(
  session: Stripe.Checkout.Session,
  supabase: any
) {
  const reservationId = session.metadata?.reservation_id || session.client_reference_id;
  
  if (!reservationId) {
    return { message: 'No reservation_id found, skipping' };
  }

  const { data: released } = await supabase.rpc(
    'release_reservation',
    { p_reservation_id: reservationId }
  );

  return {
    message: released ? 'Reservation released' : 'Reservation not found or already processed',
    reservation_id: reservationId,
  };
}

/**
 * Backup handler for payment_intent.succeeded
 */
async function handlePaymentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
  supabase: any,
  stripe: Stripe
) {
  // Try to find reservation by payment intent metadata
  // This is a backup in case checkout.session.completed wasn't received
  
  // Get checkout session from payment intent
  if (paymentIntent.metadata?.reservation_id) {
    // Process as if checkout completed
    const session = await stripe.checkout.sessions.list({
      payment_intent: paymentIntent.id,
      limit: 1,
    });

    if (session.data.length > 0) {
      return await handleCheckoutCompleted(session.data[0], supabase, stripe);
    }
  }

  return { message: 'Payment succeeded but no reservation found' };
}
