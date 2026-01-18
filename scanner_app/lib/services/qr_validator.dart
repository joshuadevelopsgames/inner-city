// QR Token Validator
// Validates QR tokens offline using cached data

import 'dart:convert';
import 'package:crypto/crypto.dart';
import '../models/ticket_cache.dart';
import '../models/scan_result.dart';

class QRValidator {
  /// Parse base64url-encoded token
  static Map<String, dynamic> parseToken(String tokenString) {
    try {
      // Decode base64url
      String base64 = tokenString
          .replaceAll('-', '+')
          .replaceAll('_', '/');
      
      // Add padding
      while (base64.length % 4 != 0) {
        base64 += '=';
      }

      final decoded = utf8.decode(base64Decode(base64));
      return jsonDecode(decoded) as Map<String, dynamic>;
    } catch (e) {
      throw Exception('Invalid token format: $e');
    }
  }

  /// Detect token mode
  static String detectMode(Map<String, dynamic> token) {
    if (token.containsKey('w')) {
      return 'B'; // Rotating mode
    } else if (token.containsKey('i')) {
      return 'A'; // Signed mode
    }
    throw Exception('Unknown token mode');
  }

  /// Verify HMAC signature
  static bool verifySignature(
    String payload,
    String secret,
    String signature,
  ) {
    final key = utf8.encode(secret);
    final data = utf8.encode(payload);
    final hmac = Hmac(sha256, key);
    final digest = hmac.convert(data);
    final expectedSignature = digest.toString();
    return expectedSignature == signature.toLowerCase();
  }

  /// Validate token offline (Mode A)
  static ScanResultData validateModeA(
    Map<String, dynamic> token,
    CachedTicket? cachedTicket,
    bool isOnline,
  ) {
    final ticketId = token['t'] as String?;
    final issuedAt = token['i'] as int?;
    final nonce = token['n'] as String?;
    final signature = token['s'] as String?;

    if (ticketId == null || issuedAt == null || nonce == null || signature == null) {
      return ScanResultData(
        result: ScanResult.invalid,
        ticketId: ticketId ?? 'unknown',
        reason: 'Invalid token format',
        token: jsonEncode(token),
        scannedAt: DateTime.now(),
      );
    }

    // Check if ticket in cache
    if (cachedTicket == null) {
      return ScanResultData(
        result: ScanResult.invalid,
        ticketId: ticketId,
        reason: 'Ticket not found in cache',
        token: jsonEncode(token),
        scannedAt: DateTime.now(),
        requiresOnlineCheck: true,
      );
    }

    // Check ticket status
    if (!cachedTicket.isActive) {
      return ScanResultData(
        result: ScanResult.invalid,
        ticketId: ticketId,
        reason: 'Ticket status is ${cachedTicket.status}',
        token: jsonEncode(token),
        scannedAt: DateTime.now(),
      );
    }

    // Check if already used locally
    if (cachedTicket.isUsed) {
      return ScanResultData(
        result: ScanResult.alreadyUsed,
        ticketId: ticketId,
        eventId: cachedTicket.eventId,
        reason: 'Ticket already checked in (local cache)',
        token: jsonEncode(token),
        scannedAt: DateTime.now(),
      );
    }

    // Verify signature
    final payload = '$ticketId|$issuedAt|$nonce';
    final isValidSignature = verifySignature(
      payload,
      cachedTicket.qrSecret,
      signature,
    );

    if (!isValidSignature) {
      return ScanResultData(
        result: ScanResult.invalid,
        ticketId: ticketId,
        reason: 'Invalid signature',
        token: jsonEncode(token),
        scannedAt: DateTime.now(),
      );
    }

    // Check expiration (24 hours)
    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    final expiresAt = issuedAt + (24 * 60 * 60);
    if (now >= expiresAt) {
      return ScanResultData(
        result: ScanResult.invalid,
        ticketId: ticketId,
        reason: 'Token expired',
        token: jsonEncode(token),
        scannedAt: DateTime.now(),
      );
    }

    // Mode A: Cannot check nonce reuse offline
    if (!isOnline) {
      return ScanResultData(
        result: ScanResult.needsOnlineValidation,
        ticketId: ticketId,
        eventId: cachedTicket.eventId,
        reason: 'Nonce reuse check requires online validation',
        token: jsonEncode(token),
        scannedAt: DateTime.now(),
        requiresOnlineCheck: true,
      );
    }

    // Online: All checks passed
    return ScanResultData(
      result: ScanResult.valid,
      ticketId: ticketId,
      eventId: cachedTicket.eventId,
      reason: 'Valid token',
      token: jsonEncode(token),
      scannedAt: DateTime.now(),
    );
  }

