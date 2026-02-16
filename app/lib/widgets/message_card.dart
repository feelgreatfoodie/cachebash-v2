import 'package:flutter/material.dart';

import '../models/message_model.dart';
import '../theme/colors.dart';

/// Message card widget displaying relay communication metadata
///
/// Shows source/target agents, message type, priority, and payload preview.
/// Tappable for full message detail viewing (when implemented).
class MessageCard extends StatelessWidget {
  const MessageCard({required this.message, super.key});

  final MessageModel message;

  Color _getPriorityColor() {
    switch (message.priority) {
      case 'high':
        return AppColors.priorityHigh;
      case 'low':
        return AppColors.priorityLow;
      default:
        return AppColors.priorityNormal;
    }
  }

  Color _getMessageTypeColor() {
    switch (message.messageType) {
      case 'DIRECTIVE':
        return AppColors.messageDirective;
      case 'STATUS':
        return AppColors.messageStatus;
      case 'QUERY':
        return AppColors.messageQuery;
      case 'RESULT':
        return AppColors.messageResult;
      default:
        return Colors.grey;
    }
  }

  String _formatTimestamp(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);

    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }

  String _getPayloadPreview() {
    if (message.payload.isEmpty) return 'No payload';
    final text = message.payload.toString();
    return text.length > 100 ? '${text.substring(0, 100)}...' : text;
  }

  @override
  Widget build(BuildContext context) {
    final priorityColor = _getPriorityColor();
    final typeColor = _getMessageTypeColor();

    return Card(
      child: InkWell(
        onTap: () {
          // Navigate to message detail screen when implemented
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  // Message type badge
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: typeColor.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      message.messageType,
                      style: TextStyle(
                        color: typeColor,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const Spacer(),
                  // Priority indicator
                  if (message.priority != 'normal')
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: priorityColor.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        message.priority.toUpperCase(),
                        style: TextStyle(
                          color: priorityColor,
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),

              // Source -> Target
              Row(
                children: [
                  Icon(Icons.arrow_forward, size: 16, color: Colors.grey),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      '${message.source} → ${message.target}',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w500,
                          ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),

              // Payload preview
              Text(
                _getPayloadPreview(),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context)
                          .colorScheme
                          .onSurface
                          .withOpacity(0.7),
                    ),
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 12),

              // Timestamp and context
              Row(
                children: [
                  if (message.context != null) ...[
                    Icon(Icons.info_outline, size: 14, color: Colors.grey),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        message.context!,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Colors.grey,
                            ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ] else
                    const Spacer(),
                  Text(
                    _formatTimestamp(message.createdAt),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Colors.grey,
                        ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
