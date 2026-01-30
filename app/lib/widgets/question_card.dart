import 'package:flutter/material.dart';

import '../models/question_model.dart';
import '../services/haptic_service.dart';

class QuestionCard extends StatelessWidget {
  final QuestionModel question;
  final VoidCallback? onTap;
  final bool handleTap; // If false, parent handles tap (e.g., SelectableCard)

  const QuestionCard({
    super.key,
    required this.question,
    this.onTap,
    this.handleTap = true,
  });

  @override
  Widget build(BuildContext context) {
    final content = Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header row with priority and status
              Row(
                children: [
                  if (question.isHighPriority) ...[
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.errorContainer,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.priority_high,
                            size: 14,
                            color: Theme.of(context)
                                .colorScheme
                                .onErrorContainer,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'High',
                            style: TextStyle(
                              fontSize: 12,
                              color: Theme.of(context)
                                  .colorScheme
                                  .onErrorContainer,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                  ],
                  _buildStatusChip(context),
                  const Spacer(),
                  Text(
                    _formatTime(question.createdAt),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color:
                              Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Question text
              Text(
                question.question,
                style: Theme.of(context).textTheme.bodyLarge,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
              ),

              // Options preview
              if (question.hasOptions) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: question.options!
                      .take(3)
                      .map((option) => Chip(
                            label: Text(
                              option,
                              style: const TextStyle(fontSize: 12),
                            ),
                            visualDensity: VisualDensity.compact,
                          ))
                      .toList(),
                ),
              ],

              // Response preview if answered
              if (question.isAnswered && question.response != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.reply,
                        size: 16,
                        color:
                            Theme.of(context).colorScheme.onPrimaryContainer,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          question.response!,
                          style: TextStyle(
                            color: Theme.of(context)
                                .colorScheme
                                .onPrimaryContainer,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        );

    return Card(
      clipBehavior: Clip.antiAlias,
      child: handleTap
          ? InkWell(
              onTap: () {
                HapticService.light();
                onTap?.call();
              },
              child: content,
            )
          : content,
    );
  }

  Widget _buildStatusChip(BuildContext context) {
    Color backgroundColor;
    Color textColor;
    String label;
    IconData icon;

    if (question.isPending) {
      backgroundColor = Theme.of(context).colorScheme.tertiaryContainer;
      textColor = Theme.of(context).colorScheme.onTertiaryContainer;
      label = 'Pending';
      icon = Icons.schedule;
    } else if (question.isAnswered) {
      backgroundColor = Theme.of(context).colorScheme.primaryContainer;
      textColor = Theme.of(context).colorScheme.onPrimaryContainer;
      label = 'Answered';
      icon = Icons.check;
    } else {
      backgroundColor = Theme.of(context).colorScheme.surfaceContainerHighest;
      textColor = Theme.of(context).colorScheme.onSurfaceVariant;
      label = 'Expired';
      icon = Icons.timer_off;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: textColor),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(fontSize: 12, color: textColor),
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime time) {
    final now = DateTime.now();
    final diff = now.difference(time);

    if (diff.inMinutes < 1) {
      return 'now';
    } else if (diff.inMinutes < 60) {
      return '${diff.inMinutes}m';
    } else if (diff.inHours < 24) {
      return '${diff.inHours}h';
    } else {
      return '${diff.inDays}d';
    }
  }
}
