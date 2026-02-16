import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/task_model.dart';
import 'auth_provider.dart';

/// Stream provider for user's tasks collection
///
/// Watches Firestore for real-time updates and orders by creation time.
/// Only returns tasks for the authenticated user.
final tasksProvider = StreamProvider<List<TaskModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return FirebaseFirestore.instance
      .collection('users')
      .doc(user.uid)
      .collection('tasks')
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map((snapshot) {
    return snapshot.docs.map((doc) => TaskModel.fromFirestore(doc)).toList();
  });
});

/// Filtered provider showing only active tasks (not done/failed)
final activeTasksProvider = Provider<List<TaskModel>>((ref) {
  final tasks = ref.watch(tasksProvider);
  return tasks.when(
    data: (taskList) => taskList
        .where((task) => task.status != 'done' && task.status != 'failed')
        .toList(),
    loading: () => [],
    error: (_, __) => [],
  );
});

/// Count of pending tasks (created but not active)
final pendingTaskCountProvider = Provider<int>((ref) {
  final tasks = ref.watch(tasksProvider);
  return tasks.when(
    data: (taskList) =>
        taskList.where((task) => task.status == 'created').length,
    loading: () => 0,
    error: (_, __) => 0,
  );
});
