import 'package:cloud_firestore/cloud_firestore.dart';

/// Question model for agent-to-user async communication
///
/// Agents ask questions when they need human input. Questions support
/// multiple-choice options or free-text responses.
class QuestionModel {
  const QuestionModel({
    required this.id,
    required this.question,
    required this.priority,
    required this.status,
    required this.createdAt,
    this.options,
    this.context,
    this.response,
    this.answeredAt,
    this.projectId,
  });

  final String id;
  final String question;
  final String priority; // low, normal, high
  final String status; // pending, answered, expired
  final DateTime createdAt;
  final List<String>? options; // Multiple choice options
  final String? context; // Additional context for the question
  final String? response; // User's answer
  final DateTime? answeredAt;
  final String? projectId;

  /// Whether this question has been answered
  bool get isAnswered => response != null;

  /// Deserialize from Firestore document
  factory QuestionModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return QuestionModel(
      id: doc.id,
      question: data['question'] as String? ?? '',
      priority: data['priority'] as String? ?? 'normal',
      status: data['status'] as String? ?? 'pending',
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      options: (data['options'] as List<dynamic>?)?.cast<String>(),
      context: data['context'] as String?,
      response: data['response'] as String?,
      answeredAt: (data['answeredAt'] as Timestamp?)?.toDate(),
      projectId: data['projectId'] as String?,
    );
  }

  /// Serialize to map for Firestore writes
  Map<String, dynamic> toMap() {
    return {
      'question': question,
      'priority': priority,
      'status': status,
      'createdAt': Timestamp.fromDate(createdAt),
      if (options != null) 'options': options,
      if (context != null) 'context': context,
      if (response != null) 'response': response,
      if (answeredAt != null) 'answeredAt': Timestamp.fromDate(answeredAt!),
      if (projectId != null) 'projectId': projectId,
    };
  }

  /// Create copy with answer submitted
  QuestionModel copyWith({
    String? response,
    String? status,
  }) {
    return QuestionModel(
      id: id,
      question: question,
      priority: priority,
      status: status ?? this.status,
      createdAt: createdAt,
      options: options,
      context: context,
      response: response ?? this.response,
      answeredAt: response != null ? DateTime.now() : answeredAt,
      projectId: projectId,
    );
  }
}
