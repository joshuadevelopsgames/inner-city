// Ticket Cache Models for Scanner App
// Flutter implementation

import 'dart:convert';

/// Cached ticket information for offline validation
class CachedTicket {
  final String ticketId;
  final String eventId;
  final String qrSecret;
  final int qrRotationNonce;
  final String status; // 'active', 'used', 'refunded', 'revoked'
  final String buyerId;
  final String? ticketType;
  final int cachedAt; // Unix timestamp

  CachedTicket({
    required this.ticketId,
    required this.eventId,
    required this.qrSecret,
    required this.qrRotationNonce,
    required this.status,
    required this.buyerId,
    this.ticketType,
    required this.cachedAt,
  });

  Map<String, dynamic> toJson() => {
        'ticket_id': ticketId,
        'event_id': eventId,
        'qr_secret': qrSecret,
        'qr_rotation_nonce': qrRotationNonce,
        'status': status,
        'buyer_id': buyerId,
        'ticket_type': ticketType,
        'cached_at': cachedAt,
      };

  factory CachedTicket.fromJson(Map<String, dynamic> json) => CachedTicket(
        ticketId: json['ticket_id'] as String,
        eventId: json['event_id'] as String,
        qrSecret: json['qr_secret'] as String,
        qrRotationNonce: json['qr_rotation_nonce'] as int,
        status: json['status'] as String,
        buyerId: json['buyer_id'] as String,
        ticketType: json['ticket_type'] as String?,
        cachedAt: json['cached_at'] as int,
      );

  bool get isActive => status == 'active';
  bool get isUsed => status == 'used';
}

/// Event cache containing all tickets for an event
class EventCache {
  final String eventId;
  final String eventTitle;
  final String startAt;
  final String endAt;
  final Map<String, CachedTicket> tickets;
  final int syncedAt; // Unix timestamp
  final int expiresAt; // Unix timestamp

  EventCache({
    required this.eventId,
    required this.eventTitle,
    required this.startAt,
    required this.endAt,
    required this.tickets,
    required this.syncedAt,
    required this.expiresAt,
  });

  bool get isExpired => DateTime.now().millisecondsSinceEpoch ~/ 1000 > expiresAt;

  CachedTicket? getTicket(String ticketId) => tickets[ticketId];

  Map<String, dynamic> toJson() => {
        'event_id': eventId,
        'event_title': eventTitle,
        'start_at': startAt,
        'end_at': endAt,
        'tickets': tickets.map((k, v) => MapEntry(k, v.toJson())),
        'synced_at': syncedAt,
        'expires_at': expiresAt,
      };

  factory EventCache.fromJson(Map<String, dynamic> json) {
    final ticketsMap = (json['tickets'] as Map<String, dynamic>).map(
      (k, v) => MapEntry(k, CachedTicket.fromJson(v as Map<String, dynamic>)),
    );

    return EventCache(
      eventId: json['event_id'] as String,
      eventTitle: json['event_title'] as String,
      startAt: json['start_at'] as String,
      endAt: json['end_at'] as String,
      tickets: ticketsMap,
      syncedAt: json['synced_at'] as int,
      expiresAt: json['expires_at'] as int,
    );
  }
}
