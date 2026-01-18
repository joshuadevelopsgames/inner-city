// Sync Service
// Handles syncing queued scans to server

import 'dart:async';
import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:http/http.dart' as http;
import '../models/sync_queue.dart';
import '../models/scan_result.dart';

class SyncService {
  final String apiBaseUrl;
  final String authToken;
  final String deviceId;
  final String scannerUserId;

  SyncService({
    required this.apiBaseUrl,
    required this.authToken,
    required this.deviceId,
    required this.scannerUserId,
  });

  /// Check if device is online
  Future<bool> isOnline() async {
    final connectivity = Connectivity();
    final result = await connectivity.checkConnectivity();
    return result != ConnectivityResult.none;
  }

  /// Sync single scan
  Future<SyncResult> syncScan(QueuedScan scan) async {
    try {
      // Call check-in endpoint
      final response = await _makeRequest(
        '/functions/v1/check-in-ticket',
        {
          'token': scan.token,
          'event_id': scan.eventId,
          'device_id': scan.scannerDeviceId,
          if (scan.locationLat != null && scan.locationLng != null)
            'location': {
              'lat': scan.locationLat,
              'lng': scan.locationLng,
            },
        },
      );

      if (response['success'] == true) {
        return SyncResult.success(scan.copyWith(
          status: SyncStatus.synced,
          syncedAt: DateTime.now(),
        ));
      } else {
        // Check if conflict (already checked in)
        if (response['error']?.toString().contains('already') == true) {
          return SyncResult.conflict(
            scan.copyWith(
              status: SyncStatus.conflict,
              errorMessage: response['error'],
            ),
            'Ticket was checked in by another device',
          );
        }

        return SyncResult.failure(
          scan.copyWith(
            status: SyncStatus.failed,
            errorMessage: response['error']?.toString(),
            retryCount: scan.retryCount + 1,
          ),
          response['error']?.toString() ?? 'Unknown error',
        );
      }
    } catch (e) {
      return SyncResult.failure(
        scan.copyWith(
          status: SyncStatus.failed,
          errorMessage: e.toString(),
          retryCount: scan.retryCount + 1,
        ),
        e.toString(),
      );
    }
  }

  /// Sync batch of scans
  Future<List<SyncResult>> syncBatch(List<QueuedScan> scans) async {
    final results = <SyncResult>[];

    // Process in batches of 10 to avoid overwhelming server
    for (var i = 0; i < scans.length; i += 10) {
      final batch = scans.sublist(
        i,
        i + 10 > scans.length ? scans.length : i + 10,
      );

      final batchResults = await Future.wait(
        batch.map((scan) => syncScan(scan)),
      );

      results.addAll(batchResults);

      // Small delay between batches
      if (i + 10 < scans.length) {
        await Future.delayed(const Duration(milliseconds: 100));
      }
    }

    return results;
  }

  /// Make HTTP request
  Future<Map<String, dynamic>> _makeRequest(
    String endpoint,
    Map<String, dynamic> body,
  ) async {
    final url = Uri.parse('$apiBaseUrl$endpoint');
    final response = await http.post(
      url,
      headers: {
        'Authorization': 'Bearer $authToken',
        'Content-Type': 'application/json',
      },
      body: jsonEncode(body),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
    } else {
      throw Exception('HTTP ${response.statusCode}: ${response.body}');
    }
  }
}

class SyncResult {
  final QueuedScan scan;
  final SyncStatus status;
  final String? errorMessage;
  final String? conflictMessage;

  SyncResult.success(this.scan)
      : status = SyncStatus.synced,
        errorMessage = null,
        conflictMessage = null;

  SyncResult.failure(this.scan, this.errorMessage)
      : status = SyncStatus.failed,
        conflictMessage = null;

  SyncResult.conflict(this.scan, this.conflictMessage)
      : status = SyncStatus.conflict,
        errorMessage = conflictMessage;
}

// Note: Add http import: import 'package:http/http.dart' as http;
// Note: Add json import: import 'dart:convert';
