// Ticket Cache Service
// Manages local ticket cache for offline validation

import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/ticket_cache.dart';

class TicketCacheService {
  static const String _cachePrefix = 'event_cache_';
  static const String _cacheListKey = 'cached_events';

  /// Download and cache tickets for an event
  Future<void> cacheEventTickets(
    String eventId,
    List<CachedTicket> tickets,
    String eventTitle,
    String startAt,
    String endAt,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    
    // Calculate expiration (1 hour after event ends)
    final endTime = DateTime.parse(endAt);
    final expiresAt = endTime.add(const Duration(hours: 1));
    
    final cache = EventCache(
      eventId: eventId,
      eventTitle: eventTitle,
      startAt: startAt,
      endAt: endAt,
      tickets: {for (var t in tickets) t.ticketId: t},
      syncedAt: DateTime.now().millisecondsSinceEpoch ~/ 1000,
      expiresAt: expiresAt.millisecondsSinceEpoch ~/ 1000,
    );

    // Store cache
    await prefs.setString(
      '$_cachePrefix$eventId',
      jsonEncode(cache.toJson()),
    );

    // Update cache list
    final cachedEvents = prefs.getStringList(_cacheListKey) ?? [];
    if (!cachedEvents.contains(eventId)) {
      cachedEvents.add(eventId);
      await prefs.setStringList(_cacheListKey, cachedEvents);
    }
  }

  /// Get cached event
  Future<EventCache?> getEventCache(String eventId) async {
    final prefs = await SharedPreferences.getInstance();
    final cacheJson = prefs.getString('$_cachePrefix$eventId');
    
    if (cacheJson == null) return null;

    try {
      final cache = EventCache.fromJson(jsonDecode(cacheJson));
      
      // Check if expired
      if (cache.isExpired) {
        await removeEventCache(eventId);
        return null;
      }

      return cache;
    } catch (e) {
      print('Error parsing cache: $e');
      return null;
    }
  }

  /// Get all cached event IDs
  Future<List<String>> getCachedEventIds() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getStringList(_cacheListKey) ?? [];
  }

  /// Remove event cache
  Future<void> removeEventCache(String eventId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('$_cachePrefix$eventId');
    
    final cachedEvents = prefs.getStringList(_cacheListKey) ?? [];
    cachedEvents.remove(eventId);
    await prefs.setStringList(_cacheListKey, cachedEvents);
  }

  /// Update ticket status in cache (after local check-in)
  Future<void> updateTicketStatus(
    String eventId,
    String ticketId,
    String newStatus,
  ) async {
    final cache = await getEventCache(eventId);
    if (cache == null) return;

    final ticket = cache.tickets[ticketId];
    if (ticket == null) return;

    // Create updated ticket
    final updatedTicket = CachedTicket(
      ticketId: ticket.ticketId,
      eventId: ticket.eventId,
      qrSecret: ticket.qrSecret,
      qrRotationNonce: ticket.qrRotationNonce,
      status: newStatus,
      buyerId: ticket.buyerId,
      ticketType: ticket.ticketType,
      cachedAt: ticket.cachedAt,
    );

    // Update cache
    cache.tickets[ticketId] = updatedTicket;

    // Save back
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      '$_cachePrefix$eventId',
      jsonEncode(cache.toJson()),
    );
  }

  /// Check if cache is stale (older than 5 minutes)
  bool isCacheStale(EventCache cache) {
    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    const staleThreshold = 5 * 60; // 5 minutes
    return (now - cache.syncedAt) > staleThreshold;
  }
}
