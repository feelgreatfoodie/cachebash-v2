import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/sprint_model.dart';
import 'auth_provider.dart';

void _log(String message) {
  debugPrint('[SprintsProvider] $message');
}

final firestore = FirebaseFirestore.instance;

/// Stream provider for active sprints (running or paused)
final activeSprintsProvider = StreamProvider<List<SprintModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return firestore
      .collection('users/${user.uid}/sprints')
      .where('status', whereIn: ['running', 'paused'])
      .orderBy('startedAt', descending: true)
      .limit(10)
      .snapshots()
      .map((snapshot) =>
          snapshot.docs.map((doc) => SprintModel.fromFirestore(doc)).toList());
});

/// Stream provider for completed sprints
final completedSprintsProvider = StreamProvider<List<SprintModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return firestore
      .collection('users/${user.uid}/sprints')
      .where('status', isEqualTo: 'complete')
      .orderBy('completedAt', descending: true)
      .limit(20)
      .snapshots()
      .map((snapshot) =>
          snapshot.docs.map((doc) => SprintModel.fromFirestore(doc)).toList());
});

/// Stream provider for all sprints
final allSprintsProvider = StreamProvider<List<SprintModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return firestore
      .collection('users/${user.uid}/sprints')
      .orderBy('startedAt', descending: true)
      .limit(50)
      .snapshots()
      .map((snapshot) =>
          snapshot.docs.map((doc) => SprintModel.fromFirestore(doc)).toList());
});

/// Stream provider for a single sprint by ID
final sprintProvider =
    StreamProvider.family<SprintModel?, String>((ref, sprintId) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value(null);
  }

  _log('Watching sprint $sprintId');

  return firestore
      .doc('users/${user.uid}/sprints/$sprintId')
      .snapshots()
      .map((doc) {
    if (!doc.exists) {
      _log('Sprint $sprintId not found');
      return null;
    }
    return SprintModel.fromFirestore(doc);
  });
});

/// Stream provider for stories within a sprint
final sprintStoriesProvider =
    StreamProvider.family<List<SprintStory>, String>((ref, sprintId) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  _log('Watching stories for sprint $sprintId');

  return firestore
      .collection('users/${user.uid}/sprints/$sprintId/stories')
      .orderBy('wave')
      .snapshots()
      .map((snapshot) =>
          snapshot.docs.map((doc) => SprintStory.fromFirestore(doc)).toList());
});

/// Provider for stories grouped by wave
final sprintStoriesByWaveProvider =
    Provider.family<Map<int, List<SprintStory>>, List<SprintStory>>(
        (ref, stories) {
  final grouped = <int, List<SprintStory>>{};
  for (final story in stories) {
    grouped.putIfAbsent(story.wave, () => []).add(story);
  }
  return grouped;
});

/// Service for sprint-related operations
class SprintsService {
  final FirebaseFirestore _firestore;

  SprintsService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  /// Pause a running sprint
  Future<void> pauseSprint({
    required String userId,
    required String sprintId,
  }) async {
    _log('Pausing sprint $sprintId');

    await _firestore.doc('users/$userId/sprints/$sprintId').update({
      'status': 'paused',
      'updatedAt': FieldValue.serverTimestamp(),
    });

    _log('Sprint $sprintId paused');
  }

  /// Resume a paused sprint
  Future<void> resumeSprint({
    required String userId,
    required String sprintId,
  }) async {
    _log('Resuming sprint $sprintId');

    await _firestore.doc('users/$userId/sprints/$sprintId').update({
      'status': 'running',
      'updatedAt': FieldValue.serverTimestamp(),
    });

    _log('Sprint $sprintId resumed');
  }

  /// Add a story to an active sprint
  Future<void> addStory({
    required String userId,
    required String sprintId,
    required String storyId,
    required String title,
    required String insertionMode,
    String complexity = 'normal',
    List<String> dependencies = const [],
  }) async {
    _log('Adding story $storyId to sprint $sprintId');

    final sprintDoc =
        await _firestore.doc('users/$userId/sprints/$sprintId').get();
    if (!sprintDoc.exists) {
      throw Exception('Sprint not found');
    }

    final sprintData = sprintDoc.data()!;
    final currentWave = sprintData['currentWave'] ?? 1;
    final totalWaves = sprintData['totalWaves'] ?? 1;

    int wave;
    switch (insertionMode) {
      case 'current_wave':
        wave = currentWave;
        break;
      case 'next_wave':
        wave = currentWave + 1;
        break;
      case 'backlog':
        wave = totalWaves + 1;
        break;
      default:
        wave = currentWave + 1;
    }

    final batch = _firestore.batch();

    // Add story
    batch.set(
        _firestore.doc('users/$userId/sprints/$sprintId/stories/$storyId'), {
      'id': storyId,
      'title': title,
      'status': 'queued',
      'wave': wave,
      'progress': 0,
      'complexity': complexity,
      'dependencies': dependencies,
      'addedDynamically': true,
      'createdAt': FieldValue.serverTimestamp(),
    });

    // Update totalWaves if needed
    if (wave > totalWaves) {
      batch.update(_firestore.doc('users/$userId/sprints/$sprintId'), {
        'totalWaves': wave,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    _log('Story $storyId added to wave $wave');
  }

  /// Delete a sprint
  Future<void> deleteSprint({
    required String userId,
    required String sprintId,
  }) async {
    _log('Deleting sprint $sprintId');

    // Delete all stories first
    final storiesSnapshot = await _firestore
        .collection('users/$userId/sprints/$sprintId/stories')
        .get();

    final batch = _firestore.batch();
    for (final doc in storiesSnapshot.docs) {
      batch.delete(doc.reference);
    }

    // Delete the sprint
    batch.delete(_firestore.doc('users/$userId/sprints/$sprintId'));

    await batch.commit();
    _log('Sprint $sprintId deleted');
  }
}

/// Provider for sprints service
final sprintsServiceProvider = Provider<SprintsService>((ref) {
  return SprintsService();
});
