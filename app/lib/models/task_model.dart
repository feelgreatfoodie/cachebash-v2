import 'package:cloud_firestore/cloud_firestore.dart';

import '../services/encryption_service.dart';

/// Task action levels that control how/when Claude handles tasks
enum TaskAction {
  /// Stop current work immediately and handle this task
  interrupt,

  /// Spin up a subagent at the next convenient moment
  parallel,

  /// Handle when current task completes (default)
  queue,

  /// Low priority, handle when idle
  backlog,
}

extension TaskActionExtension on TaskAction {
  String get value {
    switch (this) {
      case TaskAction.interrupt:
        return 'interrupt';
      case TaskAction.parallel:
        return 'parallel';
      case TaskAction.queue:
        return 'queue';
      case TaskAction.backlog:
        return 'backlog';
    }
  }

  static TaskAction fromString(String? value) {
    switch (value) {
      case 'interrupt':
        return TaskAction.interrupt;
      case 'parallel':
        return TaskAction.parallel;
      case 'queue':
        return TaskAction.queue;
      case 'backlog':
        return TaskAction.backlog;
      default:
        return TaskAction.queue;
    }
  }

  String get displayName {
    switch (this) {
      case TaskAction.interrupt:
        return 'Interrupt';
      case TaskAction.parallel:
        return 'Parallel';
      case TaskAction.queue:
        return 'Queue';
      case TaskAction.backlog:
        return 'Backlog';
    }
  }

  String get description {
    switch (this) {
      case TaskAction.interrupt:
        return 'Stop work immediately';
      case TaskAction.parallel:
        return 'Start new Claude soon';
      case TaskAction.queue:
        return 'Do after current task';
      case TaskAction.backlog:
        return 'When convenient';
    }
  }
}

/// Model representing a task for Claude Code to work on
class TaskModel {
  final String id;
  final String title;
  final String instructions;
  final String? projectId;
  final String priority; // low, normal, high
  final TaskAction action; // interrupt, parallel, queue, backlog
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
    this.action = TaskAction.queue,
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
      action: TaskActionExtension.fromString(data?['action']),
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
    String? actionStr = data?['action'];

    // Decrypt fields if marked as encrypted
    if (isEncrypted) {
      title = await encryptionService.decryptIfNeeded(title);
      instructions = await encryptionService.decryptIfNeeded(instructions);
      if (actionStr != null) {
        actionStr = await encryptionService.decryptIfNeeded(actionStr);
      }
    }

    return TaskModel(
      id: doc.id,
      title: title,
      instructions: instructions,
      projectId: data?['projectId'],
      priority: data?['priority'] ?? 'normal',
      action: TaskActionExtension.fromString(actionStr),
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

  bool get isInterrupt => action == TaskAction.interrupt;
  bool get isParallel => action == TaskAction.parallel;
  bool get isQueue => action == TaskAction.queue;
  bool get isBacklog => action == TaskAction.backlog;
}
