# Scanner Mode Specification

## Overview

Offline-first scanner app for organizers/staff to check in tickets at events. Works without internet connection, syncs when online.

## Scan Result States

### VALID
- Token signature valid
- Ticket status is 'active'
- Token not expired
- Not already checked in locally
- **Action**: Mark as used locally, add to sync queue

### ALREADY_USED
- Ticket was previously checked in (local cache or online)
- **Action**: Show warning, do not add to sync queue

### INVALID
- Unknown ticket (not in cache)
- Bad signature
- Token expired
- Ticket status is not 'active'
- **Action**: Show error, optionally add to "needs review" queue

### NEEDS_ONLINE_VALIDATION
- Offline and token requires online check (Mode A nonce, Mode B freshness)
- Cache might be stale
- **Action**: Queue for online validation, show "pending" status

## Data Structures

### Local Ticket Cache

```typescript
interface CachedTicket {
  ticket_id: string;
  event_id: string;
  qr_secret: string;
  qr_rotation_nonce: number;
  status: 'active' | 'used' | 'refunded' | 'revoked';
  buyer_id: string;
  ticket_type: string;
  cached_at: number; // timestamp
}

interface EventCache {
  event_id: string;
  event_title: string;
  start_at: string;
  end_at: string;
  tickets: Map<string, CachedTicket>;
  synced_at: number;
  expires_at: number; // After event ends
}
```

### Sync Queue

```typescript
interface QueuedScan {
  id: string; // Local UUID
  ticket_id: string;
  event_id: string;
  token: string; // Original token string
  scanned_at: number; // Unix timestamp
  scanner_user_id: string;
  scanner_device_id: string;
  result: 'valid' | 'invalid' | 'needs_validation';
  local_status: 'pending' | 'synced' | 'conflict' | 'failed';
  conflict_resolution?: 'accepted' | 'rejected';
  location?: { lat: number; lng: number };
  error_message?: string;
  retry_count: number;
  created_at: number;
  synced_at?: number;
}

interface SyncQueue {
  scans: QueuedScan[];
  last_sync_at: number;
  pending_count: number;
}
```

## Conflict Resolution Rules

### Rule 1: First-to-Sync Wins
- When multiple devices scan same ticket offline:
- First device to sync successfully wins
- Other devices get "already checked in" error
- Show clear message: "Ticket was checked in by [device] at [time]"

### Rule 2: Server Authority
- Server validation always takes precedence
- If server says ticket is invalid, local "valid" is overridden
- Update local cache with server response

### Rule 3: Stale Cache Handling
- If cache is older than 5 minutes, mark as "needs validation"
- Prefer online validation for stale data
- Show warning: "Cache may be outdated, verifying online..."

### Rule 4: Concurrent Scans
- If same ticket scanned on same device within 1 second, ignore duplicate
- If scanned on different devices, both queue, first sync wins

### Rule 5: Network Interruption
- If sync fails mid-upload, retry with exponential backoff
- Max 3 retries, then mark as "failed"
- Manual retry option for failed scans

## UI States and Interaction Flow

### State Machine

```
┌─────────────┐
│   IDLE      │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│  SCANNING   │────▶│  PROCESSING  │
└─────────────┘     └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
  ┌─────────┐      ┌──────────────┐    ┌─────────────┐
  │  VALID  │      │ ALREADY_USED │    │   INVALID   │
  └────┬────┘      └──────────────┘    └─────────────┘
       │
       ▼
  ┌─────────┐
  │ QUEUED  │
  └────┬────┘
       │
       ▼
  ┌─────────┐
  │ SYNCING │
  └────┬────┘
       │
   ┌───┴───┐
   │       │
   ▼       ▼
SYNCED  CONFLICT
```

### UI Screens

#### 1. Event Selection Screen
- List of events user is staff for
- Show sync status (synced, needs sync, offline)
- "Download Tickets" button for each event

#### 2. Scanner Screen
- Large camera viewfinder
- Current event name (top)
- Scan count (valid/invalid/total)
- Network status indicator
- Queue count badge

#### 3. Scan Result Overlay
- **VALID**: Green checkmark, "✓ Valid Ticket"
- **ALREADY_USED**: Yellow warning, "⚠ Already Checked In"
- **INVALID**: Red X, "✗ Invalid Ticket"
- **NEEDS_VALIDATION**: Blue spinner, "⏳ Verifying..."

#### 4. Sync Queue Screen
- List of pending scans
- Status indicators
- Manual retry buttons
- Conflict resolution UI

## Performance Requirements

- **Scan Response**: < 200ms from QR read to result display
- **Cache Lookup**: < 10ms (use Map/HashMap)
- **Sync Batch**: Upload up to 100 scans per request
- **Offline Storage**: SQLite/IndexedDB for persistence

## Security Considerations

- Cache encrypted at rest (device encryption)
- QR secrets stored securely (Keychain/Keystore)
- Scanner authentication required (JWT token)
- Device ID tracking for fraud detection
