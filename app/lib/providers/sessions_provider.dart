import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/session_model.dart';
import 'auth_provider.dart';

/// Stream provider for user's active sessions
///
/// Watches sessions collection and filters out archived sessions.
/// Orders by last update time to show most recent activity first.
final sessionsProvider = StreamProvider<List<SessionModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return FirebaseFirestore.instance
      .collection('users')
      .doc(user.uid)
      .collection('sessions')
      .where('state', whereIn: ['working', 'blocked', 'pinned'])
      .orderBy('lastUpdate', descending: true)
      .snapshots()
      .map((snapshot) {
    return snapshot.docs
        .map((doc) => SessionModel.fromFirestore(doc))
        .toList();
  });
});

/// Count of currently active sessions (working state)
final activeSessionCountProvider = Provider<int>((ref) {
  final sessions = ref.watch(sessionsProvider);
  return sessions.when(
    data: (sessionList) =>
        sessionList.where((session) => session.state == 'working').length,
    loading: () => 0,
    error: (_, __) => 0,
  );
});

/// Count of blocked sessions requiring attention
final blockedSessionCountProvider = Provider<int>((ref) {
  final sessions = ref.watch(sessionsProvider);
  return sessions.when(
    data: (sessionList) =>
        sessionList.where((session) => session.state == 'blocked').length,
    loading: () => 0,
    error: (_, __) => 0,
  );
});
