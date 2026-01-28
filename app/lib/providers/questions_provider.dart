import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/question_model.dart';
import 'auth_provider.dart';

final firestore = FirebaseFirestore.instance;

/// Stream provider for pending questions
final pendingQuestionsProvider = StreamProvider<List<QuestionModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return firestore
      .collection('users/${user.uid}/questions')
      .where('status', isEqualTo: 'pending')
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map((snapshot) =>
          snapshot.docs.map((doc) => QuestionModel.fromFirestore(doc)).toList());
});

/// Stream provider for all questions (recent)
final allQuestionsProvider = StreamProvider<List<QuestionModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return firestore
      .collection('users/${user.uid}/questions')
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .map((snapshot) =>
          snapshot.docs.map((doc) => QuestionModel.fromFirestore(doc)).toList());
});

/// Provider for a single question by ID
final questionProvider =
    StreamProvider.family<QuestionModel?, String>((ref, questionId) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value(null);
  }

  return firestore
      .doc('users/${user.uid}/questions/$questionId')
      .snapshots()
      .map((doc) => doc.exists ? QuestionModel.fromFirestore(doc) : null);
});

/// Service for answering questions
class QuestionsService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Submit a response to a question
  Future<void> answerQuestion({
    required String userId,
    required String questionId,
    required String response,
  }) async {
    await _firestore.doc('users/$userId/questions/$questionId').update({
      'response': response,
      'status': 'answered',
      'answeredAt': FieldValue.serverTimestamp(),
    });
  }

  /// Mark a question as expired
  Future<void> expireQuestion({
    required String userId,
    required String questionId,
  }) async {
    await _firestore.doc('users/$userId/questions/$questionId').update({
      'status': 'expired',
    });
  }
}

final questionsServiceProvider = Provider<QuestionsService>((ref) {
  return QuestionsService();
});
