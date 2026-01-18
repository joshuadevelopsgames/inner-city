// Scan Result Models

enum ScanResult {
  valid,
  alreadyUsed,
  invalid,
  needsOnlineValidation,
}

extension ScanResultExtension on ScanResult {
  String get displayName {
    switch (this) {
      case ScanResult.valid:
        return 'Valid';
      case ScanResult.alreadyUsed:
        return 'Already Used';
      case ScanResult.invalid:
        return 'Invalid';
      case ScanResult.needsOnlineValidation:
        return 'Needs Online Validation';
    }
  }

  String get icon {
    switch (this) {
      case ScanResult.valid:
        return '✓';
      case ScanResult.alreadyUsed:
        return '⚠';
      case ScanResult.invalid:
        return '✗';
      case ScanResult.needsOnlineValidation:
        return '⏳';
    }
  }
}

/// Result of scanning a QR token
class ScanResultData {
  final ScanResult result;
  final String ticketId;
  final String? eventId;
  final String reason;
  final String token; // Original token string
  final DateTime scannedAt;
  final bool requiresOnlineCheck;

  ScanResultData({
    required this.result,
    required this.ticketId,
    this.eventId,
    required this.reason,
    required this.token,
    required this.scannedAt,
    this.requiresOnlineCheck = false,
  });
}
