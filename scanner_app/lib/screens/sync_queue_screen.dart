// Sync Queue Screen
// Shows pending scans and sync status

import 'package:flutter/material.dart';
import '../models/sync_queue.dart';

class SyncQueueScreen extends StatelessWidget {
  final List<QueuedScan> scans;

  const SyncQueueScreen({
    Key? key,
    required this.scans,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final pending = scans.where((s) => s.status == SyncStatus.pending).toList();
    final synced = scans.where((s) => s.status == SyncStatus.synced).toList();
    final conflicts = scans.where((s) => s.status == SyncStatus.conflict).toList();
    final failed = scans.where((s) => s.status == SyncStatus.failed).toList();

    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Sync Queue'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Pending', icon: Icon(Icons.pending)),
              Tab(text: 'Synced', icon: Icon(Icons.check)),
              Tab(text: 'Conflicts', icon: Icon(Icons.warning)),
              Tab(text: 'Failed', icon: Icon(Icons.error)),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _buildScanList(pending, 'No pending scans'),
            _buildScanList(synced, 'No synced scans'),
            _buildConflictList(conflicts),
            _buildFailedList(failed),
          ],
        ),
        floatingActionButton: FloatingActionButton(
          onPressed: () {
            // Trigger sync
          },
          child: const Icon(Icons.cloud_upload),
        ),
      ),
    );
  }

  Widget _buildScanList(List<QueuedScan> scans, String emptyMessage) {
    if (scans.isEmpty) {
      return Center(child: Text(emptyMessage));
    }

    return ListView.builder(
      itemCount: scans.length,
      itemBuilder: (context, index) {
        final scan = scans[index];
        return ListTile(
          leading: Icon(_getStatusIcon(scan.status)),
          title: Text('Ticket: ${scan.ticketId.substring(0, 8)}...'),
          subtitle: Text(
            'Scanned: ${scan.scannedAt.toString().substring(0, 19)}',
          ),
          trailing: scan.status == SyncStatus.pending
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : null,
        );
      },
    );
  }

  Widget _buildConflictList(List<QueuedScan> conflicts) {
    if (conflicts.isEmpty) {
      return const Center(child: Text('No conflicts'));
    }

    return ListView.builder(
      itemCount: conflicts.length,
      itemBuilder: (context, index) {
        final scan = conflicts[index];
        return Card(
          child: ListTile(
            leading: const Icon(Icons.warning, color: Colors.orange),
            title: Text('Ticket: ${scan.ticketId.substring(0, 8)}...'),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Scanned: ${scan.scannedAt.toString().substring(0, 19)}'),
                Text(
                  scan.errorMessage ?? 'Conflict detected',
                  style: const TextStyle(color: Colors.orange),
                ),
              ],
            ),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextButton(
                  onPressed: () {
                    // Accept conflict (ticket was checked in elsewhere)
                  },
                  child: const Text('Accept'),
                ),
                TextButton(
                  onPressed: () {
                    // Reject (investigate further)
                  },
                  child: const Text('Reject'),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildFailedList(List<QueuedScan> failed) {
    if (failed.isEmpty) {
      return const Center(child: Text('No failed scans'));
    }

    return ListView.builder(
      itemCount: failed.length,
      itemBuilder: (context, index) {
        final scan = failed[index];
        return Card(
          child: ListTile(
            leading: const Icon(Icons.error, color: Colors.red),
            title: Text('Ticket: ${scan.ticketId.substring(0, 8)}...'),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Scanned: ${scan.scannedAt.toString().substring(0, 19)}'),
                Text(
                  scan.errorMessage ?? 'Unknown error',
                  style: const TextStyle(color: Colors.red),
                ),
                Text('Retries: ${scan.retryCount}'),
              ],
            ),
            trailing: scan.retryCount < 3
                ? TextButton(
                    onPressed: () {
                      // Retry sync
                    },
                    child: const Text('Retry'),
                  )
                : null,
          ),
        );
      },
    );
  }

  IconData _getStatusIcon(SyncStatus status) {
    switch (status) {
      case SyncStatus.pending:
        return Icons.pending;
      case SyncStatus.syncing:
        return Icons.cloud_upload;
      case SyncStatus.synced:
        return Icons.check_circle;
      case SyncStatus.conflict:
        return Icons.warning;
      case SyncStatus.failed:
        return Icons.error;
    }
  }
}
