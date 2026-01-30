import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/task_model.dart';
import 'auth_provider.dart';

void _log(String message) {
  debugPrint('[TasksProvider] $message');
}

final _firestore = FirebaseFirestore.instance;

/// Stream provider for pending tasks
final pendingTasksProvider = StreamProvider<List<TaskModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return _firestore
      .collection('users/${user.uid}/tasks')
      .where('status', isEqualTo: 'pending')
      .orderBy('createdAt', descending: true)
      .limit(20)
      .snapshots()
      .map((snapshot) =>
          snapshot.docs.map((doc) => TaskModel.fromFirestore(doc)).toList());
});

/// Stream provider for in-progress tasks
final inProgressTasksProvider = StreamProvider<List<TaskModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return _firestore
      .collection('users/${user.uid}/tasks')
      .where('status', isEqualTo: 'in_progress')
      .orderBy('startedAt', descending: true)
      .limit(10)
      .snapshots()
      .map((snapshot) =>
          snapshot.docs.map((doc) => TaskModel.fromFirestore(doc)).toList());
});

/// Stream provider for all tasks (recent)
final recentTasksProvider = StreamProvider<List<TaskModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return _firestore
      .collection('users/${user.uid}/tasks')
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .map((snapshot) =>
          snapshot.docs.map((doc) => TaskModel.fromFirestore(doc)).toList());
});

/// Service for task-related operations
class TasksService {
  final FirebaseFirestore _firestore;

  TasksService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  /// Create a new task for Claude Code to pick up
  Future<String> createTask({
    required String userId,
    required String title,
    required String instructions,
    String? projectId,
    String priority = 'normal',
  }) async {
    _log('Creating task: $title');

    final taskRef = _firestore.collection('users/$userId/tasks').doc();

    await taskRef.set({
      'title': title,
      'instructions': instructions,
      'projectId': projectId,
      'priority': priority,
      'status': 'pending',
      'createdAt': FieldValue.serverTimestamp(),
      'startedAt': null,
      'completedAt': null,
      'sessionId': null,
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
