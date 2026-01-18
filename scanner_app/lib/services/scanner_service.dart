// Scanner Service
// Main service coordinating scanning, validation, and sync

import '../models/scan_result.dart';
import '../models/sync_queue.dart';
import '../models/ticket_cache.dart';
import 'ticket_cache_service.dart';
import 'qr_validator.dart';
import 'sync_service.dart';
import 'queue_service.dart';

class ScannerService {
  final TicketCacheService cacheService;
  final SyncService syncService;
  final QueueService queueService;
  final String currentEventId;

  ScannerService({
    required this.cacheService,
    required this.syncService,
    required this.queueService,
    required this.currentEventId,
  });

  /// Scan QR token and validate
  Future<ScanResultData> scanToken(
    String tokenString,
    String scannerUserId,
    String deviceId, {
    double? lat,
    double? lng,
  }) async {
    // Get event cache
    final cache = await cacheService.getEventCache(currentEventId);
    if (cache == null) {
      return ScanResultData(
        result: ScanResult.invalid,
        ticketId: 'unknown',
        reason: 'Event cache not found. Please sync tickets first.',
        token: tokenString,
        scannedAt: DateTime.now(),
        requiresOnlineCheck: true,
      );
    }

    // Check if cache is stale
    final isStale = cacheService.isCacheStale(cache);
    final isOnline = await syncService.isOnline();

    // Parse token to get ticket ID
    Map<String, dynamic> token;
    try {
      token = QRValidator.parseToken(tokenString);
    } catch (e) {
      return ScanResultData(
        result: ScanResult.invalid,
        ticketId: 'unknown',
        reason: 'Invalid token format: $e',
        token: tokenString,
        scannedAt: DateTime.now(),
      );
    }

    final ticketId = token['t'] as String? ?? 'unknown';
    final cachedTicket = cache.getTicket(ticketId);

    // Validate token
    final validation = QRValidator.validate(
      tokenString,
      cachedTicket,
      isOnline && !isStale,
    );

    // Handle valid scans
    if (validation.result == ScanResult.valid) {
      // Update local cache immediately
      await cacheService.updateTicketStatus(
        currentEventId,
        ticketId,
        'used',
      );

      // Queue for sync
      final queuedScan = QueuedScan(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        ticketId: ticketId,
        eventId: currentEventId,
        token: tokenString,
        scannedAt: validation.scannedAt,
        scannerUserId: scannerUserId,
        scannerDeviceId: deviceId,
        result: ScanResult.valid,
        locationLat: lat,
        locationLng: lng,
        createdAt: DateTime.now(),
      );

      // Try to sync immediately if online
      if (isOnline) {
        final syncResult = await syncService.syncScan(queuedScan);
        await queueService.update(syncResult.scan);
      } else {
        // Add to queue for later sync
        await queueService.add(queuedScan);
      }
    }

    // Handle needs online validation
    if (validation.result == ScanResult.needsOnlineValidation) {
      // Queue for online validation
      final queuedScan = QueuedScan(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        ticketId: ticketId,
        eventId: currentEventId,
        token: tokenString,
        scannedAt: validation.scannedAt,
        scannerUserId: scannerUserId,
        scannerDeviceId: deviceId,
        result: ScanResult.needsOnlineValidation,
        locationLat: lat,
        locationLng: lng,
        createdAt: DateTime.now(),
      );

      // Try to validate online if available
      if (isOnline) {
        // Call online validation endpoint
        // If valid, proceed with check-in
        // If invalid, update result
        await queueService.add(queuedScan);
      } else {
        // Queue for later
        await queueService.add(queuedScan);
      }
    }

    return validation;
  }

  /// Process sync queue
  Future<void> processSyncQueue() async {
    final isOnline = await syncService.isOnline();
    if (!isOnline) return;

    // Get pending scans
    final pendingScans = await queueService.getPending();
    if (pendingScans.isEmpty) return;

    // Sync batch
    final results = await syncService.syncBatch(pendingScans);

    // Update queue with results
    for (final result in results) {
      await queueService.update(result.scan);
    }

    // Clean up old synced scans
    await queueService.clearOldSynced();
  }
}
