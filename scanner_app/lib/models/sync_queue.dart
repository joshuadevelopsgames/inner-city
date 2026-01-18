// Sync Queue Models

enum SyncStatus {
  pending,
  syncing,
  synced,
  conflict,
  failed,
}

/// Queued scan waiting for sync
class QueuedScan {
  final String id; // Local UUID
  final String ticketId;
  final String eventId;
  final String token; // Original token string
  final DateTime scannedAt;
  final String scannerUserId;
  final String scannerDeviceId;
  final ScanResult result;
  final SyncStatus status;
  final String? conflictResolution; // 'accepted' | 'rejected'
  final double? locationLat;
  final double? locationLng;
  final String? errorMessage;
  final int retryCount;
  final DateTime createdAt;
  final DateTime? syncedAt;

  QueuedScan({
    required this.id,
    required this.ticketId,
    required this.eventId,
    required this.token,
    required this.scannedAt,
    required this.scannerUserId,
    required this.scannerDeviceId,
    required this.result,
    this.status = SyncStatus.pending,
    this.conflictResolution,
    this.locationLat,
    this.locationLng,
    this.errorMessage,
    this.retryCount = 0,
    required this.createdAt,
    this.syncedAt,
  });

  QueuedScan copyWith({
    String? id,
    String? ticketId,
    String? eventId,
    String? token,
    DateTime? scannedAt,
    String? scannerUserId,
    String? scannerDeviceId,
    ScanResult? result,
    SyncStatus? status,
    String? conflictResolution,
    double? locationLat,
    double? locationLng,
    String? errorMessage,
    int? retryCount,
    DateTime? createdAt,
    DateTime? syncedAt,
  }) {
    return QueuedScan(
      id: id ?? this.id,
      ticketId: ticketId ?? this.ticketId,
      eventId: eventId ?? this.eventId,
      token: token ?? this.token,
      scannedAt: scannedAt ?? this.scannedAt,
      scannerUserId: scannerUserId ?? this.scannerUserId,
      scannerDeviceId: scannerDeviceId ?? this.scannerDeviceId,
      result: result ?? this.result,
      status: status ?? this.status,
      conflictResolution: conflictResolution ?? this.conflictResolution,
      locationLat: locationLat ?? this.locationLat,
      locationLng: locationLng ?? this.locationLng,
      errorMessage: errorMessage ?? this.errorMessage,
      retryCount: retryCount ?? this.retryCount,
      createdAt: createdAt ?? this.createdAt,
      syncedAt: syncedAt ?? this.syncedAt,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'ticket_id': ticketId,
        'event_id': eventId,
        'token': token,
        'scanned_at': scannedAt.toIso8601String(),
        'scanner_user_id': scannerUserId,
        'scanner_device_id': scannerDeviceId,
        'result': result.name,
        'status': status.name,
        'conflict_resolution': conflictResolution,
        'location_lat': locationLat,
        'location_lng': locationLng,
        'error_message': errorMessage,
        'retry_count': retryCount,
        'created_at': createdAt.toIso8601String(),
        'synced_at': syncedAt?.toIso8601String(),
      };

  factory QueuedScan.fromJson(Map<String, dynamic> json) => QueuedScan(
        id: json['id'] as String,
        ticketId: json['ticket_id'] as String,
        eventId: json['event_id'] as String,
        token: json['token'] as String,
        scannedAt: DateTime.parse(json['scanned_at'] as String),
        scannerUserId: json['scanner_user_id'] as String,
        scannerDeviceId: json['scanner_device_id'] as String,
        result: ScanResult.values.firstWhere(
          (e) => e.name == json['result'],
          orElse: () => ScanResult.invalid,
        ),
        status: SyncStatus.values.firstWhere(
          (e) => e.name == json['status'],
          orElse: () => SyncStatus.pending,
        ),
        conflictResolution: json['conflict_resolution'] as String?,
        locationLat: json['location_lat'] as double?,
        locationLng: json['location_lng'] as double?,
        errorMessage: json['error_message'] as String?,
        retryCount: json['retry_count'] as int,
        createdAt: DateTime.parse(json['created_at'] as String),
        syncedAt: json['synced_at'] != null
            ? DateTime.parse(json['synced_at'] as String)
            : null,
      );
}
