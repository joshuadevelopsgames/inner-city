// Scanner Screen
// Main screen for scanning QR codes

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../models/scan_result.dart';
import '../services/scanner_service.dart';

class ScannerScreen extends StatefulWidget {
  final String eventId;
  final ScannerService scannerService;

  const ScannerScreen({
    Key? key,
    required this.eventId,
    required this.scannerService,
  }) : super(key: key);

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  final MobileScannerController controller = MobileScannerController();
  ScanResultData? lastScanResult;
  int validCount = 0;
  int invalidCount = 0;
  int totalScans = 0;
  bool isProcessing = false;

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  Future<void> _handleScan(String? barcode) async {
    if (barcode == null || isProcessing) return;

    setState(() {
      isProcessing = true;
      lastScanResult = null;
    });

    try {
      final result = await widget.scannerService.scanToken(
        barcode,
        'scanner-user-id', // Get from auth
        'device-id', // Get from device
      );

      setState(() {
        lastScanResult = result;
        isProcessing = false;
        totalScans++;

        switch (result.result) {
          case ScanResult.valid:
            validCount++;
            break;
          case ScanResult.invalid:
          case ScanResult.alreadyUsed:
            invalidCount++;
            break;
          case ScanResult.needsOnlineValidation:
            // Don't increment counts yet
            break;
        }
      });

      // Show result overlay
      _showResultOverlay(result);

      // Auto-dismiss after 2 seconds (or manual dismiss)
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) {
          setState(() {
            lastScanResult = null;
          });
        }
      });
    } catch (e) {
      setState(() {
        isProcessing = false;
        lastScanResult = ScanResultData(
          result: ScanResult.invalid,
          ticketId: 'unknown',
          reason: 'Scan error: $e',
          token: barcode,
          scannedAt: DateTime.now(),
        );
      });
    }
  }

  void _showResultOverlay(ScanResultData result) {
    // Show result overlay (implement with overlay or dialog)
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scanner'),
        actions: [
          // Queue count badge
          Stack(
            children: [
              IconButton(
                icon: const Icon(Icons.cloud_upload),
                onPressed: () {
                  // Navigate to sync queue screen
                },
              ),
              // Badge with count
            ],
          ),
        ],
      ),
      body: Stack(
        children: [
          // Camera viewfinder
          MobileScanner(
            controller: controller,
            onDetect: (capture) {
              final barcode = capture.barcodes.firstOrNull;
              if (barcode?.rawValue != null) {
                _handleScan(barcode!.rawValue);
              }
            },
          ),

          // Stats overlay (top)
          Positioned(
            top: 16,
            left: 16,
            right: 16,
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.black87,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _buildStat('Valid', validCount, Colors.green),
                  _buildStat('Invalid', invalidCount, Colors.red),
                  _buildStat('Total', totalScans, Colors.blue),
                ],
              ),
            ),
          ),

          // Result overlay (center)
          if (lastScanResult != null)
            Center(
              child: _buildResultCard(lastScanResult!),
            ),

          // Processing indicator
          if (isProcessing)
            const Center(
              child: CircularProgressIndicator(),
            ),
        ],
      ),
    );
  }

  Widget _buildStat(String label, int count, Color color) {
    return Column(
      children: [
        Text(
          count.toString(),
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        Text(
          label,
          style: const TextStyle(fontSize: 12, color: Colors.white70),
        ),
      ],
    );
  }

  Widget _buildResultCard(ScanResultData result) {
    Color backgroundColor;
    IconData icon;
    String message;

    switch (result.result) {
      case ScanResult.valid:
        backgroundColor = Colors.green;
        icon = Icons.check_circle;
        message = 'Valid Ticket';
        break;
      case ScanResult.alreadyUsed:
        backgroundColor = Colors.orange;
        icon = Icons.warning;
        message = 'Already Checked In';
        break;
      case ScanResult.invalid:
        backgroundColor = Colors.red;
        icon = Icons.error;
        message = 'Invalid Ticket';
        break;
      case ScanResult.needsOnlineValidation:
        backgroundColor = Colors.blue;
        icon = Icons.cloud_sync;
        message = 'Verifying Online...';
        break;
    }

    return Card(
      color: backgroundColor,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 64, color: Colors.white),
            const SizedBox(height: 16),
            Text(
              message,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              result.reason,
              style: const TextStyle(fontSize: 14, color: Colors.white70),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