  /// Validate token offline (Mode B)
  static ScanResultData validateModeB(
    Map<String, dynamic> token,
    CachedTicket? cachedTicket,
    int rotationInterval,
  ) {
    final ticketId = token['t'] as String?;
    final timeWindow = token['w'] as int?;
    final rotationNonce = token['r'] as int?;
    final signature = token['s'] as String?;

    if (ticketId == null || timeWindow == null || rotationNonce == null || signature == null) {
      return ScanResultData(
        result: ScanResult.invalid,
        ticketId: ticketId ?? 'unknown',
        reason: 'Invalid token format',
        token: jsonEncode(token),
        scannedAt: DateTime.now(),
      );
    }

    // Check if ticket in cache
    if (cachedTicket == null) {
      return ScanResultData(
        result: ScanResult.invalid,
        ticketId: ticketId,
        reason: 'Ticket not found in cache',
        token: jsonEncode(token),
        scannedAt: DateTime.now(),
        requiresOnlineCheck: true,
      );
    }

    // Check ticket status
    if (!cachedTicket.isActive) {
      return ScanResultData(
        result: ScanResult.invalid,
        ticketId: ticketId,
        reason: 'Ticket status is ${cachedTicket.status}',
        token: jsonEncode(token),
        scannedAt: DateTime.now(),
      );
    }

    // Check if already used locally
    if (cachedTicket.isUsed) {
      return ScanResultData(
        result: ScanResult.alreadyUsed,
        ticketId: ticketId,
        eventId: cachedTicket.eventId,
        reason: 'Ticket already checked in (local cache)',
        token: jsonEncode(token),
        scannedAt: DateTime.now(),
      );
    }

    // Verify signature
    final payload = '$ticketId|$timeWindow|$rotationNonce';
    final isValidSignature = verifySignature(
      payload,
      cachedTicket.qrSecret,
      signature,
    );

    if (!isValidSignature) {
      return ScanResultData(
        result: ScanResult.invalid,
        ticketId: ticketId,
        reason: 'Invalid signature',
        token: jsonEncode(token),
        scannedAt: DateTime.now(),
      );
    }

    // Check time window freshness
    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    final currentWindow = (now ~/ rotationInterval) * rotationInterval;
    final windowDiff = (currentWindow - timeWindow).abs();

    // Allow 1 window tolerance + 5 seconds clock skew
    if (windowDiff > (rotationInterval + 5)) {
      return ScanResultData(
        result: ScanResult.invalid,
        ticketId: ticketId,
        reason: 'Token time window expired (diff: ${windowDiff}s)',
        token: jsonEncode(token),
        scannedAt: DateTime.now(),
      );
    }

    // Check rotation nonce (allow ±1 tolerance for concurrent scans)
    final nonceDiff = (cachedTicket.qrRotationNonce - rotationNonce).abs();
    if (nonceDiff > 1) {
      return ScanResultData(
        result: ScanResult.needsOnlineValidation,
        ticketId: ticketId,
        eventId: cachedTicket.eventId,
        reason: 'Rotation nonce mismatch (cache may be stale)',
        token: jsonEncode(token),
        scannedAt: DateTime.now(),
        requiresOnlineCheck: true,
      );
    }

    // All checks passed
    return ScanResultData(
      result: ScanResult.valid,
      ticketId: ticketId,
      eventId: cachedTicket.eventId,
      reason: 'Valid token',
      token: jsonEncode(token),
      scannedAt: DateTime.now(),
    );
  }

  /// Main validation function
  static ScanResultData validate(
    String tokenString,
    CachedTicket? cachedTicket,
    bool isOnline, {
    int rotationInterval = 60,
  }) {
    try {
      final token = parseToken(tokenString);
      final mode = detectMode(token);

      if (mode == 'A') {
        return validateModeA(token, cachedTicket, isOnline);
      } else {
        return validateModeB(token, cachedTicket, rotationInterval);
      }
    } catch (e) {
      return ScanResultData(
        result: ScanResult.invalid,
        ticketId: 'unknown',
        reason: 'Validation error: $e',
        token: tokenString,
        scannedAt: DateTime.now(),
      );
    }
  }
}
