// Main entry point for Scanner App

import 'package:flutter/material.dart';
import 'screens/scanner_screen.dart';
import 'services/ticket_cache_service.dart';
import 'services/sync_service.dart';
import 'services/queue_service.dart';
import 'services/scanner_service.dart';

void main() {
  runApp(const ScannerApp());
}

class ScannerApp extends StatelessWidget {
  const ScannerApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Inner City Scanner',
      theme: ThemeData(
        primarySwatch: Colors.blue,
        useMaterial3: true,
      ),
      home: const EventSelectionScreen(),
    );
  }
}

class EventSelectionScreen extends StatefulWidget {
  const EventSelectionScreen({Key? key}) : super(key: key);

  @override
  State<EventSelectionScreen> createState() => _EventSelectionScreenState();
}

class _EventSelectionScreenState extends State<EventSelectionScreen> {
  final cacheService = TicketCacheService();
  final queueService = QueueService();
  List<String> cachedEventIds = [];

  @override
  void initState() {
    super.initState();
    _loadCachedEvents();
  }

  Future<void> _loadCachedEvents() async {
    final events = await cacheService.getCachedEventIds();
    setState(() {
      cachedEventIds = events;
    });
  }

  Future<void> _downloadEventTickets(String eventId) async {
    // TODO: Fetch tickets from API
    // For now, this is a placeholder
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Downloading tickets...')),
    );
  }

  Future<void> _openScanner(String eventId) async {
    final cache = await cacheService.getEventCache(eventId);
    if (cache == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please download tickets first'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    // Initialize services
    final syncService = SyncService(
      apiBaseUrl: 'https://your-project.supabase.co', // TODO: Get from config
      authToken: 'your-auth-token', // TODO: Get from auth
      deviceId: 'device-id', // TODO: Get from device
      scannerUserId: 'scanner-user-id', // TODO: Get from auth
    );

    final scannerService = ScannerService(
      cacheService: cacheService,
      syncService: syncService,
      queueService: queueService,
      currentEventId: eventId,
    );

    if (!mounted) return;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => ScannerScreen(
          eventId: eventId,
          scannerService: scannerService,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Select Event'),
      ),
      body: cachedEventIds.isEmpty
          ? const Center(
              child: Text('No events cached. Download tickets first.'),
            )
          : ListView.builder(
              itemCount: cachedEventIds.length,
              itemBuilder: (context, index) {
                final eventId = cachedEventIds[index];
                return ListTile(
                  title: Text('Event: $eventId'),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.download),
                        onPressed: () => _downloadEventTickets(eventId),
                        tooltip: 'Re-download tickets',
                      ),
                      IconButton(
                        icon: const Icon(Icons.qr_code_scanner),
                        onPressed: () => _openScanner(eventId),
                        tooltip: 'Open scanner',
                      ),
                    ],
                  ),
                );
              },
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          // TODO: Show dialog to enter event ID and download
        },
        child: const Icon(Icons.add),
      ),
    );
  }
}
