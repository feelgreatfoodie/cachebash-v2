import 'package:cloud_firestore/cloud_firestore.dart';

/// Task model representing work dispatched to agents
///
/// Tasks flow through a lifecycle: created -> active -> done/failed
/// The 'action' field controls urgency and scheduling behavior.
class TaskModel {
  const TaskModel({
    required this.id,
    required this.type,
    required this.title,
    required this.instructions,
    required this.priority,
    required this.action,
    required this.status,
    required this.source,
    required this.target,
    required this.createdAt,
    this.projectId,
  });

  final String id;
  final String type; // task, question, scheduled
  final String title;
  final String instructions;
  final String priority; // low, normal, high
  final String action; // interrupt, parallel, queue, backlog
  final String status; // created, active, done, failed
  final String source;
  final String target;
  final DateTime createdAt;
  final String? projectId;

  /// Deserialize from Firestore document
  factory TaskModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return TaskModel(
      id: doc.id,
      type: data['type'] as String? ?? 'task',
      title: data['title'] as String? ?? '',
      instructions: data['instructions'] as String? ?? '',
      priority: data['priority'] as String? ?? 'normal',
      action: data['action'] as String? ?? 'queue',
      status: data['status'] as String? ?? 'created',
      source: data['source'] as String? ?? 'unknown',
      target: data['target'] as String? ?? 'unknown',
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      projectId: data['projectId'] as String?,
    );
  }

  /// Serialize to map for Firestore writes
  Map<String, dynamic> toMap() {
    return {
      'type': type,
      'title': title,
      'instructions': instructions,
      'priority': priority,
      'action': action,
      'status': status,
      'source': source,
      'target': target,
      'createdAt': Timestamp.fromDate(createdAt),
      if (projectId != null) 'projectId': projectId,
    };
  }

  /// Create copy with updated fields
  TaskModel copyWith({
    String? status,
    String? priority,
    String? action,
  }) {
    return TaskModel(
      id: id,
      type: type,
      title: title,
      instructions: instructions,
      priority: priority ?? this.priority,
      action: action ?? this.action,
      status: status ?? this.status,
      source: source,
      target: target,
      createdAt: createdAt,
      projectId: projectId,
    );
  }
}
