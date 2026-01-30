import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/task_model.dart';
import '../services/encryption_service.dart';
import 'auth_provider.dart';

void _log(String message) {
  debugPrint('[TasksProvider] $message');
}

final _firestore = FirebaseFirestore.instance;

/// Helper to decrypt a list of task documents
Future<List<TaskModel>> _decryptTasks(
  List<QueryDocumentSnapshot> docs,
  EncryptionService encryptionService,
) async {
  final tasks = await Future.wait(
    docs.map((doc) => TaskModel.fromFirestoreDecrypted(doc, encryptionService)),
  );
  return tasks;
}

/// Stream provider for pending tasks
final pendingTasksProvider = StreamProvider<List<TaskModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  final encryptionService = ref.watch(encryptionServiceProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return _firestore
      .collection('users/${user.uid}/tasks')
      .where('status', isEqualTo: 'pending')
      .orderBy('createdAt', descending: true)
      .limit(20)
      .snapshots()
      .asyncMap((snapshot) async {
        return await _decryptTasks(snapshot.docs, encryptionService);
      });
});

/// Stream provider for in-progress tasks
final inProgressTasksProvider = StreamProvider<List<TaskModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  final encryptionService = ref.watch(encryptionServiceProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return _firestore
      .collection('users/${user.uid}/tasks')
      .where('status', isEqualTo: 'in_progress')
      .orderBy('startedAt', descending: true)
      .limit(10)
      .snapshots()
      .asyncMap((snapshot) async {
        return await _decryptTasks(snapshot.docs, encryptionService);
      });
});

/// Stream provider for all tasks (recent)
final recentTasksProvider = StreamProvider<List<TaskModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  final encryptionService = ref.watch(encryptionServiceProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return _firestore
      .collection('users/${user.uid}/tasks')
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .asyncMap((snapshot) async {
        return await _decryptTasks(snapshot.docs, encryptionService);
      });
});

/// Service for task-related operations
class TasksService {
  final FirebaseFirestore _firestore;
  final EncryptionService _encryptionService;

  TasksService({FirebaseFirestore? firestore, EncryptionService? encryptionService})
      : _firestore = firestore ?? FirebaseFirestore.instance,
        _encryptionService = encryptionService ?? EncryptionService();

  /// Create a new task for Claude Code to pick up
  /// Task title, instructions, and action are encrypted by default
  Future<String> createTask({
    required String userId,
    required String title,
    required String instructions,
    String? projectId,
    String priority = 'normal',
    TaskAction action = TaskAction.queue,
    bool encrypt = true,
  }) async {
    _log('Creating task: $title (action: ${action.value})');

    final taskRef = _firestore.collection('users/$userId/tasks').doc();

    String finalTitle = title;
    String finalInstructions = instructions;
    String finalAction = action.value;
    bool isEncrypted = false;

    if (encrypt) {
      final encryptedTitle = await _encryptionService.encrypt(title);
      final encryptedInstructions = await _encryptionService.encrypt(instructions);
      final encryptedAction = await _encryptionService.encrypt(action.value);

      if (encryptedTitle != null && encryptedInstructions != null && encryptedAction != null) {
        finalTitle = encryptedTitle;
        finalInstructions = encryptedInstructions;
        finalAction = encryptedAction;
        isEncrypted = true;
        _log('Task encrypted successfully');
      } else {
        _log('Encryption failed, storing unencrypted');
      }
    }

    await taskRef.set({
      'title': finalTitle,
      'instructions': finalInstructions,
      'projectId': projectId,
      'priority': priority,
      'action': finalAction,
      'status': 'pending',
      'createdAt': FieldValue.serverTimestamp(),
      'startedAt': null,
      'completedAt': null,
      'sessionId': null,
      'encrypted': isEncrypted,
    });

    _log('Task created with ID ${taskRef.id}');
    return taskRef.id;
  }

  /// Cancel a pending task
  Future<void> cancelTask({
    required String userId,
    required String taskId,
  }) async {
    _log('Cancelling task $taskId');

    await _firestore.doc('users/$userId/tasks/$taskId').update({
      'status': 'cancelled',
    });

    _log('Task $taskId cancelled');
  }

  /// Delete a task
  Future<void> deleteTask({
    required String userId,
    required String taskId,
  }) async {
    _log('Deleting task $taskId');

    await _firestore.doc('users/$userId/tasks/$taskId').delete();

    _log('Task $taskId deleted');
  }

  /// Update task priority
  Future<void> updatePriority({
    required String userId,
    required String taskId,
    required String priority,
  }) async {
    _log('Updating task $taskId priority to $priority');

    await _firestore.doc('users/$userId/tasks/$taskId').update({
      'priority': priority,
    });
  }
}

/// Provider for tasks service
final tasksServiceProvider = Provider<TasksService>((ref) {
  return TasksService();
});
