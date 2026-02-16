import 'package:flutter/material.dart';

import '../models/session_model.dart';
import '../theme/colors.dart';

/// Session card widget displaying agent work context and progress
///
/// Shows agent name, current status, progress bar, and state indicator.
/// Heartbeat staleness warning appears when agent hasn't checked in recently.
class SessionCard extends StatelessWidget {
  const SessionCard({required this.session, super.key});

  final SessionModel session;

  Color _getStateColor() {
    switch (session.state) {
      case 'working':
        return AppColors.statusWorking;
      case 'blocked':
        return AppColors.statusBlocked;
      case 'complete':
        return AppColors.statusComplete;
      case 'pinned':
        return AppColors.statusPinned;
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

  @override
  Widget build(BuildContext context) {
    final stateColor = _getStateColor();
    final isStale = session.isHeartbeatStale;

    return Card(
      child: InkWell(
        onTap: () {
          // Navigate to session detail screen when implemented
        },
        borderRadius: BorderRadius.circular(12),
        child: Container(
          decoration: BoxDecoration(
            border: Border(
              left: BorderSide(
                color: stateColor,
                width: 4,
              ),
            ),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            session.name,
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(
                                  fontWeight: FontWeight.w600,
                                ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Agent: ${session.agentId}',
                            style:
                                Theme.of(context).textTheme.bodySmall?.copyWith(
                                      color: Colors.grey,
                                    ),
                          ),
                        ],
                      ),
                    ),
                    // State badge
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: stateColor.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        session.state.toUpperCase(),
                        style: TextStyle(
                          color: stateColor,
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Current action/status
                Text(
                  session.status,
                  style: Theme.of(context).textTheme.bodyMedium,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 12),

                // Progress bar
                Row(
                  children: [
                    Expanded(
                      child: LinearProgressIndicator(
                        value: session.progress / 100,
                        backgroundColor: stateColor.withOpacity(0.2),
                        valueColor: AlwaysStoppedAnimation<Color>(stateColor),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${session.progress}%',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: stateColor,
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),

                // Timestamp and heartbeat warning
                Row(
                  children: [
                    if (isStale) ...[
                      Icon(
                        Icons.warning_amber_rounded,
                        size: 16,
                        color: AppColors.statusBlocked,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'Stale heartbeat',
                        style: TextStyle(
                          color: AppColors.statusBlocked,
                          fontSize: 12,
                        ),
                      ),
                      const Spacer(),
                    ] else
                      const Spacer(),
                    Text(
                      _formatTimestamp(session.lastUpdate),
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
      ),
    );
  }
}
