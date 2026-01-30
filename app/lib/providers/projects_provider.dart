import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/project_model.dart';
import 'auth_provider.dart';

final firestore = FirebaseFirestore.instance;

/// Stream provider for all projects (excluding deleted)
final projectsProvider = StreamProvider<List<ProjectModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return firestore
      .collection('users/${user.uid}/projects')
      .where('deletedAt', isNull: true)
      .orderBy('createdAt', descending: false)
      .snapshots()
      .map((snapshot) =>
          snapshot.docs.map((doc) => ProjectModel.fromFirestore(doc)).toList());
});

/// Provider for a single project by ID
final projectProvider =
    StreamProvider.family<ProjectModel?, String>((ref, projectId) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value(null);
  }

  // Handle uncategorized specially
  if (projectId == '_uncategorized') {
    return Stream.value(ProjectModel.uncategorized);
  }

  return firestore
      .doc('users/${user.uid}/projects/$projectId')
      .snapshots()
      .map((doc) => doc.exists ? ProjectModel.fromFirestore(doc) : null);
});

/// Provider for projects with question counts
final projectsWithCountsProvider =
    StreamProvider<List<ProjectModel>>((ref) async* {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    yield [];
    return;
  }

  // Get projects stream
  final projectsStream = firestore
      .collection('users/${user.uid}/projects')
      .where('deletedAt', isNull: true)
      .orderBy('createdAt', descending: false)
      .snapshots();

  await for (final snapshot in projectsStream) {
    final projects =
        snapshot.docs.map((doc) => ProjectModel.fromFirestore(doc)).toList();

    // Count uncategorized questions
    final uncategorizedSnapshot = await firestore
        .collection('users/${user.uid}/questions')
        .where('deletedAt', isNull: true)
        .where('archived', isEqualTo: false)
        .where('projectId', isNull: true)
        .count()
        .get();

    final uncategorizedCount = uncategorizedSnapshot.count ?? 0;

    // Add uncategorized as first item if there are any
    final result = <ProjectModel>[];
    if (uncategorizedCount > 0) {
      result.add(ProjectModel.uncategorized.copyWith(
        questionCount: uncategorizedCount,
      ));
    }
    result.addAll(projects);

    yield result;
  }
});

/// Service for managing projects
class ProjectsService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Create a new project
  Future<String> createProject({
    required String userId,
    required String name,
  }) async {
    final docRef = await _firestore.collection('users/$userId/projects').add({
      'name': name,
      'createdAt': FieldValue.serverTimestamp(),
      'questionCount': 0,
      'isDefault': false,
      'deletedAt': null,
    });
    return docRef.id;
  }

  /// Rename a project
  Future<void> renameProject({
    required String userId,
    required String projectId,
    required String name,
  }) async {
    await _firestore.doc('users/$userId/projects/$projectId').update({
      'name': name,
    });
  }

  /// Soft delete a project (archives its questions)
  Future<void> deleteProject({
    required String userId,
    required String projectId,
  }) async {
    // First, archive all questions in this project
    final questions = await _firestore
        .collection('users/$userId/questions')
        .where('projectId', isEqualTo: projectId)
        .get();

    final batch = _firestore.batch();
    for (final doc in questions.docs) {
      batch.update(doc.reference, {'archived': true});
    }

    // Then soft delete the project
    batch.update(_firestore.doc('users/$userId/projects/$projectId'), {
      'deletedAt': FieldValue.serverTimestamp(),
    });

    await batch.commit();
  }

  /// Set a project as the default for new questions
  Future<void> setDefaultProject({
    required String userId,
    required String? projectId,
  }) async {
    // Clear existing default
    final existingDefaults = await _firestore
        .collection('users/$userId/projects')
        .where('isDefault', isEqualTo: true)
        .get();

    final batch = _firestore.batch();
    for (final doc in existingDefaults.docs) {
      batch.update(doc.reference, {'isDefault': false});
    }

    // Set new default if specified
    if (projectId != null && projectId != '_uncategorized') {
      batch.update(_firestore.doc('users/$userId/projects/$projectId'), {
        'isDefault': true,
      });
    }

    await batch.commit();
  }
}

final projectsServiceProvider = Provider<ProjectsService>((ref) {
  return ProjectsService();
});
