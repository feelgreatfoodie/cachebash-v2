import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/session_model.dart';
import 'auth_provider.dart';

void _log(String message) {
  debugPrint('[SessionsProvider] $message');
}

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

/// Stream provider for a single session by ID
final sessionProvider =
    StreamProvider.family<SessionModel?, String>((ref, sessionId) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value(null);
  }

  _log('Watching session $sessionId');

  return firestore
      .doc('users/${user.uid}/sessions/$sessionId')
      .snapshots()
      .map((doc) {
    if (!doc.exists) {
      _log('Session $sessionId not found');
      return null;
    }
    return SessionModel.fromFirestore(doc);
  });
});

/// Service for session-related operations
class SessionsService {
  final FirebaseFirestore _firestore;

  SessionsService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  /// Send an interrupt message to a session
  /// This creates a document in the session's interrupts subcollection
  /// which the MCP server will pick up
  Future<void> sendInterrupt({
    required String userId,
    required String sessionId,
    required String message,
  }) async {
    _log('Sending interrupt to session $sessionId');

    final interruptRef = _firestore
        .collection('users/$userId/sessions/$sessionId/interrupts')
        .doc();

    await interruptRef.set({
      'message': message,
      'createdAt': FieldValue.serverTimestamp(),
      'status': 'pending',
    });

    _log('Interrupt sent with ID ${interruptRef.id}');
  }
}

/// Provider for sessions service
final sessionsServiceProvider = Provider<SessionsService>((ref) {
  return SessionsService();
});
