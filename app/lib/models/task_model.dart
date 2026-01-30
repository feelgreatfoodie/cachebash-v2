import 'package:cloud_firestore/cloud_firestore.dart';

/// Model representing a task for Claude Code to work on
class TaskModel {
  final String id;
  final String title;
  final String instructions;
  final String? projectId;
  final String priority; // low, normal, high
  final String status; // pending, in_progress, complete, cancelled
  final DateTime createdAt;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final String? sessionId; // Session that picked up this task

  TaskModel({
    required this.id,
    required this.title,
    required this.instructions,
    this.projectId,
    required this.priority,
    required this.status,
    required this.createdAt,
    this.startedAt,
    this.completedAt,
    this.sessionId,
  });

  factory TaskModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>?;
    return TaskModel(
      id: doc.id,
      title: data?['title'] ?? 'Untitled Task',
      instructions: data?['instructions'] ?? '',
      projectId: data?['projectId'],
      priority: data?['priority'] ?? 'normal',
      status: data?['status'] ?? 'pending',
      createdAt:
          (data?['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      startedAt: (data?['startedAt'] as Timestamp?)?.toDate(),
      completedAt: (data?['completedAt'] as Timestamp?)?.toDate(),
      sessionId: data?['sessionId'],
    );
  }

  bool get isPending => status == 'pending';
  bool get isInProgress => status == 'in_progress';
  bool get isComplete => status == 'complete';
  bool get isCancelled => status == 'cancelled';

  bool get isHighPriority => priority == 'high';
  bool get isNormalPriority => priority == 'normal';
  bool get isLowPriority => priority == 'low';
}
