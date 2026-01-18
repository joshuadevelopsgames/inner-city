# Offline Scanning Guide

## Overview

This guide explains what can and cannot be validated offline when scanning QR tickets, and how to implement a hybrid offline/online validation system.

## Validation Capabilities

### What CAN Be Validated Offline

#### Mode A (Signed Tokens)

✅ **Signature Verification**
- If `qr_secret` is cached, can verify HMAC signature
- Proves token authenticity and integrity

✅ **Token Expiration Check**
- Can check if `issued_at + 24 hours < current_time`
- Requires accurate device clock

❌ **Nonce Reuse Check**
- Requires database lookup in `used_nonces` table
- Cannot prevent replay attacks offline

❌ **Ticket Status Check**
- Requires database lookup
- Cannot detect refunded/revoked tickets offline

#### Mode B (Rotating Tokens)

✅ **Signature Verification**
- If `qr_secret` is cached, can verify HMAC signature

✅ **Time Window Freshness**
- Can check if token's time window is current (within 1-2 windows)
- Requires accurate device clock and NTP sync

✅ **Rotation Nonce Check**
- If `qr_rotation_nonce` is cached, can verify it matches
- Allows small tolerance (±1) for concurrent scans

❌ **Ticket Status Check**
- Requires database lookup
- Cannot detect refunded/revoked tickets offline

## Offline Validation Strategy

### Phase 1: Pre-Event Sync

Before the event starts, download all necessary data:

```typescript
interface OfflineTicketCache {
  ticket_id: string;
  qr_secret: string;
  qr_rotation_nonce: number;
  status: 'active' | 'used' | 'refunded' | 'revoked';
  event_id: string;
  buyer_id: string;
  last_updated: number; // timestamp
}

async function syncEventTickets(eventId: string): Promise<OfflineTicketCache[]> {
  const { data } = await supabase
    .from('tickets')
    .select('id, qr_secret, qr_rotation_nonce, status, event_id, buyer_id, updated_at')
    .eq('event_id', eventId)
    .eq('status', 'active'); // Only sync active tickets
  
  return data.map(ticket => ({
    ticket_id: ticket.id,
    qr_secret: ticket.qr_secret,
    qr_rotation_nonce: ticket.qr_rotation_nonce,
    status: ticket.status,
    event_id: ticket.event_id,
    buyer_id: ticket.buyer_id,
    last_updated: new Date(ticket.updated_at).getTime(),
  }));
}
```

### Phase 2: Offline Validation

```typescript
interface ValidationResult {
  valid: boolean;
  ticket_id: string | null;
  reason: string;
  requiresOnlineCheck: boolean;
}

async function validateTokenOffline(
  tokenString: string,
  cachedTickets: Map<string, OfflineTicketCache>,
  mode: 'A' | 'B' = 'A'
): Promise<ValidationResult> {
  try {
    const token = parseQRToken(tokenString);
    const cached = cachedTickets.get(token.t);
    
    if (!cached) {
      return {
        valid: false,
        ticket_id: token.t,
        reason: 'Ticket not found in cache',
        requiresOnlineCheck: true, // Might be valid, need to check online
      };
    }
    
    // Check ticket status (from cache)
    if (cached.status !== 'active') {
      return {
        valid: false,
        ticket_id: token.t,
        reason: `Ticket status is ${cached.status}`,
        requiresOnlineCheck: false, // Definitely invalid
      };
    }
    
    // Verify signature
    let payload: string;
    if (mode === 'A') {
      payload = `${token.t}|${token.i}|${token.n}`;
    } else {
      payload = `${token.t}|${token.w}|${token.r}`;
    }
    
    // Note: HMAC verification requires crypto library
    // In browser: use Web Crypto API
    // In Node: use crypto module
    const isValidSignature = await verifyHMAC(
      payload,
      cached.qr_secret,
      token.s
    );
    
    if (!isValidSignature) {
      return {
        valid: false,
        ticket_id: token.t,
        reason: 'Invalid signature',
        requiresOnlineCheck: false,
      };
    }
    
    // Check expiration/freshness
    if (mode === 'A') {
      const expiresAt = token.i + (24 * 60 * 60);
      if (Date.now() / 1000 >= expiresAt) {
        return {
          valid: false,
          ticket_id: token.t,
          reason: 'Token expired',
          requiresOnlineCheck: false,
        };
      }
    } else {
      const now = Math.floor(Date.now() / 1000);
      const currentWindow = Math.floor(now / 60) * 60; // 60s rotation
      const windowDiff = Math.abs(currentWindow - token.w);
      
      if (windowDiff > 120) { // 2 windows tolerance
        return {
          valid: false,
          ticket_id: token.t,
          reason: 'Token time window expired',
          requiresOnlineCheck: false,
        };
      }
      
      // Check rotation nonce
      if (Math.abs(cached.qr_rotation_nonce - token.r) > 1) {
        return {
          valid: false,
          ticket_id: token.t,
          reason: 'Rotation nonce mismatch',
          requiresOnlineCheck: true, // Cache might be stale
        };
      }
    }
    
    // Mode A: Cannot check nonce reuse offline
    if (mode === 'A') {
      return {
        valid: true,
        ticket_id: token.t,
        reason: 'Token validated offline (nonce check pending)',
        requiresOnlineCheck: true, // Need to check nonce reuse
      };
    }
    
    // Mode B: All checks passed
    return {
      valid: true,
      ticket_id: token.t,
      reason: 'Token validated offline',
      requiresOnlineCheck: false,
    };
  } catch (error) {
    return {
      valid: false,
      ticket_id: null,
      reason: `Validation error: ${error.message}`,
      requiresOnlineCheck: true,
    };
  }
}
```

