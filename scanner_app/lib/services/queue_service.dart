// Queue Service
// Manages sync queue persistence

import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/sync_queue.dart';

class QueueService {
  static const String _queueKey = 'sync_queue';

  /// Add scan to queue
  Future<void> add(QueuedScan scan) async {
    final prefs = await SharedPreferences.getInstance();
    final queue = await getAll();
    queue.add(scan);
    await _saveQueue(queue, prefs);
  }

  /// Get all scans
  Future<List<QueuedScan>> getAll() async {
    final prefs = await SharedPreferences.getInstance();
    final queueJson = prefs.getString(_queueKey);
    
    if (queueJson == null) return [];

    try {
      final List<dynamic> decoded = jsonDecode(queueJson);
      return decoded.map((json) => QueuedScan.fromJson(json as Map<String, dynamic>)).toList();
    } catch (e) {
      print('Error parsing queue: $e');
      return [];
    }
  }

  /// Get pending scans
  Future<List<QueuedScan>> getPending() async {
    final all = await getAll();
    return all.where((scan) => scan.status == SyncStatus.pending).toList();
  }

  /// Update scan in queue
  Future<void> update(QueuedScan updatedScan) async {
    final prefs = await SharedPreferences.getInstance();
    final queue = await getAll();
    
    final index = queue.indexWhere((s) => s.id == updatedScan.id);
    if (index != -1) {
      queue[index] = updatedScan;
      await _saveQueue(queue, prefs);
    }
  }

  /// Remove scan from queue
  Future<void> remove(String scanId) async {
    final prefs = await SharedPreferences.getInstance();
    final queue = await getAll();
    queue.removeWhere((s) => s.id == scanId);
    await _saveQueue(queue, prefs);
  }

  /// Clear synced scans (older than 24 hours)
  Future<void> clearOldSynced() async {
    final prefs = await SharedPreferences.getInstance();
    final queue = await getAll();
    final now = DateTime.now();
    
    final filtered = queue.where((scan) {
      if (scan.status != SyncStatus.synced) return true;
      if (scan.syncedAt == null) return true;
      final age = now.difference(scan.syncedAt!);
      return age.inHours < 24;
    }).toList();
    
    await _saveQueue(filtered, prefs);
  }

  /// Save queue to storage
  Future<void> _saveQueue(List<QueuedScan> queue, SharedPreferences prefs) async {
    final queueJson = jsonEncode(queue.map((s) => s.toJson()).toList());
    await prefs.setString(_queueKey, queueJson);
  }

  /// Get queue stats
  Future<QueueStats> getStats() async {
    final queue = await getAll();
    return QueueStats(
      total: queue.length,
      pending: queue.where((s) => s.status == SyncStatus.pending).length,
      synced: queue.where((s) => s.status == SyncStatus.synced).length,
      conflicts: queue.where((s) => s.status == SyncStatus.conflict).length,
      failed: queue.where((s) => s.status == SyncStatus.failed).length,
    );
  }
}

class QueueStats {
  final int total;
  final int pending;
  final int synced;
  final int conflicts;
  final int failed;

  QueueStats({
    required this.total,
    required this.pending,
    required this.synced,
    required this.conflicts,
    required this.failed,
  });
}
