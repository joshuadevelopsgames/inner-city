# QR Token Specification for Ticket Validation

## Overview

Two modes of QR token validation for Inner City tickets:

- **Mode A (MVP)**: Static signed tokens with HMAC verification
- **Mode B (Upgrade)**: Rotating tokens refreshed every 30-60 seconds

## Mode A: Signed HMAC Token (MVP)

### Token Structure

```
{
  "t": "ticket_id",
  "i": "issued_at_timestamp",
  "n": "nonce",
  "s": "hmac_signature"
}
```

### Fields

- `t` (ticket_id): UUID of the ticket
- `i` (issued_at): Unix timestamp (seconds) when token was issued
- `n` (nonce): Random 32-byte hex string (prevents token reuse)
- `s` (signature): HMAC-SHA256 signature of `t|i|n` using ticket's `qr_secret`

### Encoding

**Format:** Base64URL-encoded JSON

**Example:**
```
eyJ0IjoiMTIzZTQ1Ni03ODktYWJjZC1lZmdoLWlqa2xtbm9wIiwiaSI6MTcwNTI4MDAwMCwibiI6ImFiYzEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3ODkwYWJjZGVmMTIzNDU2Nzg5MCIsInMiOiJzaWduYXR1cmVoZXJlIn0
```

**Decoded:**
```json
{
  "t": "123e4567-7890-abcd-efgh-ijklmnop",
  "i": 1705280000,
  "n": "abc1234567890abcdef1234567890abcdef1234567890",
  "s": "signaturehere"
}
```

### Signature Generation

```typescript
const payload = `${ticket_id}|${issued_at}|${nonce}`;
const signature = HMAC_SHA256(payload, qr_secret);
const token = {
  t: ticket_id,
  i: issued_at,
  n: nonce,
  s: signature
};
const encodedToken = base64url(JSON.stringify(token));
```

### Validation Rules

1. **Signature Verification**: `HMAC_SHA256(t|i|n, qr_secret) === s`
2. **Ticket Status**: Ticket must be `active` (not `used`, `refunded`, `revoked`)
3. **Expiration**: Token valid for 24 hours from `issued_at`
4. **Nonce Check**: Nonce must not be in `used_nonces` table (prevents replay)

### Security Properties

- ✅ **Tamper-proof**: Signature prevents modification
- ✅ **Replay prevention**: Nonce tracking prevents reuse
- ✅ **Time-bound**: Expires after 24 hours
- ✅ **Ticket-bound**: Tied to specific ticket

### Limitations

- ❌ **Screenshot vulnerability**: Token can be screenshot and reused until nonce is consumed
- ❌ **No rotation**: Same token works until expiration or use

---

## Mode B: Rotating QR Codes (Upgrade)

### Token Structure

```
{
  "t": "ticket_id",
  "w": "time_window",
  "r": "rotation_nonce",
  "s": "hmac_signature"
}
```

### Fields

- `t` (ticket_id): UUID of the ticket
- `w` (time_window): Unix timestamp rounded down to rotation interval (e.g., 30s or 60s)
- `r` (rotation_nonce): Incremented nonce from `tickets.qr_rotation_nonce`
- `s` (signature): HMAC-SHA256 signature of `t|w|r` using ticket's `qr_secret`

### Time Window Calculation

```typescript
const ROTATION_INTERVAL = 60; // seconds
const timeWindow = Math.floor(Date.now() / 1000 / ROTATION_INTERVAL) * ROTATION_INTERVAL;
```

**Example:**
- Current time: `1705280045` (2024-01-15 20:00:45)
- Time window: `1705280040` (2024-01-15 20:00:00, rounded to 60s)

### Token Refresh Flow

1. Client requests fresh token every 30-45 seconds (before rotation)
2. Backend generates token with current time window
3. Client displays QR code
4. Token expires when time window changes
5. Client automatically requests new token

### Validation Rules

1. **Signature Verification**: `HMAC_SHA256(t|w|r, qr_secret) === s`
2. **Time Window Freshness**: `current_time_window - w <= 1` (allow 1 window tolerance)
3. **Rotation Nonce Match**: `r === tickets.qr_rotation_nonce` (within tolerance)
4. **Ticket Status**: Ticket must be `active`
5. **Clock Skew Tolerance**: ±5 seconds allowed

### Security Properties

- ✅ **Screenshot resistant**: Token expires every 30-60 seconds
- ✅ **Replay prevention**: Time window + rotation nonce prevents reuse
- ✅ **Tamper-proof**: Signature prevents modification
- ✅ **Freshness**: Must be recent (within 1-2 rotation windows)

### Limitations

- ❌ **Requires network**: Client must request fresh tokens
- ❌ **Clock sync**: Requires accurate time (NTP recommended)

---

## Token Format Comparison

| Feature | Mode A (MVP) | Mode B (Rotating) |
|---------|--------------|-------------------|
| Token Lifetime | 24 hours | 30-60 seconds |
| Screenshot Risk | High | Low |
| Network Required | No (for generation) | Yes (for refresh) |
| Replay Prevention | Nonce tracking | Time window + nonce |
| Complexity | Low | Medium |
| Offline Support | Yes | Limited |

---

## Encoding Details

### Base64URL Encoding

Uses URL-safe base64 encoding (no padding, `-` and `_` instead of `+` and `/`):

