import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/question_model.dart';
import '../services/encryption_service.dart';
import 'auth_provider.dart';

final firestore = FirebaseFirestore.instance;

void _log(String message) {
  debugPrint('[QuestionsProvider] $message');
}

/// Helper to decrypt a list of question documents
Future<List<QuestionModel>> _decryptQuestions(
  List<QueryDocumentSnapshot> docs,
  EncryptionService encryptionService,
) async {
  final questions = await Future.wait(
    docs.map((doc) => QuestionModel.fromFirestoreDecrypted(doc, encryptionService)),
  );
  return questions;
}

/// Stream provider for pending questions
final pendingQuestionsProvider = StreamProvider<List<QuestionModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  final encryptionService = ref.watch(encryptionServiceProvider);
  _log('pendingQuestionsProvider: user=${user?.uid}');
  if (user == null) {
    _log('pendingQuestionsProvider: No user, returning empty');
    return Stream.value([]);
  }

  _log('pendingQuestionsProvider: Setting up stream for user ${user.uid}');
  return firestore
      .collection('users/${user.uid}/questions')
      .where('status', isEqualTo: 'pending')
      .orderBy('createdAt', descending: true)
      .snapshots()
      .asyncMap((snapshot) async {
        _log('pendingQuestionsProvider: Got ${snapshot.docs.length} docs');
        return await _decryptQuestions(snapshot.docs, encryptionService);
      })
      .handleError((error, stackTrace) {
        _log('pendingQuestionsProvider ERROR: $error');
        _log('pendingQuestionsProvider STACK: $stackTrace');
        throw error;
      });
});

/// Stream provider for all questions (recent, excluding deleted)
final allQuestionsProvider = StreamProvider<List<QuestionModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  final encryptionService = ref.watch(encryptionServiceProvider);
  _log('allQuestionsProvider: user=${user?.uid}');
  if (user == null) {
    _log('allQuestionsProvider: No user, returning empty');
    return Stream.value([]);
  }

  _log('allQuestionsProvider: Setting up stream for user ${user.uid}');
  return firestore
      .collection('users/${user.uid}/questions')
      .where('deletedAt', isNull: true)
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .asyncMap((snapshot) async {
        _log('allQuestionsProvider: Got ${snapshot.docs.length} docs');
        return await _decryptQuestions(snapshot.docs, encryptionService);
      })
      .handleError((error, stackTrace) {
        _log('allQuestionsProvider ERROR: $error');
        _log('allQuestionsProvider STACK: $stackTrace');
        throw error;
      });
});

/// Stream provider for active (non-archived) questions
final activeQuestionsProvider = StreamProvider<List<QuestionModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  final encryptionService = ref.watch(encryptionServiceProvider);
  _log('activeQuestionsProvider: user=${user?.uid}');
  if (user == null) {
    _log('activeQuestionsProvider: No user, returning empty');
    return Stream.value([]);
  }

  _log('activeQuestionsProvider: Setting up stream for user ${user.uid}');
  return firestore
      .collection('users/${user.uid}/questions')
      .where('deletedAt', isNull: true)
      .where('archived', isEqualTo: false)
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .asyncMap((snapshot) async {
        _log('activeQuestionsProvider: Got ${snapshot.docs.length} docs');
        return await _decryptQuestions(snapshot.docs, encryptionService);
      })
      .handleError((error, stackTrace) {
        _log('activeQuestionsProvider ERROR: $error');
        _log('activeQuestionsProvider STACK: $stackTrace');
        throw error;
      });
});

/// Stream provider for questions by project
final questionsByProjectProvider =
    StreamProvider.family<List<QuestionModel>, String?>((ref, projectId) {
  final user = ref.watch(currentUserProvider);
  final encryptionService = ref.watch(encryptionServiceProvider);
  _log('questionsByProjectProvider: user=${user?.uid}, projectId=$projectId');
  if (user == null) {
    _log('questionsByProjectProvider: No user, returning empty');
    return Stream.value([]);
  }

  _log('questionsByProjectProvider: Setting up stream for user ${user.uid}, project $projectId');
  Query query = firestore
      .collection('users/${user.uid}/questions')
      .where('deletedAt', isNull: true)
      .where('archived', isEqualTo: false);

  if (projectId == null || projectId == '_uncategorized') {
    _log('questionsByProjectProvider: Filtering for uncategorized (projectId isNull)');
    query = query.where('projectId', isNull: true);
  } else {
    _log('questionsByProjectProvider: Filtering for projectId=$projectId');
    query = query.where('projectId', isEqualTo: projectId);
  }

  return query
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .asyncMap((snapshot) async {
        _log('questionsByProjectProvider: Got ${snapshot.docs.length} docs for project $projectId');
        return await _decryptQuestions(snapshot.docs.cast<QueryDocumentSnapshot>(), encryptionService);
      })
      .handleError((error, stackTrace) {
        _log('questionsByProjectProvider ERROR: $error');
        _log('questionsByProjectProvider STACK: $stackTrace');
        throw error;
      });
});

/// Provider for a single question by ID
final questionProvider =
    StreamProvider.family<QuestionModel?, String>((ref, questionId) {
  final user = ref.watch(currentUserProvider);
  final encryptionService = ref.watch(encryptionServiceProvider);
  if (user == null) {
    return Stream.value(null);
  }

  return firestore
      .doc('users/${user.uid}/questions/$questionId')
      .snapshots()
      .asyncMap((doc) async {
        if (!doc.exists) return null;
        return await QuestionModel.fromFirestoreDecrypted(doc, encryptionService);
      });
});

/// Service for answering questions
class QuestionsService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final EncryptionService _encryptionService;

  QuestionsService({EncryptionService? encryptionService})
      : _encryptionService = encryptionService ?? EncryptionService();

  /// Submit a response to a question
  /// If the question was encrypted, the response will also be encrypted
  Future<void> answerQuestion({
    required String userId,
    required String questionId,
    required String response,
    bool encrypt = true,
  }) async {
    // Check if the question is encrypted
    final doc = await _firestore.doc('users/$userId/questions/$questionId').get();
    final isQuestionEncrypted = doc.data()?['encrypted'] as bool? ?? false;

    String finalResponse = response;
    bool shouldEncrypt = encrypt && isQuestionEncrypted;

    if (shouldEncrypt) {
      final encrypted = await _encryptionService.encrypt(response);
      if (encrypted != null) {
        finalResponse = encrypted;
        _log('Response encrypted successfully');
      } else {
        _log('Encryption failed, storing unencrypted');
        shouldEncrypt = false;
      }
    }

    final updateData = {
      'response': finalResponse,
      'status': 'answered',
      'answeredAt': FieldValue.serverTimestamp(),
      if (shouldEncrypt) 'responseEncrypted': true,
    };

    // Update both collections - questions (legacy) and messages (unified)
    await Future.wait([
      _firestore.doc('users/$userId/questions/$questionId').update(updateData),
      _firestore.doc('users/$userId/messages/$questionId').update(updateData).catchError((_) {
        // Messages doc may not exist for legacy questions, ignore error
        return null;
      }),
    ]);
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
