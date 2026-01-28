import 'package:flutter/material.dart';

import '../models/session_model.dart';

class SessionCard extends StatelessWidget {
  final SessionModel session;
  final VoidCallback? onTap;

  const SessionCard({
    super.key,
    required this.session,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header row with state indicator
              Row(
                children: [
                  _buildStateIndicator(context),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      session.name,
                      style: Theme.of(context).textTheme.titleMedium,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),

              // Status text
              if (session.status.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  session.status,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],

              // Progress bar
              if (session.progress != null) ...[
                const SizedBox(height: 12),
                LinearProgressIndicator(
                  value: session.progress! / 100,
                  backgroundColor:
                      Theme.of(context).colorScheme.surfaceContainerHighest,
                ),
                const SizedBox(height: 4),
                Text(
                  '${session.progress}%',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],

              // Last update
              const SizedBox(height: 8),
              Text(
                'Updated ${_formatTime(session.lastUpdate)}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStateIndicator(BuildContext context) {
    Color color;
    IconData icon;

    switch (session.state) {
      case 'working':
        color = Colors.green;
        icon = Icons.play_circle;
        break;
      case 'blocked':
        color = Colors.orange;
        icon = Icons.pause_circle;
        break;
      case 'pinned':
        color = Colors.blue;
        icon = Icons.push_pin;
        break;
      case 'complete':
        color = Colors.grey;
        icon = Icons.check_circle;
        break;
      default:
        color = Colors.grey;
        icon = Icons.circle;
    }

    return Icon(icon, color: color, size: 20);
  }

  String _formatTime(DateTime time) {
    final now = DateTime.now();
    final diff = now.difference(time);

    if (diff.inMinutes < 1) {
      return 'just now';
    } else if (diff.inMinutes < 60) {
      return '${diff.inMinutes}m ago';
    } else if (diff.inHours < 24) {
      return '${diff.inHours}h ago';
    } else {
      return '${diff.inDays}d ago';
    }
  }
}
