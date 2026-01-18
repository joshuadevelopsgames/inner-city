# Conflict Resolution Rules

## Overview

When multiple devices scan the same ticket offline, conflicts can occur. This document defines how conflicts are detected and resolved.

## Conflict Scenarios

### Scenario 1: Concurrent Offline Scans

**Situation:**
- Device A scans ticket X offline → Marks as used locally
- Device B scans ticket X offline → Marks as used locally
- Both devices queue scan for sync

**Resolution:**
1. First device to sync successfully wins
2. Second device gets conflict when syncing
3. Show conflict message with details
4. User can accept (ticket was legitimately checked in) or reject (investigate)

### Scenario 2: Stale Cache

**Situation:**
- Device has cached ticket status = 'active'
- Ticket was actually refunded/revoked on server
- Device scans ticket offline → Validates as valid

**Resolution:**
1. Mark scan as "needs online validation"
2. When online, validate against server
3. If server says invalid, update local cache
4. Show error: "Ticket was refunded/revoked"

### Scenario 3: Network Interruption During Sync

**Situation:**
- Device syncs scan → Network drops mid-request
- Scan status unclear (may or may not have succeeded)

**Resolution:**
1. Mark scan as "syncing" (not "synced")
2. On network restore, check server state
3. If ticket already checked in, mark as conflict
4. If not checked in, retry sync

## Conflict Detection

### Server-Side Detection

```sql
-- Check if ticket already checked in
SELECT EXISTS(
  SELECT 1 FROM check_in_logs
  WHERE ticket_id = $1
    AND result = 'valid'
) AS already_checked_in;
```

### Client-Side Detection

```typescript
// Before syncing, check if ticket was already checked in locally
const localStatus = cache.getTicket(ticketId)?.status;
if (localStatus === 'used') {
  // May be conflict if another device also scanned
  markAsPotentialConflict(scan);
}
```

## Resolution Rules

### Rule 1: Server Authority

**Always trust server state over local cache**

- If server says ticket is used → Accept conflict
- If server says ticket is invalid → Update cache, show error
- If server says ticket is active → Proceed with check-in

### Rule 2: First-to-Sync Wins

**First successful sync takes precedence**

- Device A syncs first → Ticket marked as used
- Device B syncs second → Conflict detected
- Device B must accept conflict or investigate

### Rule 3: Time-Based Priority

**If both sync simultaneously, earliest scan time wins**

- Compare `scanned_at` timestamps
- Earlier scan takes precedence
- Later scan gets conflict

### Rule 4: Manual Override

**Staff can manually resolve conflicts**

- Accept: Acknowledge ticket was checked in elsewhere
- Reject: Flag for investigation (possible fraud)
- Override: Force check-in (requires admin permission)

## Conflict Resolution UI

### Conflict Card

```
┌─────────────────────────────────────┐
│ ⚠ Conflict Detected                │
├─────────────────────────────────────┤
│ Ticket: abc123...                   │
│                                     │
│ Scanned by you:                     │
│ 2024-01-15 20:30:15                 │
│                                     │
│ Already checked in by:              │
│ Device: scanner-456                  │
│ Time: 2024-01-15 20:29:42           │
│                                     │
│ [Accept] [Reject] [Details]         │
└─────────────────────────────────────┘
```

### Accept Action

- Removes scan from queue
- Updates local cache (ticket = used)
- Logs conflict resolution
- No further action needed

### Reject Action

- Keeps scan in "conflicts" queue
- Flags for manual review
- Admin can investigate
- Possible fraud indicator

### Details View

- Full scan history for ticket
- All devices that scanned it
- Timestamps and locations
- Resolution history

## Implementation

### Conflict Detection Code

```typescript
async function detectConflict(
  scan: QueuedScan,
  serverResponse: any
): Promise<ConflictInfo | null> {
  // Check if server says already checked in
  if (serverResponse.error?.includes('already checked in')) {
    // Get who checked it in
    const checkInLog = await getCheckInLog(scan.ticketId);
    
    return {
      type: 'already_checked_in',
      scannedBy: scan.scannerDeviceId,
      scannedAt: scan.scannedAt,
      checkedInBy: checkInLog.scannerDeviceId,
      checkedInAt: checkInLog.createdAt,
      message: `Ticket was checked in by ${checkInLog.scannerDeviceId} at ${checkInLog.createdAt}`,
    };
  }
  
  return null;
}
```

### Conflict Resolution Code

```typescript
async function resolveConflict(
  conflict: ConflictInfo,
  resolution: 'accept' | 'reject'
): Promise<void> {
  if (resolution === 'accept') {
    // Update local cache
    await updateTicketStatus(conflict.ticketId, 'used');
    
    // Remove from queue
    await removeFromQueue(conflict.scanId);
    
    // Log resolution
    await logConflictResolution(conflict, 'accepted');
  } else {
    // Keep in conflicts queue
    await markForReview(conflict.scanId);
    
    // Log resolution
    await logConflictResolution(conflict, 'rejected');
  }
}
```

## Fraud Detection

### Suspicious Patterns

1. **Multiple conflicts for same device**
   - Device has > 5 conflicts in 1 hour
   - Possible: Device scanning fake tickets

2. **Rapid conflict rate**
   - > 10 conflicts per minute
   - Possible: Automated scanning or bug

3. **Same ticket, multiple devices**
   - Ticket scanned on 3+ devices
   - Possible: Screenshot sharing or fraud

### Alerts

- Notify organizer of high conflict rate
- Flag devices with suspicious patterns
- Review tickets with multiple conflicts

## Best Practices

1. **Pre-event sync**: Download fresh cache 1 hour before event
2. **Periodic sync**: Re-sync cache every 15 minutes if online
3. **Clear conflicts**: Resolve conflicts before event ends
4. **Monitor patterns**: Watch for suspicious conflict patterns
5. **Staff training**: Train staff on conflict resolution

## Testing

### Test Cases

1. **Two devices, same ticket**: Should detect conflict
2. **Stale cache conflict**: Should update cache and show error
3. **Network interruption**: Should retry and detect conflicts
4. **Accept conflict**: Should update cache and remove from queue
5. **Reject conflict**: Should flag for review
