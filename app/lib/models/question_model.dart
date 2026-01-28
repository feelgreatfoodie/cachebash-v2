import 'package:cloud_firestore/cloud_firestore.dart';

/// Model representing a question from Claude Code
class QuestionModel {
  final String id;
  final String question;
  final List<String>? options;
  final String priority;
  final String status;
  final String? context;
  final String? response;
  final DateTime createdAt;
  final DateTime? answeredAt;

  QuestionModel({
    required this.id,
    required this.question,
    this.options,
    required this.priority,
    required this.status,
    this.context,
    this.response,
    required this.createdAt,
    this.answeredAt,
  });

  factory QuestionModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>?;
    return QuestionModel(
      id: doc.id,
      question: data?['question'] ?? '',
      options: (data?['options'] as List<dynamic>?)?.cast<String>(),
      priority: data?['priority'] ?? 'normal',
      status: data?['status'] ?? 'pending',
      context: data?['context'] as String?,
      response: data?['response'] as String?,
      createdAt: (data?['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      answeredAt: (data?['answeredAt'] as Timestamp?)?.toDate(),
    );
  }

  bool get isPending => status == 'pending';
  bool get isAnswered => status == 'answered';
  bool get isExpired => status == 'expired';
  bool get isHighPriority => priority == 'high';
  bool get hasOptions => options != null && options!.isNotEmpty;

  QuestionModel copyWith({
    String? id,
    String? question,
    List<String>? options,
    String? priority,
    String? status,
    String? context,
    String? response,
    DateTime? createdAt,
    DateTime? answeredAt,
  }) {
    return QuestionModel(
      id: id ?? this.id,
      question: question ?? this.question,
      options: options ?? this.options,
      priority: priority ?? this.priority,
      status: status ?? this.status,
      context: context ?? this.context,
      response: response ?? this.response,
      createdAt: createdAt ?? this.createdAt,
      answeredAt: answeredAt ?? this.answeredAt,
    );
  }
}