### Phase 3: Online Verification Queue

```typescript
interface PendingCheckIn {
  token: string;
  scanned_at: number;
  scanner_id: string;
  device_id: string;
  offline_validation: ValidationResult;
}

class CheckInQueue {
  private queue: PendingCheckIn[] = [];
  private isOnline: boolean = navigator.onLine;
  
  constructor() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processQueue();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }
  
  async addCheckIn(checkIn: PendingCheckIn): Promise<void> {
    this.queue.push(checkIn);
    
    // Try to process immediately if online
    if (this.isOnline) {
      await this.processQueue();
    }
  }
  
  async processQueue(): Promise<void> {
    if (!this.isOnline || this.queue.length === 0) {
      return;
    }
    
    while (this.queue.length > 0) {
      const checkIn = this.queue.shift()!;
      
      try {
        // Validate online
        const { data } = await supabase.functions.invoke('validate-qr-token', {
          body: { token: checkIn.token },
        });
        
        if (data.valid) {
          // Finalize check-in
          await this.finalizeCheckIn(checkIn, data);
        } else {
          // Log rejection
          console.warn('Check-in rejected:', data.reason);
        }
      } catch (error) {
        // Re-queue on error
        this.queue.unshift(checkIn);
        break;
      }
    }
  }
  
  async finalizeCheckIn(
    checkIn: PendingCheckIn,
    validation: any
  ): Promise<void> {
    // Call check-in Edge Function to mark ticket as used
    await supabase.functions.invoke('check-in-ticket', {
      body: {
        ticket_id: validation.ticket_id,
        scanner_user_id: checkIn.scanner_id,
        device_id: checkIn.device_id,
      },
    });
  }
}
```

## Implementation Recommendations

### Scanner App Architecture

```
┌─────────────────────────────────────────┐
│         Scanner App                      │
├─────────────────────────────────────────┤
│                                          │
│  ┌──────────────┐    ┌──────────────┐   │
│  │  QR Scanner  │───▶│  Token      │   │
│  │              │    │  Parser     │   │
│  └──────────────┘    └──────────────┘   │
│         │                    │           │
│         ▼                    ▼           │
│  ┌──────────────────────────────────┐   │
│  │  Offline Validator               │   │
│  │  - Signature check               │   │
│  │  - Expiration check              │   │
│  │  - Status check (cached)         │   │
│  └──────────────────────────────────┘   │
│         │                                │
│         ▼                                │
│  ┌──────────────────────────────────┐   │
│  │  Check-In Queue                  │   │
│  │  - Pending verifications          │   │
│  │  - Online sync                   │   │
│  └──────────────────────────────────┘   │
│         │                                │
│         ▼                                │
│  ┌──────────────────────────────────┐   │
│  │  Online Validator                │   │
│  │  - Nonce reuse check             │   │
│  │  - Final status check            │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Cache Management

**Storage:** Use IndexedDB or SQLite (React Native)

**Cache Structure:**
```typescript
interface EventCache {
  event_id: string;
  tickets: Map<string, OfflineTicketCache>;
  synced_at: number;
  expires_at: number; // Event end time + 1 hour
}
```

**Sync Strategy:**
1. Sync 1 hour before event starts
2. Re-sync every 15 minutes while online
3. Cache expires 1 hour after event ends
4. Clear cache after event completion

### Conflict Resolution

**Scenario:** Ticket scanned on multiple offline devices

**Solution:**
1. Both devices mark as "pending"
2. First device to sync wins
3. Second device gets "already checked in" error
4. Show clear message to scanner

```typescript
async function handleConflict(
  ticketId: string,
  deviceId: string
): Promise<void> {
  // Check if ticket was checked in by another device
  const { data } = await supabase
    .from('check_in_logs')
    .select('scanner_device_id, created_at')
    .eq('ticket_id', ticketId)
    .eq('result', 'valid')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (data && data.scanner_device_id !== deviceId) {
    throw new Error(
      `Ticket already checked in by device ${data.scanner_device_id} at ${data.created_at}`
    );
  }
}
```

## Limitations & Trade-offs

### Offline Limitations

1. **Cannot prevent double-check-in** if same ticket scanned on multiple offline devices simultaneously
2. **Stale cache risk** - Ticket status might change (refunded, revoked) after sync
3. **Clock skew** - Requires accurate device time (NTP sync recommended)
4. **Nonce tracking** (Mode A) - Cannot prevent replay attacks offline

### Recommended Approach

**Hybrid Validation:**

1. ✅ **Offline**: Validate signature, expiration, basic status
2. ⚠️ **Queue**: Mark as "pending verification"
3. ✅ **Online**: Final validation, nonce check, conflict resolution
4. ✅ **UI**: Show "pending" status, auto-update when synced

**User Experience:**
- Scanner sees immediate feedback (green/yellow/red)
- "Pending" status shown until online verification
- Automatic sync when network available
- Clear error messages for conflicts

## Testing Offline Mode

### Test Scenarios

1. **Valid token, online**: Should validate immediately
2. **Valid token, offline**: Should validate offline, queue for sync
3. **Expired token**: Should reject immediately (offline or online)
4. **Invalid signature**: Should reject immediately
5. **Double scan offline**: Both should queue, first to sync wins
6. **Cache stale**: Should detect and re-sync
7. **Network restored**: Should process queue automatically

### Test Checklist

- [ ] Offline validation works with cached data
- [ ] Queue persists across app restarts
- [ ] Conflicts resolved correctly
- [ ] Cache syncs before event
- [ ] Cache expires after event
- [ ] Clock skew handled gracefully
- [ ] Error messages are clear
