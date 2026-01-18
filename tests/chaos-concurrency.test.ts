/**
 * Chaos Concurrency Test
 * 
 * Stress test simulating hundreds of simultaneous operations:
 * - Concurrent purchases
 * - Concurrent check-ins
 * - Concurrent transfers
 * - Concurrent refunds
 * 
 * Validates all invariants hold under extreme load.
 * 
 * Run with: deno test --allow-net --allow-env tests/chaos-concurrency.test.ts
 */

import { assertEquals, assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  setupTestEvent,
  cleanupTest,
  createTestUser,
  getInventory,
  verifyInventoryInvariant,
  createReservation,
  simulateCheckout,
  checkInTicket,
  getCheckInCount,
  supabase,
  TestContext,
} from './test-helpers.ts';

Deno.test('Chaos Test: 500 concurrent operations', async () => {
  const context = await setupTestEvent(200, 2500); // 200 tickets available
  
  try {
    console.log('🚀 Starting chaos test with 500 concurrent operations...');

    // Create test users
    const userIds = await Promise.all(
      Array.from({ length: 200 }, () => createTestUser())
    );
    context.userIds = userIds;

    const scannerIds = await Promise.all(
      Array.from({ length: 50 }, () => createTestUser())
    );
    context.userIds.push(...scannerIds);

    // Track operations
    const operations = {
      purchases: { attempted: 0, succeeded: 0, failed: 0 },
      checkIns: { attempted: 0, succeeded: 0, failed: 0 },
      transfers: { attempted: 0, succeeded: 0, failed: 0 },
      refunds: { attempted: 0, succeeded: 0, failed: 0 },
    };

    // Operation 1: 200 concurrent purchase attempts
    console.log('📦 Starting 200 concurrent purchases...');
    const purchasePromises = userIds.slice(0, 200).map(async (userId, index) => {
      operations.purchases.attempted++;
      try {
        const reservationId = await createReservation(
          context.eventId,
          context.ticketTypeId,
          userId,
          1
        );
        
        if (reservationId) {
          context.reservationIds.push(reservationId);
          const checkout = await simulateCheckout(
            reservationId,
            `pi_chaos_${index}_${Date.now()}`
          );
          
          if (checkout) {
            context.ticketIds.push(checkout.ticketId);
            context.paymentIds.push(checkout.paymentId);
            operations.purchases.succeeded++;
            return { success: true, ticketId: checkout.ticketId };
          }
        }
        operations.purchases.failed++;
        return { success: false };
      } catch (e) {
        operations.purchases.failed++;
        return { success: false, error: e };
      }
    });

    const purchaseResults = await Promise.all(purchasePromises);
    const successfulPurchases = purchaseResults.filter(r => r.success);
    
    console.log(`✅ Purchases: ${operations.purchases.succeeded} succeeded, ${operations.purchases.failed} failed`);

    // Verify inventory invariant after purchases
    const inventoryAfterPurchases = await getInventory(context.eventId);
    assert(
      inventoryAfterPurchases.sold_count + inventoryAfterPurchases.reserved_count <= inventoryAfterPurchases.total_capacity,
      `Inventory invariant violated after purchases: ${inventoryAfterPurchases.sold_count} + ${inventoryAfterPurchases.reserved_count} > ${inventoryAfterPurchases.total_capacity}`
    );
    assert(inventoryAfterPurchases.sold_count >= 0, 'Sold count should never be negative');
    assert(inventoryAfterPurchases.reserved_count >= 0, 'Reserved count should never be negative');

    // Operation 2: 150 concurrent check-in attempts
    console.log('🎫 Starting 150 concurrent check-ins...');
    const ticketIdsToCheckIn = successfulPurchases
      .filter(r => r.ticketId)
      .map(r => r.ticketId!)
      .slice(0, 150);

    const checkInPromises = ticketIdsToCheckIn.map(async (ticketId, index) => {
      operations.checkIns.attempted++;
      try {
        const scannerId = scannerIds[index % scannerIds.length];
        const deviceId = `device-${index}`;
        const success = await checkInTicket(ticketId, scannerId, deviceId);
        
        if (success) {
          operations.checkIns.succeeded++;
        } else {
          operations.checkIns.failed++;
        }
        return { ticketId, success };
      } catch (e) {
        operations.checkIns.failed++;
        return { ticketId, success: false, error: e };
      }
    });

    const checkInResults = await Promise.all(checkInPromises);
    
    console.log(`✅ Check-ins: ${operations.checkIns.succeeded} succeeded, ${operations.checkIns.failed} failed`);

    // Verify: Each ticket checked in at most once
    for (const ticketId of ticketIdsToCheckIn) {
      const checkInCount = await getCheckInCount(ticketId);
      assert(
        checkInCount <= 1,
        `Ticket ${ticketId} checked in ${checkInCount} times (should be at most 1)`
      );
    }

    // Operation 3: 100 concurrent transfer attempts
    console.log('🔄 Starting 100 concurrent transfers...');
    const ticketsToTransfer = successfulPurchases
      .filter(r => r.ticketId)
      .map(r => r.ticketId!)
      .slice(0, 100);

    const transferPromises = ticketsToTransfer.map(async (ticketId, index) => {
      operations.transfers.attempted++;
      try {
        // Get ticket owner
        const { data: ticket } = await supabase
          .from('tickets')
          .select('buyer_id, status')
          .eq('id', ticketId)
          .single();

        if (!ticket || ticket.status !== 'active') {
          operations.transfers.failed++;
          return { ticketId, success: false, reason: 'Ticket not active' };
        }

        // Create new user for transfer
        const newUserId = await createTestUser();
        context.userIds.push(newUserId);

        // Create transfer
        const transferId = crypto.randomUUID();
        const { error } = await supabase.from('ticket_transfers').insert({
          id: transferId,
          ticket_id: ticketId,
          from_user_id: ticket.buyer_id,
          to_user_id: newUserId,
          status: 'completed',
          completed_at: new Date().toISOString(),
        });

        if (error) {
          operations.transfers.failed++;
          return { ticketId, success: false, error: error.message };
        }

        // Update ownership
        await supabase
          .from('tickets')
          .update({ buyer_id: newUserId })
          .eq('id', ticketId);

        operations.transfers.succeeded++;
        return { ticketId, success: true };
      } catch (e) {
        operations.transfers.failed++;
        return { ticketId, success: false, error: e };
      }
    });

    const transferResults = await Promise.all(transferPromises);
    
    console.log(`✅ Transfers: ${operations.transfers.succeeded} succeeded, ${operations.transfers.failed} failed`);

    // Operation 4: 50 concurrent refund attempts
    console.log('💰 Starting 50 concurrent refunds...');
    const ticketsToRefund = successfulPurchases
      .filter(r => r.ticketId)
      .map(r => r.ticketId!)
      .slice(0, 50);

    const refundPromises = ticketsToRefund.map(async (ticketId) => {
      operations.refunds.attempted++;
      try {
        // Get payment
        const { data: payment } = await supabase
          .from('payments')
          .select('id, status')
          .eq('ticket_id', ticketId)
          .single();

        if (!payment || payment.status === 'refunded') {
          operations.refunds.failed++;
          return { ticketId, success: false, reason: 'Already refunded or not found' };
        }

        // Refund payment
        await supabase
          .from('payments')
          .update({ status: 'refunded' })
          .eq('id', payment.id);

        // Refund ticket
        await supabase
          .from('tickets')
          .update({ status: 'refunded' })
          .eq('id', ticketId);

        operations.refunds.succeeded++;
        return { ticketId, success: true };
      } catch (e) {
        operations.refunds.failed++;
        return { ticketId, success: false, error: e };
      }
    });

    const refundResults = await Promise.all(refundPromises);
    
    console.log(`✅ Refunds: ${operations.refunds.succeeded} succeeded, ${operations.refunds.failed} failed`);

    // Final verification: All invariants hold
    console.log('\n🔍 Verifying invariants...');

    // Invariant 1: Inventory never negative
    const finalInventory = await getInventory(context.eventId);
    const inventoryValid = await verifyInventoryInvariant(context.eventId);
    assert(inventoryValid, 'Inventory invariant must hold');
    console.log(`✅ Inventory invariant: ${finalInventory.sold_count} sold, ${finalInventory.reserved_count} reserved, ${finalInventory.total_capacity} total`);

    // Invariant 2: Tickets checked in at most once
    let allTicketsValid = true;
    for (const ticketId of ticketIdsToCheckIn) {
      const count = await getCheckInCount(ticketId);
      if (count > 1) {
        console.error(`❌ Ticket ${ticketId} checked in ${count} times`);
        allTicketsValid = false;
      }
    }
    assert(allTicketsValid, 'All tickets should be checked in at most once');
    console.log('✅ All tickets checked in at most once');

    // Invariant 3: Refunded tickets are invalid
    const { data: refundedTickets } = await supabase
      .from('tickets')
      .select('id, status')
      .in('id', ticketsToRefund);
    
    const allRefunded = refundedTickets?.every(t => t.status === 'refunded');
    assert(allRefunded, 'All refunded tickets should have status "refunded"');
    console.log('✅ All refunded tickets are invalid');

    // Summary
    console.log('\n📊 Chaos Test Summary:');
    console.log(`   Purchases: ${operations.purchases.succeeded}/${operations.purchases.attempted} succeeded`);
    console.log(`   Check-ins: ${operations.checkIns.succeeded}/${operations.checkIns.attempted} succeeded`);
    console.log(`   Transfers: ${operations.transfers.succeeded}/${operations.transfers.attempted} succeeded`);
    console.log(`   Refunds: ${operations.refunds.succeeded}/${operations.refunds.attempted} succeeded`);
    console.log(`\n✅ All invariants hold under extreme load!`);

  } finally {
    await cleanupTest(context);
  }
});

Deno.test('Chaos Test: Rapid sequential operations', async () => {
  const context = await setupTestEvent(100, 2500);
  
  try {
    const userId = await createTestUser();
    context.userIds.push(userId);

    // Rapidly create and consume reservations
    const rapidOps = Array.from({ length: 50 }, async (_, index) => {
      const reservationId = await createReservation(
        context.eventId,
        context.ticketTypeId,
        userId,
        1
      );
      
      if (reservationId) {
        context.reservationIds.push(reservationId);
        const checkout = await simulateCheckout(
          reservationId,
          `pi_rapid_${index}`
        );
        if (checkout) {
          context.ticketIds.push(checkout.ticketId);
          context.paymentIds.push(checkout.paymentId);
        }
      }
    });

    await Promise.all(rapidOps);

    // Verify inventory
    const inventory = await getInventory(context.eventId);
    assert(
      inventory.sold_count + inventory.reserved_count <= inventory.total_capacity,
      'Inventory invariant must hold'
    );

    console.log('✅ Rapid sequential operations handled correctly');
  } finally {
    await cleanupTest(context);
  }
});

console.log('🌪️  Running chaos concurrency tests...');
