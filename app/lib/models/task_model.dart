import 'package:cloud_firestore/cloud_firestore.dart';

import '../services/encryption_service.dart';

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
  final bool isEncrypted;

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
    this.isEncrypted = false,
  });

  /// Create from Firestore without decryption (raw data)
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
      isEncrypted: data?['encrypted'] as bool? ?? false,
    );
  }

  /// Create from Firestore with decryption
  static Future<TaskModel> fromFirestoreDecrypted(
    DocumentSnapshot doc,
    EncryptionService encryptionService,
  ) async {
    final data = doc.data() as Map<String, dynamic>?;
    final isEncrypted = data?['encrypted'] as bool? ?? false;

    String title = data?['title'] ?? 'Untitled Task';
    String instructions = data?['instructions'] ?? '';

    // Decrypt fields if marked as encrypted
    if (isEncrypted) {
      title = await encryptionService.decryptIfNeeded(title);
      instructions = await encryptionService.decryptIfNeeded(instructions);
    }

    return TaskModel(
      id: doc.id,
      title: title,
      instructions: instructions,
      projectId: data?['projectId'],
      priority: data?['priority'] ?? 'normal',
      status: data?['status'] ?? 'pending',
      createdAt:
          (data?['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      startedAt: (data?['startedAt'] as Timestamp?)?.toDate(),
      completedAt: (data?['completedAt'] as Timestamp?)?.toDate(),
      sessionId: data?['sessionId'],
      isEncrypted: isEncrypted,
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
