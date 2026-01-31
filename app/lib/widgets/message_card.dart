import 'package:flutter/material.dart';

import '../models/message_model.dart';
import '../services/haptic_service.dart';

/// Card widget for displaying a unified message (question or task)
class MessageCard extends StatelessWidget {
  final MessageModel message;
  final VoidCallback? onTap;
  final bool handleTap; // If false, parent handles tap (e.g., SelectableCard)

  const MessageCard({
    super.key,
    required this.message,
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
          // Header row with direction badge, priority, and status
          Row(
            children: [
              _buildDirectionBadge(context),
              const SizedBox(width: 8),
              if (message.isHighPriority) ...[
                _buildPriorityBadge(context),
                const SizedBox(width: 8),
              ],
              _buildStatusChip(context),
              const Spacer(),
              Text(
                _formatTime(message.createdAt),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Title (for tasks) or Question text
          if (message.isToClaude && message.title != null) ...[
            Text(
              message.title!,
              style: Theme.of(context).textTheme.titleMedium,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
          ],

          // Content/Instructions
          Text(
            message.content,
            style: Theme.of(context).textTheme.bodyLarge,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
          ),

          // Action badge for tasks
          if (message.isToClaude && message.action != null) ...[
            const SizedBox(height: 8),
            _buildActionBadge(context),
          ],

          // Options preview for questions
          if (message.isToUser && message.hasOptions) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: message.options!
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
          if (message.isToUser && message.isAnswered && message.response != null) ...[
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
                    color: Theme.of(context).colorScheme.onPrimaryContainer,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      message.response!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onPrimaryContainer,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          ],

          // Context preview if available
          if (message.context != null && message.context!.isNotEmpty && !message.isAnswered) ...[
            const SizedBox(height: 8),
            Text(
              message.context!,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    fontStyle: FontStyle.italic,
                  ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
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

  Widget _buildDirectionBadge(BuildContext context) {
    final isToUser = message.isToUser;
    final color = isToUser
        ? Theme.of(context).colorScheme.primary
        : Theme.of(context).colorScheme.secondary;
    final icon = isToUser ? Icons.help_outline : Icons.task_alt;
    final label = isToUser ? 'Question' : 'Task';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withAlpha(30),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withAlpha(80), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }

  Widget _buildPriorityBadge(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
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
            color: Theme.of(context).colorScheme.onErrorContainer,
          ),
          const SizedBox(width: 4),
          Text(
            'High',
            style: TextStyle(
              fontSize: 12,
              color: Theme.of(context).colorScheme.onErrorContainer,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusChip(BuildContext context) {
    Color backgroundColor;
    Color textColor;
    String label;
    IconData icon;

    // Handle direction-specific statuses
    if (message.isToUser) {
      // Question statuses
      if (message.isPending) {
        backgroundColor = Theme.of(context).colorScheme.tertiaryContainer;
        textColor = Theme.of(context).colorScheme.onTertiaryContainer;
        label = 'Pending';
        icon = Icons.schedule;
      } else if (message.isAnswered) {
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
    } else {
      // Task statuses
      switch (message.status) {
        case 'pending':
          backgroundColor = Colors.orange.withAlpha(40);
          textColor = Colors.orange;
          label = 'Pending';
          icon = Icons.hourglass_empty;
          break;
        case 'in_progress':
          backgroundColor = Colors.blue.withAlpha(40);
          textColor = Colors.blue;
          label = 'In Progress';
          icon = Icons.play_circle;
          break;
        case 'complete':
          backgroundColor = Colors.green.withAlpha(40);
          textColor = Colors.green;
          label = 'Complete';
          icon = Icons.check_circle;
          break;
        case 'cancelled':
          backgroundColor = Colors.grey.withAlpha(40);
          textColor = Colors.grey;
          label = 'Cancelled';
          icon = Icons.cancel;
          break;
        default:
          backgroundColor = Colors.grey.withAlpha(40);
          textColor = Colors.grey;
          label = message.status;
          icon = Icons.circle;
      }
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

  Widget _buildActionBadge(BuildContext context) {
    Color color;
    IconData icon;
    String label;

    switch (message.action) {
      case MessageAction.interrupt:
        color = Colors.red;
        icon = Icons.warning;
        label = 'Interrupt';
        break;
      case MessageAction.parallel:
        color = Colors.purple;
        icon = Icons.call_split;
        label = 'Parallel';
        break;
      case MessageAction.queue:
        color = Colors.blue;
        icon = Icons.queue;
        label = 'Queue';
        break;
      case MessageAction.backlog:
        color = Colors.grey;
        icon = Icons.schedule;
        label = 'Backlog';
        break;
      default:
        color = Colors.blue;
        icon = Icons.queue;
        label = 'Queue';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withAlpha(30),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w500),
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
