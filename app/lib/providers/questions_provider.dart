import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/question_model.dart';
import 'auth_provider.dart';

/// Stream provider for unanswered questions
///
/// Watches tasks collection filtering for question type with pending status.
/// Orders by priority then creation time so urgent questions appear first.
final questionsProvider = StreamProvider<List<QuestionModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return FirebaseFirestore.instance
      .collection('users')
      .doc(user.uid)
      .collection('tasks')
      .where('type', isEqualTo: 'question')
      .where('status', isNotEqualTo: 'answered')
      .orderBy('status')
      .orderBy('priority', descending: true)
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map((snapshot) {
    return snapshot.docs
        .map((doc) => QuestionModel.fromFirestore(doc))
        .toList();
  });
});

/// Count of pending questions requiring user response
final pendingQuestionCountProvider = Provider<int>((ref) {
  final questions = ref.watch(questionsProvider);
  return questions.when(
    data: (questionList) =>
        questionList.where((q) => q.status == 'pending').length,
    loading: () => 0,
    error: (_, __) => 0,
  );
});

/// Count of high-priority pending questions
final urgentQuestionCountProvider = Provider<int>((ref) {
  final questions = ref.watch(questionsProvider);
  return questions.when(
    data: (questionList) => questionList
        .where((q) => q.status == 'pending' && q.priority == 'high')
        .length,
    loading: () => 0,
    error: (_, __) => 0,
  );
});
