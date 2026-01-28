import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/session_model.dart';
import 'auth_provider.dart';

final firestore = FirebaseFirestore.instance;

/// Stream provider for active sessions
final activeSessionsProvider = StreamProvider<List<SessionModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return firestore
      .collection('users/${user.uid}/sessions')
      .where('state', whereIn: ['working', 'blocked', 'pinned'])
      .orderBy('lastUpdate', descending: true)
      .limit(10)
      .snapshots()
      .map((snapshot) =>
          snapshot.docs.map((doc) => SessionModel.fromFirestore(doc)).toList());
});

/// Stream provider for all sessions
final allSessionsProvider = StreamProvider<List<SessionModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return firestore
      .collection('users/${user.uid}/sessions')
      .orderBy('lastUpdate', descending: true)
      .limit(50)
      .snapshots()
      .map((snapshot) =>
          snapshot.docs.map((doc) => SessionModel.fromFirestore(doc)).toList());
});
