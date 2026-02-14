import 'package:cloud_firestore/cloud_firestore.dart';

class DreamSessionModel {
  final String id;
  final String type;
  final int version;
  final String status;
  final String agent;
  final String? taskId;
  final double budgetCapUsd;
  final double budgetConsumedUsd;
  final int timeoutHours;
  final String createdBy;
  final DateTime startedAt;
  final DateTime? endedAt;
  final String branch;
  final String? prUrl;
  final String? outcome;
  final String? morningReport;

  DreamSessionModel({
    required this.id,
    this.type = 'dream_session',
    this.version = 1,
    required this.status,
    required this.agent,
    this.taskId,
    required this.budgetCapUsd,
    this.budgetConsumedUsd = 0.0,
    this.timeoutHours = 4,
    this.createdBy = 'flynn',
    required this.startedAt,
    this.endedAt,
    required this.branch,
    this.prUrl,
    this.outcome,
    this.morningReport,
  });

  factory DreamSessionModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>?;
    return DreamSessionModel(
      id: doc.id,
      type: data?['type'] ?? 'dream_session',
      version: data?['version'] ?? 1,
      status: data?['status'] ?? 'pending',
      agent: data?['agent'] ?? 'basher',
      taskId: data?['task_id'] as String?,
      budgetCapUsd: (data?['budget_cap_usd'] as num?)?.toDouble() ?? 5.0,
      budgetConsumedUsd:
          (data?['budget_consumed_usd'] as num?)?.toDouble() ?? 0.0,
      timeoutHours: data?['timeout_hours'] ?? 4,
      createdBy: data?['created_by'] ?? 'flynn',
      startedAt:
          (data?['started_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
      endedAt: (data?['ended_at'] as Timestamp?)?.toDate(),
      branch: data?['branch'] ?? '',
      prUrl: data?['pr_url'] as String?,
      outcome: data?['outcome'] as String?,
      morningReport: data?['morning_report'] as String?,
    );
  }

  // Status helpers
  bool get isPending => status == 'pending';
  bool get isActive => status == 'active';
  bool get isCompleted => status == 'completed';
  bool get isFailed => status == 'failed';
  bool get isKilled => status == 'killed';
  bool get isDone => isCompleted || isFailed || isKilled;
  bool get isRunning => isPending || isActive;

  // Budget helpers
  double get budgetRemaining => budgetCapUsd - budgetConsumedUsd;
  double get budgetPercentUsed =>
      budgetCapUsd > 0 ? (budgetConsumedUsd / budgetCapUsd * 100) : 0;

  // Time helpers
  Duration get elapsed => (endedAt ?? DateTime.now()).difference(startedAt);

  String get elapsedFormatted {
    final d = elapsed;
    if (d.inHours > 0) {
      return '${d.inHours}h ${d.inMinutes.remainder(60)}m';
    } else if (d.inMinutes > 0) {
      return '${d.inMinutes}m';
    } else {
      return '${d.inSeconds}s';
    }
  }

  String get statusDisplay {
    switch (status) {
      case 'pending':
        return 'Waiting for agent';
      case 'active':
        return 'Running';
      case 'completed':
        return 'Complete';
      case 'failed':
        return 'Failed';
      case 'killed':
        return 'Stopped';
      default:
        return status;
    }
  }
}
