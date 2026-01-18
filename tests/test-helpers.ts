/**
 * Test Helpers
 * Shared utilities for end-to-end tests
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export interface TestContext {
  eventId: string;
  organizerId: string;
  cityId: string;
  ticketTypeId: string;
  userIds: string[];
  ticketIds: string[];
  reservationIds: string[];
  paymentIds: string[];
}

/**
 * Create a complete test event with inventory
 */
export async function setupTestEvent(
  capacity: number = 100,
  priceCents: number = 2500
): Promise<TestContext> {
  // Create test organizer
  const organizerId = crypto.randomUUID();
  const { data: organizer, error: orgError } = await supabase
    .from('organizers')
    .insert({
      id: organizerId,
      display_name: `Test Organizer ${Date.now()}`,
      tier: 'community',
      trust_tier: 'new',
    })
    .select('id')
    .single();

  if (orgError) throw new Error(`Failed to create organizer: ${orgError.message}`);

  // Create test city
  const cityId = crypto.randomUUID();
  const { data: city, error: cityError } = await supabase
    .from('cities')
    .insert({
      id: cityId,
      name: `Test City ${Date.now()}`,
      country: 'Test Country',
      country_code: 'TC',
      timezone: 'UTC',
    })
    .select('id')
    .single();

  if (cityError) throw new Error(`Failed to create city: ${cityError.message}`);

  // Create test event
  const eventId = crypto.randomUUID();
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const endAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString();

  const { data: event, error: eventError } = await supabase
    .from('events')
    .insert({
      id: eventId,
      organizer_id: organizerId,
      city_id: cityId,
      title: `Test Event ${Date.now()}`,
      start_at: startAt,
      end_at: endAt,
      venue_name: 'Test Venue',
      status: 'active',
      tier: 'community',
      is_high_demand: false,
    })
    .select('id')
    .single();

  if (eventError) throw new Error(`Failed to create event: ${eventError.message}`);

  // Initialize inventory
  const { error: invError } = await supabase.from('ticket_inventory').insert({
    event_id: eventId,
    total_capacity: capacity,
    sold_count: 0,
    reserved_count: 0,
  });

  if (invError) throw new Error(`Failed to create inventory: ${invError.message}`);

  // Create ticket type
  const ticketTypeId = crypto.randomUUID();
  const { data: ticketType, error: typeError } = await supabase
    .from('ticket_types')
    .insert({
      id: ticketTypeId,
      event_id: eventId,
      type: 'ga',
      name: 'General Admission',
      price_cents: priceCents,
      capacity: capacity,
    })
    .select('id')
    .single();

  if (typeError) throw new Error(`Failed to create ticket type: ${typeError.message}`);

  return {
    eventId,
    organizerId,
    cityId,
    ticketTypeId,
    userIds: [],
    ticketIds: [],
    reservationIds: [],
    paymentIds: [],
  };
}

/**
 * Clean up test data
 */
export async function cleanupTest(context: TestContext) {
  // Delete in reverse order of dependencies
  if (context.paymentIds.length > 0) {
    await supabase.from('payments').delete().in('id', context.paymentIds);
  }
  if (context.ticketIds.length > 0) {
    await supabase.from('tickets').delete().in('id', context.ticketIds);
  }
  if (context.reservationIds.length > 0) {
    await supabase.from('reservations').delete().in('id', context.reservationIds);
  }
  await supabase.from('ticket_inventory').delete().eq('event_id', context.eventId);
  await supabase.from('ticket_types').delete().eq('event_id', context.eventId);
  await supabase.from('events').delete().eq('id', context.eventId);
  await supabase.from('organizers').delete().eq('id', context.organizerId);
  await supabase.from('cities').delete().eq('id', context.cityId);
  
  // Clean up users if created
  for (const userId of context.userIds) {
    try {
      await supabase.auth.admin.deleteUser(userId);
    } catch (e) {
      // Ignore if user doesn't exist
    }
  }
}

/**
 * Create a test user
 */
export async function createTestUser(email?: string): Promise<string> {
  const userId = crypto.randomUUID();
  const testEmail = email || `test-${userId}@example.com`;
  
  const { data, error } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: 'test-password-123',
    email_confirm: true,
  });

  if (error) throw new Error(`Failed to create user: ${error.message}`);
  return data.user.id;
}

/**
 * Get inventory state
 */
export async function getInventory(eventId: string) {
  const { data, error } = await supabase
    .from('ticket_inventory')
    .select('*')
    .eq('event_id', eventId)
    .single();

  if (error) throw new Error(`Failed to get inventory: ${error.message}`);
  return data;
}

