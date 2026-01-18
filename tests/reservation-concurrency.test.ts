/**
 * Concurrency Tests for Reservation System
 * 
 * These tests simulate race conditions to verify atomicity and prevent overselling
 * 
 * Run with: deno test --allow-net --allow-env tests/reservation-concurrency.test.ts
 */

import { assertEquals, assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface TestContext {
  eventId: string;
  organizerId: string;
  cityId: string;
  ticketTypeId: string;
}

async function setupTestEvent(): Promise<TestContext> {
  // Create test organizer
  const { data: organizer } = await supabase
    .from('organizers')
    .insert({
      id: crypto.randomUUID(),
      display_name: 'Test Organizer',
      tier: 'community',
    })
    .select('id')
    .single();

  // Create test city
  const { data: city } = await supabase
    .from('cities')
    .insert({
      name: 'Test City',
      country: 'Test Country',
      country_code: 'TC',
      timezone: 'UTC',
    })
    .select('id')
    .single();

  // Create test event
  const { data: event } = await supabase
    .from('events')
    .insert({
      organizer_id: organizer.id,
      city_id: city.id,
      title: 'Concurrency Test Event',
      start_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      end_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
      venue_name: 'Test Venue',
      status: 'active',
      tier: 'community',
    })
    .select('id')
    .single();

  // Initialize inventory
  await supabase.from('ticket_inventory').insert({
    event_id: event.id,
    total_capacity: 10,
    sold_count: 0,
    reserved_count: 0,
  });

  // Create ticket type
  const { data: ticketType } = await supabase
    .from('ticket_types')
    .insert({
      event_id: event.id,
      type: 'ga',
      name: 'General Admission',
      price_cents: 2500,
      capacity: 10,
    })
    .select('id')
    .single();

  return {
    eventId: event.id,
    organizerId: organizer.id,
    cityId: city.id,
    ticketTypeId: ticketType.id,
  };
}

async function cleanupTest(context: TestContext) {
  await supabase.from('ticket_inventory').delete().eq('event_id', context.eventId);
  await supabase.from('ticket_types').delete().eq('event_id', context.eventId);
  await supabase.from('events').delete().eq('id', context.eventId);
  await supabase.from('organizers').delete().eq('id', context.organizerId);
  await supabase.from('cities').delete().eq('id', context.cityId);
}

Deno.test('Concurrency Test: Multiple users racing for last tickets', async () => {
  const context = await setupTestEvent();
  
  try {
    // Set inventory to 5 available tickets
    await supabase
      .from('ticket_inventory')
      .update({ sold_count: 5, reserved_count: 0 })
      .eq('event_id', context.eventId);

    // Simulate 10 concurrent reservation attempts
    const promises = Array.from({ length: 10 }, async (_, i) => {
      const userId = `test-user-${i}`;
      
      const { data, error } = await supabase.rpc('create_reservation', {
        p_event_id: context.eventId,
        p_ticket_type_id: context.ticketTypeId,
        p_user_id: userId,
        p_quantity: 1,
        p_expires_in_minutes: 10,
      });

      return { userId, reservationId: data, error };
    });

    const results = await Promise.all(promises);
    
    // Count successes and failures
    const successes = results.filter(r => r.reservationId !== null);
    const failures = results.filter(r => r.reservationId === null);

    console.log(`✅ Successful reservations: ${successes.length}`);
    console.log(`❌ Failed reservations: ${failures.length}`);

    // Verify: Only 5 should succeed (we have 5 available)
    assertEquals(successes.length, 5, 'Should have exactly 5 successful reservations');
    assertEquals(failures.length, 5, 'Should have exactly 5 failed reservations');

    // Verify inventory integrity
    const { data: inventory } = await supabase
      .from('ticket_inventory')
      .select('*')
      .eq('event_id', context.eventId)
      .single();

    assert(inventory, 'Inventory should exist');
    assertEquals(
      inventory.sold_count + inventory.reserved_count,
      10,
      'All tickets should be sold or reserved'
    );
    assert(
      inventory.sold_count + inventory.reserved_count <= inventory.total_capacity,
      'Inventory should never exceed capacity'
    );

    console.log('✅ Inventory integrity verified');
  } finally {
    await cleanupTest(context);
  }
});

Deno.test('Concurrency Test: Same user multiple reservations', async () => {
  const context = await setupTestEvent();
  
  try {
    const userId = 'test-user-multiple';

    // User tries to reserve 3 times
    const reservations = await Promise.all([
      supabase.rpc('create_reservation', {
        p_event_id: context.eventId,
        p_ticket_type_id: context.ticketTypeId,
        p_user_id: userId,
        p_quantity: 2,
        p_expires_in_minutes: 10,
      }),
      supabase.rpc('create_reservation', {
        p_event_id: context.eventId,
        p_ticket_type_id: context.ticketTypeId,
        p_user_id: userId,
        p_quantity: 3,
        p_expires_in_minutes: 10,
      }),
      supabase.rpc('create_reservation', {
        p_event_id: context.eventId,
        p_ticket_type_id: context.ticketTypeId,
        p_user_id: userId,
        p_quantity: 5,
        p_expires_in_minutes: 10,
      }),
    ]);

    const successful = reservations.filter(r => r.data !== null);
    
    // Total requested: 2 + 3 + 5 = 10
    // Available: 10
    // Should all succeed
    assertEquals(successful.length, 3, 'All reservations should succeed if inventory allows');

    // Verify total reserved
    const { data: inventory } = await supabase
      .from('ticket_inventory')
      .select('reserved_count')
      .eq('event_id', context.eventId)
      .single();

    assertEquals(inventory?.reserved_count, 10, 'All 10 tickets should be reserved');
  } finally {
    await cleanupTest(context);
  }
});

Deno.test('Idempotency Test: Consume reservation twice', async () => {
  const context = await setupTestEvent();
  
  try {
    const userId = 'test-user-idempotent';

    // Create reservation
    const { data: reservationId } = await supabase.rpc('create_reservation', {
      p_event_id: context.eventId,
      p_ticket_type_id: context.ticketTypeId,
      p_user_id: userId,
      p_quantity: 1,
      p_expires_in_minutes: 10,
    });

    assert(reservationId, 'Reservation should be created');

    // Consume first time (should succeed)
    const { data: consumed1, error: error1 } = await supabase.rpc('consume_reservation', {
      p_reservation_id: reservationId,
      p_stripe_checkout_session_id: 'session-1',
    });

    assert(consumed1 === true, 'First consumption should succeed');
    assert(!error1, 'First consumption should not error');

    // Consume second time (should fail)
    const { data: consumed2, error: error2 } = await supabase.rpc('consume_reservation', {
      p_reservation_id: reservationId,
      p_stripe_checkout_session_id: 'session-2',
    });

    assert(consumed2 === false || error2, 'Second consumption should fail');
    
    console.log('✅ Idempotency test passed - reservation cannot be consumed twice');
  } finally {
    await cleanupTest(context);
  }
});

Deno.test('Expiration Test: Expired reservations are released', async () => {
  const context = await setupTestEvent();
  
  try {
    const userId = 'test-user-expired';

    // Create reservation with very short expiry (1 second)
    const { data: reservationId } = await supabase.rpc('create_reservation', {
      p_event_id: context.eventId,
      p_ticket_type_id: context.ticketTypeId,
      p_user_id: userId,
      p_quantity: 2,
      p_expires_in_minutes: 0.017, // ~1 second
    });

    assert(reservationId, 'Reservation should be created');

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try to consume (should fail - expired)
    const { data: consumed } = await supabase.rpc('consume_reservation', {
      p_reservation_id: reservationId,
      p_stripe_checkout_session_id: 'session-expired',
    });

    assert(consumed === false, 'Expired reservation should not be consumable');

    // Verify inventory was released
    const { data: inventory } = await supabase
      .from('ticket_inventory')
      .select('reserved_count')
      .eq('event_id', context.eventId)
      .single();

    assertEquals(inventory?.reserved_count, 0, 'Reserved count should be 0 after expiration');

    // Run cleanup
    const { data: cleaned } = await supabase.rpc('cleanup_expired_reservations');
    console.log(`✅ Cleaned up ${cleaned} expired reservations`);
  } finally {
    await cleanupTest(context);
  }
});

console.log('🧪 Running reservation concurrency tests...');
