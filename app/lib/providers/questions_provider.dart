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

/// Stream provider for all questions (recent, excluding deleted)
final allQuestionsProvider = StreamProvider<List<QuestionModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return firestore
      .collection('users/${user.uid}/questions')
      .where('deletedAt', isNull: true)
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .map((snapshot) =>
          snapshot.docs.map((doc) => QuestionModel.fromFirestore(doc)).toList());
});

/// Stream provider for active (non-archived) questions
final activeQuestionsProvider = StreamProvider<List<QuestionModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return firestore
      .collection('users/${user.uid}/questions')
      .where('deletedAt', isNull: true)
      .where('archived', isEqualTo: false)
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .map((snapshot) =>
          snapshot.docs.map((doc) => QuestionModel.fromFirestore(doc)).toList());
});

/// Stream provider for questions by project
final questionsByProjectProvider =
    StreamProvider.family<List<QuestionModel>, String?>((ref, projectId) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  Query query = firestore
      .collection('users/${user.uid}/questions')
      .where('deletedAt', isNull: true)
      .where('archived', isEqualTo: false);

  if (projectId == null || projectId == '_uncategorized') {
    query = query.where('projectId', isNull: true);
  } else {
    query = query.where('projectId', isEqualTo: projectId);
  }

  return query
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

  /// Archive a question
  Future<void> archiveQuestion({
    required String userId,
    required String questionId,
  }) async {
    await _firestore.doc('users/$userId/questions/$questionId').update({
      'archived': true,
    });
  }

  /// Unarchive a question
  Future<void> unarchiveQuestion({
    required String userId,
    required String questionId,
  }) async {
    await _firestore.doc('users/$userId/questions/$questionId').update({
      'archived': false,
    });
  }

  /// Soft delete a question (sets deletedAt timestamp)
  Future<void> deleteQuestion({
    required String userId,
    required String questionId,
  }) async {
    await _firestore.doc('users/$userId/questions/$questionId').update({
      'deletedAt': FieldValue.serverTimestamp(),
    });
  }

  /// Move question to a project
  Future<void> moveToProject({
    required String userId,
    required String questionId,
    String? projectId,
  }) async {
    await _firestore.doc('users/$userId/questions/$questionId').update({
      'projectId': projectId,
    });
  }
}

final questionsServiceProvider = Provider<QuestionsService>((ref) {
  return QuestionsService();
});
