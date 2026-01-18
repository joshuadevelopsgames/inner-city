# Inner City Scanner App

Flutter-based offline-first scanner app for organizers/staff to check in tickets.

## Architecture

### Data Flow

```
QR Code Scan
    ↓
Parse Token
    ↓
Check Local Cache
    ↓
Validate Offline
    ↓
[VALID] → Mark Used Locally → Queue for Sync
[INVALID] → Show Error
[NEEDS_ONLINE] → Queue for Online Validation
    ↓
When Online → Sync Queue → Server Validation
    ↓
Resolve Conflicts → Update Local Cache
```

## Setup

### Dependencies

Add to `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  mobile_scanner: ^3.5.0
  shared_preferences: ^2.2.0
  connectivity_plus: ^5.0.0
  http: ^1.1.0
  crypto: ^3.0.0
  sqflite: ^2.3.0  # For sync queue persistence
```

### Environment Variables

Create `.env` file:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SCANNER_USER_ID=staff-user-id
```

## Key Features

### Offline-First

- Downloads ticket cache before event
- Validates tokens offline using cached data
- Queues scans for sync when online
- Works without internet connection

### Fast Scanning

- < 200ms response time
- Instant feedback (valid/invalid)
- Auto-dismiss result overlay
- Continuous scanning mode

### Conflict Resolution

- First-to-sync wins
- Clear conflict messages
- Manual conflict resolution UI
- Retry failed syncs

## Usage

### 1. Download Event Tickets

```dart
final cacheService = TicketCacheService();
await cacheService.cacheEventTickets(
  eventId,
  tickets, // From API
  eventTitle,
  startAt,
  endAt,
);
```

### 2. Scan Ticket

```dart
final scannerService = ScannerService(
  cacheService: cacheService,
  syncService: syncService,
  currentEventId: eventId,
);

final result = await scannerService.scanToken(
  qrTokenString,
  scannerUserId,
  deviceId,
);
```

### 3. Sync Queue

```dart
await scannerService.processSyncQueue();
```

## Conflict Resolution

### Scenario: Two devices scan same ticket offline

1. **Device A** scans → Marks as used locally → Queues for sync
2. **Device B** scans → Marks as used locally → Queues for sync
3. **Device A** syncs first → Server confirms → Ticket marked as used
4. **Device B** syncs → Server rejects (already used) → Conflict detected
5. **Device B** shows: "Ticket was checked in by Device A at [time]"
6. User can accept (ticket was legitimately checked in) or reject (investigate)

### Conflict Resolution UI

- **Accept**: Acknowledge conflict, remove from queue
- **Reject**: Keep in queue for manual review
- **Details**: Show who checked in, when, device ID

## Testing

### Test Scenarios

1. **Valid ticket, online**: Should validate and sync immediately
2. **Valid ticket, offline**: Should validate offline, queue for sync
3. **Invalid token**: Should reject immediately
4. **Already used**: Should show warning
5. **Stale cache**: Should mark as "needs online validation"
6. **Conflict**: Should show conflict resolution UI
7. **Network restored**: Should auto-sync queue

## Performance Targets

- Scan response: < 200ms
- Cache lookup: < 10ms
- Sync batch: 100 scans per request
- Offline storage: SQLite for queue persistence

## Security

- Cache encrypted at rest (Flutter Secure Storage)
- QR secrets stored securely (Keychain/Keystore)
- Scanner authentication required
- Device ID tracking for fraud detection

## Next Steps

1. Implement SQLite queue persistence
2. Add event selection screen
3. Implement cache download from API
4. Add conflict resolution UI
5. Add analytics and reporting
6. Add sound/haptic feedback for scans
