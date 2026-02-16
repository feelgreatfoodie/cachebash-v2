import 'package:cloud_firestore/cloud_firestore.dart';

/// Model representing a story within a sprint
class SprintStory {
  final String id;
  final String title;
  final String status;
  final int wave;
  final int progress;
  final String? currentAction;
  final List<String> dependencies;
  final String complexity;
  final String? model;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final int? duration;
  final bool addedDynamically;

  SprintStory({
    required this.id,
    required this.title,
    required this.status,
    required this.wave,
    required this.progress,
    this.currentAction,
    this.dependencies = const [],
    this.complexity = 'normal',
    this.model,
    this.startedAt,
    this.completedAt,
    this.duration,
    this.addedDynamically = false,
  });

  factory SprintStory.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>?;
    return SprintStory(
      id: doc.id,
      title: data?['title'] ?? 'Untitled',
      status: data?['status'] ?? 'queued',
      wave: data?['wave'] ?? 1,
      progress: data?['progress'] ?? 0,
      currentAction: data?['currentAction'] as String?,
      dependencies: List<String>.from(data?['dependencies'] ?? []),
      complexity: data?['complexity'] ?? 'normal',
      model: data?['model'] as String?,
      startedAt: (data?['startedAt'] as Timestamp?)?.toDate(),
      completedAt: (data?['completedAt'] as Timestamp?)?.toDate(),
      duration: data?['duration'] as int?,
      addedDynamically: data?['addedDynamically'] ?? false,
    );
  }

  bool get isQueued => status == 'queued';
  bool get isActive => status == 'active';
  bool get isComplete => status == 'complete';
  bool get isFailed => status == 'failed';
  bool get isSkipped => status == 'skipped';
  bool get isDone => isComplete || isFailed || isSkipped;
  bool get isHighComplexity => complexity == 'high';
}

/// Model representing sprint configuration
class SprintConfig {
  final String orchestratorModel;
  final String subagentModel;
  final int maxConcurrent;

  SprintConfig({
    this.orchestratorModel = 'opus',
    this.subagentModel = 'sonnet',
    this.maxConcurrent = 3,
  });

  factory SprintConfig.fromMap(Map<String, dynamic>? data) {
    return SprintConfig(
      orchestratorModel: data?['orchestratorModel'] ?? 'opus',
      subagentModel: data?['subagentModel'] ?? 'sonnet',
      maxConcurrent: data?['maxConcurrent'] ?? 3,
    );
  }
}

/// Model representing sprint summary
class SprintSummary {
  final int completed;
  final int failed;
  final int skipped;
  final int duration;

  SprintSummary({
    this.completed = 0,
    this.failed = 0,
    this.skipped = 0,
    this.duration = 0,
  });

  factory SprintSummary.fromMap(Map<String, dynamic>? data) {
    return SprintSummary(
      completed: data?['completed'] ?? 0,
      failed: data?['failed'] ?? 0,
      skipped: data?['skipped'] ?? 0,
      duration: data?['duration'] ?? 0,
    );
  }

  int get total => completed + failed + skipped;
}

/// Model representing an agent sprint
class SprintModel {
  final String id;
  final String projectName;
  final String branch;
  final String status;
  final int currentWave;
  final int totalWaves;
  final DateTime startedAt;
  final DateTime updatedAt;
  final DateTime? completedAt;
  final String? sessionId; // Legacy: single session
  final Map<int, String> waveSessionIds; // New: wave number -> session ID
  final SprintConfig config;
  final SprintSummary? summary;

  SprintModel({
    required this.id,
    required this.projectName,
    required this.branch,
    required this.status,
    required this.currentWave,
    required this.totalWaves,
    required this.startedAt,
    required this.updatedAt,
    this.completedAt,
    this.sessionId,
    this.waveSessionIds = const {},
    required this.config,
    this.summary,
  });

  factory SprintModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>?;

    // Parse waveSessionIds map (keys are strings in Firestore)
    final waveSessionIdsRaw =
        data?['waveSessionIds'] as Map<String, dynamic>? ?? {};
    final waveSessionIds = waveSessionIdsRaw.map(
      (key, value) => MapEntry(int.parse(key), value as String),
    );

    return SprintModel(
      id: doc.id,
      projectName: data?['projectName'] ?? 'Unknown Project',
      branch: data?['branch'] ?? 'main',
      status: data?['status'] ?? 'running',
      currentWave: data?['currentWave'] ?? 1,
      totalWaves: data?['totalWaves'] ?? 1,
      startedAt:
          (data?['startedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedAt:
          (data?['updatedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      completedAt: (data?['completedAt'] as Timestamp?)?.toDate(),
      sessionId: data?['sessionId'] as String?,
      waveSessionIds: waveSessionIds,
      config: SprintConfig.fromMap(data?['config'] as Map<String, dynamic>?),
      summary: data?['summary'] != null
          ? SprintSummary.fromMap(data!['summary'] as Map<String, dynamic>)
          : null,
    );
  }

  /// Get session ID for a specific wave
  String? getSessionIdForWave(int wave) => waveSessionIds[wave];

  /// Whether this sprint uses wave sessions
  bool get hasWaveSessions => waveSessionIds.isNotEmpty;

  bool get isRunning => status == 'running';
  bool get isPaused => status == 'paused';
  bool get isComplete => status == 'complete';
  bool get isError => status == 'error';

  String get waveProgress => 'Wave $currentWave of $totalWaves';

  Duration get elapsed => DateTime.now().difference(startedAt);

  String get elapsedFormatted {
    final d = elapsed;
    if (d.inHours > 0) {
      return '${d.inHours}h ${d.inMinutes.remainder(60)}m';
    } else if (d.inMinutes > 0) {
      return '${d.inMinutes}m ${d.inSeconds.remainder(60)}s';
    } else {
      return '${d.inSeconds}s';
    }
  }
}
