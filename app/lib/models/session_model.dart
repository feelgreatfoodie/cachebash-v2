import 'package:cloud_firestore/cloud_firestore.dart';

/// Model representing a Claude Code session
class SessionModel {
  final String id;
  final String name;
  final String status;
  final String state;
  final int? progress;
  final DateTime lastUpdate;
  final bool archived;
  final DateTime? archivedAt;

  /// Sessions are considered stale after this duration without updates
  static const staleDuration = Duration(minutes: 30);

  SessionModel({
    required this.id,
    required this.name,
    required this.status,
    required this.state,
    this.progress,
    required this.lastUpdate,
    this.archived = false,
    this.archivedAt,
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
      archived: data?['archived'] ?? false,
      archivedAt: (data?['archivedAt'] as Timestamp?)?.toDate(),
    );
  }

  bool get isWorking => state == 'working';
  bool get isBlocked => state == 'blocked';
  bool get isComplete => state == 'complete';
  bool get isPinned => state == 'pinned';
  bool get isArchived => archived;

  /// Session is stale if not updated recently and still marked as working
  bool get isStale {
    if (isComplete || isArchived) return false;
    return DateTime.now().difference(lastUpdate) > staleDuration;
  }

  /// Session is actively running (working/blocked and not stale)
  bool get isActive {
    if (isComplete || isArchived || isStale) return false;
    return isWorking || isBlocked || isPinned;
  }

  /// Display state considering staleness
  String get displayState {
    if (isArchived) return 'archived';
    if (isStale && !isComplete) return 'inactive';
    return state;
  }
}
