# Scanner Mode Integration Guide

## Overview

This document describes how the offline-first scanner app integrates with the Inner City ticketing backend.

## Architecture

```
┌─────────────────┐
│  Scanner App    │
│  (Flutter)      │
└────────┬────────┘
         │
         │ 1. Download Tickets
         ▼
┌─────────────────┐
│  Edge Function  │
│  download-event │
│  -tickets       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │
│   tickets table │
└─────────────────┘

┌─────────────────┐
│  Scanner App    │
│  (Offline)      │
└────────┬────────┘
         │
         │ 2. Scan QR Code
         ▼
┌─────────────────┐
│  Local Cache    │
│  (SharedPrefs)  │
└────────┬────────┘
         │
         │ 3. Validate Offline
         ▼
┌─────────────────┐
│  QR Validator   │
│  (Crypto)       │
└────────┬────────┘
         │
         │ 4. Queue for Sync
         ▼
┌─────────────────┐
│  Sync Queue     │
│  (SQLite)       │
└────────┬────────┘
         │
         │ 5. When Online
         ▼
┌─────────────────┐
│  Edge Function  │
│  check-in-ticket│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │
│   check_in_logs │
└─────────────────┘
```

## API Endpoints

### 1. Download Event Tickets

**Endpoint:** `GET /functions/v1/download-event-tickets?event_id={event_id}`

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "event_id": "uuid",
  "event_title": "Event Name",
  "start_at": "2024-01-15T20:00:00Z",
  "end_at": "2024-01-16T02:00:00Z",
  "tickets": [
    {
      "ticket_id": "uuid",
      "event_id": "uuid",
      "qr_secret": "secret-key",
      "qr_rotation_nonce": 0,
      "status": "active",
      "buyer_id": "uuid",
      "ticket_type": "GA",
      "cached_at": 1705356000
    }
  ],
  "synced_at": 1705356000,
  "expires_at": 1705377600
}
```

**Usage:**
```dart
final response = await http.get(
  Uri.parse('$apiBaseUrl/functions/v1/download-event-tickets?event_id=$eventId'),
  headers: {
    'Authorization': 'Bearer $authToken',
  },
);

final cacheData = jsonDecode(response.body);
await cacheService.cacheEventTickets(
  cacheData['event_id'],
  cacheData['tickets'].map((t) => CachedTicket.fromJson(t)).toList(),
  cacheData['event_title'],
  cacheData['start_at'],
  cacheData['end_at'],
);
```

### 2. Check-In Ticket

**Endpoint:** `POST /functions/v1/check-in-ticket`

**Headers:**
```
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

**Body:**
```json
{
  "token": "base64url-encoded-qr-token",
  "event_id": "uuid",
  "device_id": "device-identifier",
  "location": {
    "lat": 49.2827,
    "lng": -123.1207
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "ticket_id": "uuid",
  "checked_in_at": "2024-01-15T20:30:15Z",
  "mode": "A"
}
```

**Error Responses:**

**400 - Invalid Token:**
```json
{
  "success": false,
  "error": "Invalid token format",
  "details": "..."
}
```

**409 - Already Checked In:**
```json
{
  "success": false,
  "error": "Ticket already checked in",
  "ticket_id": "uuid"
}
```

**Usage:**
```dart
final response = await http.post(
  Uri.parse('$apiBaseUrl/functions/v1/check-in-ticket'),
  headers: {
    'Authorization': 'Bearer $authToken',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({
    'token': tokenString,
    'event_id': eventId,
    'device_id': deviceId,
    if (location != null) 'location': {
      'lat': location.lat,
      'lng': location.lng,
    },
  }),
);

final result = jsonDecode(response.body);
if (result['success'] == true) {
  // Success
} else {
  // Handle error
  if (response.statusCode == 409) {
    // Conflict - already checked in
  }
}
```

## Data Flow

### Pre-Event Setup

1. **Organizer opens scanner app**
2. **Selects event** from list
3. **Downloads tickets** via API
4. **Tickets cached locally** (SharedPreferences)
5. **Ready to scan offline**

### During Event (Offline)

1. **Staff scans QR code**
2. **App parses token** (base64url decode)
3. **Validates against cache**:
   - Check ticket exists
   - Verify signature
   - Check status (active/used)
   - Validate time window (Mode B)
4. **If valid**:
   - Mark as used locally
   - Add to sync queue
   - Show success
5. **If invalid**:
   - Show error
   - Do not queue

### Post-Event Sync

1. **App detects network** (connectivity_plus)
2. **Processes sync queue**:
   - Batch upload scans (10 at a time)
   - Handle conflicts
   - Update local cache
3. **Resolves conflicts**:
   - Show conflict UI
   - User accepts/rejects
   - Update cache accordingly

## Conflict Resolution

### Scenario: Two Devices Scan Same Ticket

1. **Device A** scans → Validates offline → Queues
2. **Device B** scans → Validates offline → Queues
3. **Device A** syncs → Server confirms → Success
4. **Device B** syncs → Server returns 409 → Conflict
5. **Device B** shows conflict UI:
   ```
   ⚠ Conflict Detected
   
   Ticket was checked in by:
   Device: scanner-456
   Time: 2024-01-15 20:29:42
   
   [Accept] [Reject]
   ```
6. **User accepts** → Cache updated → Queue cleared

## Security Considerations

### Authentication

- Scanner app requires JWT token
- Token must belong to staff/organizer
- Edge Functions verify permissions

### Data Protection

- QR secrets stored securely (encrypted at rest)
- Cache expires after event ends
- Sync queue encrypted (SQLite encryption)

### Fraud Prevention

- Device ID tracking
- Location logging (optional)
- Conflict detection
- Audit trail (check_in_logs)

## Performance Targets

- **Download**: < 2 seconds for 1000 tickets
- **Scan Response**: < 200ms
- **Cache Lookup**: < 10ms
- **Sync Batch**: 100 scans per request
- **Offline Storage**: SQLite for queue

## Testing Checklist

- [ ] Download tickets for event
- [ ] Cache persists after app restart
- [ ] Scan valid ticket offline
- [ ] Scan invalid ticket offline
- [ ] Scan already-used ticket
- [ ] Sync queue when online
- [ ] Conflict detection works
- [ ] Conflict resolution UI
- [ ] Retry failed syncs
- [ ] Cache expiration works
- [ ] Multiple devices, same ticket

## Next Steps

1. **Implement SQLite queue persistence**
2. **Add event selection UI**
3. **Implement cache download**
4. **Add conflict resolution UI**
5. **Add analytics/reporting**
6. **Add sound/haptic feedback**
7. **Add batch sync indicator**
8. **Add offline/online status indicator**