/**
 * Verify inventory invariant
 */
export async function verifyInventoryInvariant(eventId: string): Promise<boolean> {
  const inventory = await getInventory(eventId);
  const totalUsed = inventory.sold_count + inventory.reserved_count;
  
  return (
    totalUsed <= inventory.total_capacity &&
    inventory.sold_count >= 0 &&
    inventory.reserved_count >= 0 &&
    inventory.total_capacity > 0
  );
}

/**
 * Create a reservation
 */
export async function createReservation(
  eventId: string,
  ticketTypeId: string,
  userId: string,
  quantity: number = 1
): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_reservation', {
    p_event_id: eventId,
    p_ticket_type_id: ticketTypeId,
    p_user_id: userId,
    p_quantity: quantity,
    p_expires_in_minutes: 10,
  });

  if (error) {
    console.error('Reservation error:', error);
    return null;
  }

  return data;
}

/**
 * Simulate checkout completion (create ticket and payment)
 */
export async function simulateCheckout(
  reservationId: string,
  stripePaymentIntentId: string
): Promise<{ ticketId: string; paymentId: string } | null> {
  // Get reservation
  const { data: reservation, error: resError } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .single();

  if (resError || !reservation) {
    console.error('Reservation not found:', resError);
    return null;
  }

  // Consume reservation
  const { data: consumed, error: consumeError } = await supabase.rpc('consume_reservation', {
    p_reservation_id: reservationId,
    p_stripe_checkout_session_id: `session-${stripePaymentIntentId}`,
  });

  if (consumeError || !consumed) {
    console.error('Failed to consume reservation:', consumeError);
    return null;
  }

  // Get event and organizer
  const { data: event } = await supabase
    .from('events')
    .select('id, organizer_id, organizers!inner(stripe_connect_account_id)')
    .eq('id', reservation.event_id)
    .single();

  // Create ticket
  const ticketId = crypto.randomUUID();
  const qrSecret = crypto.randomUUID();
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .insert({
      id: ticketId,
      event_id: reservation.event_id,
      ticket_type_id: reservation.ticket_type_id,
      buyer_id: reservation.user_id,
      qr_secret: qrSecret,
      purchase_price_cents: reservation.price_cents,
      stripe_payment_intent_id: stripePaymentIntentId,
      status: 'active',
    })
    .select('id')
    .single();

  if (ticketError) {
    console.error('Failed to create ticket:', ticketError);
    return null;
  }

  // Create payment
  const paymentId = crypto.randomUUID();
  const totalAmount = reservation.price_cents * reservation.quantity;
  const platformFee = Math.floor(totalAmount * 0.10);
  const organizerPayout = totalAmount - platformFee;

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert({
      id: paymentId,
      ticket_id: ticketId,
      event_id: reservation.event_id,
      buyer_id: reservation.user_id,
      organizer_id: event.organizer_id,
      amount_cents: totalAmount,
      platform_fee_cents: platformFee,
      organizer_payout_cents: organizerPayout,
      stripe_payment_intent_id: stripePaymentIntentId,
      stripe_connect_account_id: event.organizers?.stripe_connect_account_id || 'acct_test',
      status: 'succeeded',
    })
    .select('id')
    .single();

  if (paymentError) {
    console.error('Failed to create payment:', paymentError);
    return null;
  }

  return { ticketId, paymentId };
}

/**
 * Check in a ticket
 */
export async function checkInTicket(
  ticketId: string,
  scannerUserId: string,
  deviceId: string = 'test-device'
): Promise<boolean> {
  // Get ticket
  const { data: ticket } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', ticketId)
    .single();

  if (!ticket || ticket.status !== 'active') {
    return false;
  }

  // Create check-in log
  const { error } = await supabase.from('check_in_logs').insert({
    ticket_id: ticketId,
    event_id: ticket.event_id,
    scanner_user_id: scannerUserId,
    scanner_device_id: deviceId,
    qr_secret: ticket.qr_secret,
    qr_nonce: 0,
    result: 'valid',
  });

  if (error) {
    return false;
  }

  // Update ticket status
  await supabase
    .from('tickets')
    .update({ status: 'used' })
    .eq('id', ticketId);

  return true;
}

/**
 * Get check-in count for ticket
 */
export async function getCheckInCount(ticketId: string): Promise<number> {
  const { count } = await supabase
    .from('check_in_logs')
    .select('*', { count: 'exact', head: true })
    .eq('ticket_id', ticketId)
    .eq('result', 'valid');

  return count || 0;
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return false;
}
