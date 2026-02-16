import 'package:cloud_firestore/cloud_firestore.dart';

/// Message model for agent-to-agent communication via relay system
///
/// Messages use a type-safe protocol with defined message types.
/// Priority determines queue ordering, status tracks delivery state.
class MessageModel {
  const MessageModel({
    required this.id,
    required this.source,
    required this.target,
    required this.messageType,
    required this.payload,
    required this.priority,
    required this.status,
    required this.createdAt,
    this.context,
    this.replyTo,
  });

  final String id;
  final String source;
  final String target;
  final String messageType; // PING, PONG, HANDSHAKE, DIRECTIVE, STATUS, etc.
  final Map<String, dynamic> payload;
  final String priority; // low, normal, high
  final String status; // pending, delivered, failed
  final DateTime createdAt;
  final String? context;
  final String? replyTo;

  /// Deserialize from Firestore document
  factory MessageModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return MessageModel(
      id: doc.id,
      source: data['source'] as String? ?? 'unknown',
      target: data['target'] as String? ?? 'unknown',
      messageType: data['messageType'] as String? ?? 'DIRECTIVE',
      payload: data['payload'] as Map<String, dynamic>? ?? {},
      priority: data['priority'] as String? ?? 'normal',
      status: data['status'] as String? ?? 'pending',
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      context: data['context'] as String?,
      replyTo: data['replyTo'] as String?,
    );
  }

  /// Serialize to map for Firestore writes
  Map<String, dynamic> toMap() {
    return {
      'source': source,
      'target': target,
      'messageType': messageType,
      'payload': payload,
      'priority': priority,
      'status': status,
      'createdAt': Timestamp.fromDate(createdAt),
      if (context != null) 'context': context,
      if (replyTo != null) 'replyTo': replyTo,
    };
  }

  /// Create copy with updated fields
  MessageModel copyWith({
    String? status,
  }) {
    return MessageModel(
      id: id,
      source: source,
      target: target,
      messageType: messageType,
      payload: payload,
      priority: priority,
      status: status ?? this.status,
      createdAt: createdAt,
      context: context,
      replyTo: replyTo,
    );
  }
}
