import 'package:cloud_firestore/cloud_firestore.dart';

/// Model representing a Claude Code session
class SessionModel {
  final String id;
  final String name;
  final String status;
  final String state;
  final int? progress;
  final DateTime lastUpdate;

  SessionModel({
    required this.id,
    required this.name,
    required this.status,
    required this.state,
    this.progress,
    required this.lastUpdate,
  });

  factory SessionModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>?;
    return SessionModel(
      id: doc.id,
      name: data?['name'] ?? 'Unknown Session',
      status: data?['status'] ?? '',
      state: data?['state'] ?? 'working',
      progress: data?['progress'] as int?,
      lastUpdate:
          (data?['lastUpdate'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  bool get isWorking => state == 'working';
  bool get isBlocked => state == 'blocked';
  bool get isComplete => state == 'complete';
  bool get isPinned => state == 'pinned';
}
