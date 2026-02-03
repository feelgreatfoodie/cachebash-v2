import 'package:cloud_firestore/cloud_firestore.dart';

/// Model representing a status update in session history
class StatusUpdate {
  final String id;
  final String status;
  final String state;
  final int? progress;
  final DateTime createdAt;

  StatusUpdate({
    required this.id,
    required this.status,
    required this.state,
    this.progress,
    required this.createdAt,
  });

  factory StatusUpdate.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>?;
    return StatusUpdate(
      id: doc.id,
      status: data?['status'] ?? '',
      state: data?['state'] ?? 'working',
      progress: data?['progress'] as int?,
      createdAt:
          (data?['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }
}

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
  final String? projectName;

  /// Sprint-related fields (for wave sessions)
  final String? sprintId;
  final int? waveNumber;
  final List<String>? storyIds;

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
    this.projectName,
    this.sprintId,
    this.waveNumber,
    this.storyIds,
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
      projectName: data?['projectName'] as String?,
      sprintId: data?['sprintId'] as String?,
      waveNumber: data?['waveNumber'] as int?,
      storyIds: (data?['storyIds'] as List<dynamic>?)?.cast<String>(),
    );
  }

  /// Whether this is a wave session (part of a sprint)
  bool get isWaveSession => sprintId != null && waveNumber != null;

  /// Formatted wave number (zero-padded)
  String get formattedWaveNumber =>
      waveNumber?.toString().padLeft(3, '0') ?? '';

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