```typescript
function base64urlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64urlDecode(str: string): string {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}
```

### QR Code Format

**QR Code Content:** Direct token string (no URL wrapper)

```
eyJ0IjoiMTIzZTQ1Ni03ODktYWJjZC1lZmdoLWlqa2xtbm9wIiwiaSI6MTcwNTI4MDAwMCwibiI6ImFiYzEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3ODkwYWJjZGVmMTIzNDU2Nzg5MCIsInMiOiJzaWduYXR1cmVoZXJlIn0
```

**QR Code Settings:**
- Error Correction: Medium (M) or High (H)
- Size: Minimum 256x256 pixels for reliable scanning
- Format: Standard QR Code (not Data Matrix)

---

## Replay Attack Prevention

### Mode A: Nonce Tracking

```sql
CREATE TABLE used_nonces (
  ticket_id UUID NOT NULL REFERENCES tickets(id),
  nonce TEXT NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticket_id, nonce)
);

CREATE INDEX idx_used_nonces_ticket ON used_nonces(ticket_id);
CREATE INDEX idx_used_nonces_used_at ON used_nonces(used_at);
```

**Cleanup:** Remove nonces older than 24 hours (tokens expire anyway)

### Mode B: Time Window + Rotation Nonce

- Time window changes every 30-60 seconds
- Rotation nonce increments on each check-in attempt
- Old time windows are invalid
- Clock skew tolerance: ±5 seconds

**No database table needed** - validation is stateless (time-based)

---

## Offline Scanning Capabilities

### What CAN Be Validated Offline

**Mode A:**
- ✅ Signature verification (if `qr_secret` cached)
- ✅ Token expiration check (if device clock accurate)
- ❌ Nonce reuse check (requires database)
- ❌ Ticket status check (requires database)

**Mode B:**
- ✅ Signature verification (if `qr_secret` cached)
- ✅ Time window freshness (if device clock accurate)
- ✅ Rotation nonce check (if cached)
- ❌ Ticket status check (requires database)

### Offline Validation Strategy

1. **Pre-event Sync:**
   - Download all active tickets for event
   - Cache `qr_secret`, `qr_rotation_nonce`, `status` for each ticket
   - Cache expires after event ends

2. **Offline Validation:**
   - Verify signature
   - Check token freshness
   - Check nonce (Mode A) or rotation nonce (Mode B)
   - Mark as "pending verification" if ticket status unknown

3. **Online Sync:**
   - Upload pending verifications
   - Server validates against database
   - Resolves conflicts (e.g., ticket checked in elsewhere)

### Offline Limitations

- **Cannot prevent double-check-in** if same ticket scanned on multiple offline devices
- **Cannot verify ticket status changes** (refunded, revoked) until sync
- **Requires accurate device clock** for time-based validation

### Recommended Approach

**Hybrid Mode:**
1. Validate signature + freshness offline
2. Queue check-in for online verification
3. Show "pending" status to scanner
4. Sync when network available
5. Resolve conflicts server-side

---

## Migration Path

### Phase 1: Mode A (MVP)
- Implement signed tokens
- Deploy nonce tracking
- Test with real events

### Phase 2: Mode B (Upgrade)
- Add rotation support
- Update client to refresh tokens
- Migrate existing tickets gradually
- Keep Mode A as fallback

### Phase 3: Hybrid
- Support both modes
- Let organizers choose
- Default to Mode B for new events

---

## Security Considerations

### Key Management

- `qr_secret` stored in database (encrypted at rest)
- Never exposed to client
- Rotated if compromised
- Unique per ticket

### Token Exposure

- Tokens visible in QR codes (by design)
- Signature prevents tampering
- Short lifetime (Mode B) limits exposure window

### Clock Attacks

- Require NTP sync for scanners
- Reject tokens with clock skew > 5 seconds
- Log suspicious time discrepancies

### Brute Force

- Nonce is 32 bytes (256 bits) - infeasible to guess
- Signature prevents token generation without `qr_secret`
- Rate limiting on validation endpoint

---

## Performance Considerations

### Mode A

- **Token Generation**: O(1) - Single HMAC operation
- **Validation**: O(1) - Database lookup + HMAC verification
- **Nonce Check**: O(1) - Indexed lookup

### Mode B

- **Token Generation**: O(1) - Single HMAC operation
- **Validation**: O(1) - Database lookup + HMAC verification
- **No nonce table**: Stateless validation (faster)

### Database Impact

- **Mode A**: Requires `used_nonces` table (grows over time)
- **Mode B**: No additional tables (uses existing `qr_rotation_nonce`)

---

## Implementation Checklist

### Backend

- [ ] Token generation function (both modes)
- [ ] Token validation Edge Function
- [ ] Nonce tracking table (Mode A)
- [ ] Rotation nonce increment logic (Mode B)
- [ ] Offline sync endpoint
- [ ] Cleanup jobs (expired nonces, old tokens)

### Frontend

- [ ] QR code generation library
- [ ] Token refresh logic (Mode B)
- [ ] Token caching
- [ ] Error handling (expired tokens, network errors)

### Scanner App

- [ ] QR code scanning
- [ ] Token parsing and validation
- [ ] Offline mode support
- [ ] Conflict resolution UI
- [ ] Sync queue management
