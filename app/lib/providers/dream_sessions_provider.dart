import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/dream_session_model.dart';
import 'auth_provider.dart';

void _log(String message) {
  debugPrint('[DreamSessionsProvider] $message');
}

final firestore = FirebaseFirestore.instance;

/// Stream provider for active dream sessions (pending or active)
final activeDreamSessionsProvider =
    StreamProvider<List<DreamSessionModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) return Stream.value([]);

  return firestore
      .collection('users/${user.uid}/dream_sessions')
      .where('status', whereIn: ['pending', 'active'])
      .orderBy('started_at', descending: true)
      .limit(10)
      .snapshots()
      .map((snapshot) => snapshot.docs
          .map((doc) => DreamSessionModel.fromFirestore(doc))
          .toList());
});

/// Stream provider for a single dream session by ID
final dreamSessionProvider =
    StreamProvider.family<DreamSessionModel?, String>((ref, dreamId) {
  final user = ref.watch(currentUserProvider);
  if (user == null) return Stream.value(null);

  _log('Watching dream session $dreamId');

  return firestore
      .doc('users/${user.uid}/dream_sessions/$dreamId')
      .snapshots()
      .map((doc) {
    if (!doc.exists) {
      _log('Dream session $dreamId not found');
      return null;
    }
    return DreamSessionModel.fromFirestore(doc);
  });
});

/// Stream provider for dream session history (completed/failed/killed)
final dreamSessionHistoryProvider =
    StreamProvider<List<DreamSessionModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) return Stream.value([]);

  return firestore
      .collection('users/${user.uid}/dream_sessions')
      .where('status', whereIn: ['completed', 'failed', 'killed'])
      .orderBy('ended_at', descending: true)
      .limit(20)
      .snapshots()
      .map((snapshot) => snapshot.docs
          .map((doc) => DreamSessionModel.fromFirestore(doc))
          .toList());
});

/// Service for dream session operations
class DreamSessionsService {
  final FirebaseFirestore _firestore;

  DreamSessionsService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  /// Create a new dream session with status: "pending"
  Future<String> createDreamSession({
    required String userId,
    required String agent,
    String? taskId,
    double budgetCapUsd = 5.0,
    int timeoutHours = 4,
  }) async {
    final now = DateTime.now();
    final slug = taskId ?? 'task';
    final datePart =
        '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    final branch = 'dream/$datePart/$slug';

    _log('Creating dream session: agent=$agent, budget=\$$budgetCapUsd');

    final docRef =
        _firestore.collection('users/$userId/dream_sessions').doc();

    await docRef.set({
      'type': 'dream_session',
      'version': 1,
      'status': 'pending',
      'agent': agent,
      'task_id': taskId,
      'budget_cap_usd': budgetCapUsd,
      'budget_consumed_usd': 0.0,
      'timeout_hours': timeoutHours,
      'created_by': 'flynn',
      'started_at': FieldValue.serverTimestamp(),
      'ended_at': null,
      'branch': branch,
      'pr_url': null,
      'outcome': null,
      'morning_report': null,
    });

    _log('Dream session created: ${docRef.id}');
    return docRef.id;
  }

  /// Kill a running dream session
  Future<void> killDreamSession({
    required String userId,
    required String dreamId,
  }) async {
    _log('Killing dream session $dreamId');

    await _firestore.doc('users/$userId/dream_sessions/$dreamId').update({
      'status': 'killed',
      'ended_at': FieldValue.serverTimestamp(),
    });

    _log('Dream session $dreamId killed');
  }
}

/// Provider for dream sessions service
final dreamSessionsServiceProvider = Provider<DreamSessionsService>((ref) {
  return DreamSessionsService();
});
