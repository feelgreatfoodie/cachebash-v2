import 'package:cloud_firestore/cloud_firestore.dart';

/// Session model tracking agent work progress and status
///
/// Sessions represent active work contexts. Progress and status updates
/// provide real-time visibility into what agents are doing.
class SessionModel {
  const SessionModel({
    required this.sessionId,
    required this.name,
    required this.agentId,
    required this.status,
    required this.state,
    required this.progress,
    required this.lastUpdate,
    this.projectName,
    this.lastHeartbeat,
  });

  final String sessionId;
  final String name;
  final String agentId;
  final String status; // Current work description
  final String state; // working, blocked, complete, pinned
  final int progress; // 0-100
  final DateTime lastUpdate;
  final String? projectName;
  final DateTime? lastHeartbeat;

  /// Check if heartbeat is stale (no update in 5+ minutes)
  bool get isHeartbeatStale {
    if (lastHeartbeat == null) return false;
    return DateTime.now().difference(lastHeartbeat!).inMinutes > 5;
  }

  /// Deserialize from Firestore document
  factory SessionModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return SessionModel(
      sessionId: doc.id,
      name: data['name'] as String? ?? '',
      agentId: data['agentId'] as String? ?? 'unknown',
      status: data['status'] as String? ?? '',
      state: data['state'] as String? ?? 'working',
      progress: data['progress'] as int? ?? 0,
      lastUpdate:
          (data['lastUpdate'] as Timestamp?)?.toDate() ?? DateTime.now(),
      projectName: data['projectName'] as String?,
      lastHeartbeat: (data['lastHeartbeat'] as Timestamp?)?.toDate(),
    );
  }

  /// Serialize to map for Firestore writes
  Map<String, dynamic> toMap() {
    return {
      'name': name,
      'agentId': agentId,
      'status': status,
      'state': state,
      'progress': progress,
      'lastUpdate': Timestamp.fromDate(lastUpdate),
      if (projectName != null) 'projectName': projectName,
      if (lastHeartbeat != null)
        'lastHeartbeat': Timestamp.fromDate(lastHeartbeat!),
    };
  }

  /// Create copy with updated fields
  SessionModel copyWith({
    String? status,
    String? state,
    int? progress,
    DateTime? lastHeartbeat,
  }) {
    return SessionModel(
      sessionId: sessionId,
      name: name,
      agentId: agentId,
      status: status ?? this.status,
      state: state ?? this.state,
      progress: progress ?? this.progress,
      lastUpdate: DateTime.now(),
      projectName: projectName,
      lastHeartbeat: lastHeartbeat ?? this.lastHeartbeat,
    );
  }
}
