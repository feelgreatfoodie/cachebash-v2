import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../providers/questions_provider.dart';
import '../../providers/sessions_provider.dart';
import '../../providers/tasks_provider.dart';
import '../../theme/colors.dart';

/// Home dashboard showing overview of agent activity and pending items
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activeSessions = ref.watch(activeSessionCountProvider);
    final blockedSessions = ref.watch(blockedSessionCountProvider);
    final pendingQuestions = ref.watch(pendingQuestionCountProvider);
    final urgentQuestions = ref.watch(urgentQuestionCountProvider);
    final pendingTasks = ref.watch(pendingTaskCountProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('CacheBash'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () => context.push('/settings'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          // Firestore listeners auto-refresh, but provide haptic feedback
          await Future.delayed(const Duration(milliseconds: 500));
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Agent Sessions Summary
            _SummaryCard(
              title: 'Active Sessions',
              value: activeSessions.toString(),
              subtitle:
                  blockedSessions > 0 ? '$blockedSessions blocked' : 'Running',
              icon: Icons.hub,
              color: blockedSessions > 0
                  ? AppColors.statusBlocked
                  : AppColors.statusWorking,
              onTap: () => context.push('/sessions'),
            ),
            const SizedBox(height: 12),

            // Pending Questions
            _SummaryCard(
              title: 'Pending Questions',
              value: pendingQuestions.toString(),
              subtitle: urgentQuestions > 0
                  ? '$urgentQuestions urgent'
                  : 'No urgent items',
              icon: Icons.help_outline,
              color: urgentQuestions > 0
                  ? AppColors.priorityHigh
                  : AppColors.priorityNormal,
              onTap: () => context.push('/questions'),
              badge: urgentQuestions > 0 ? urgentQuestions : null,
            ),
            const SizedBox(height: 12),

            // Pending Tasks
            _SummaryCard(
              title: 'Pending Tasks',
              value: pendingTasks.toString(),
              subtitle: 'Waiting to start',
              icon: Icons.task_alt,
              color: AppColors.priorityNormal,
              onTap: () => context.push('/tasks'),
            ),
            const SizedBox(height: 24),

            // Quick Actions
            Text(
              'Quick Actions',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 12),
            _QuickActionGrid(
              actions: [
                _QuickAction(
                  label: 'Sessions',
                  icon: Icons.hub,
                  onTap: () => context.push('/sessions'),
                ),
                _QuickAction(
                  label: 'Tasks',
                  icon: Icons.task_alt,
                  onTap: () => context.push('/tasks'),
                ),
                _QuickAction(
                  label: 'Messages',
                  icon: Icons.message_outlined,
                  onTap: () => context.push('/messages'),
                ),
                _QuickAction(
                  label: 'Scheduled',
                  icon: Icons.schedule,
                  onTap: () => context.push('/scheduled'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.title,
    required this.value,
    required this.subtitle,
    required this.icon,
    required this.color,
    required this.onTap,
    this.badge,
  });

  final String title;
  final String value;
  final String subtitle;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  final int? badge;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, color: color, size: 28),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: Theme.of(context)
                                .colorScheme
                                .onSurface
                                .withOpacity(0.7),
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      value,
                      style:
                          Theme.of(context).textTheme.headlineMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                    ),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: color,
                          ),
                    ),
                  ],
                ),
              ),
              if (badge != null)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.priorityHigh,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    badge.toString(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                ),
              const Icon(Icons.chevron_right, color: Colors.grey),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickAction {
  const _QuickAction({
    required this.label,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;
}

class _QuickActionGrid extends StatelessWidget {
  const _QuickActionGrid({required this.actions});

  final List<_QuickAction> actions;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 1.5,
      ),
      itemCount: actions.length,
      itemBuilder: (context, index) {
        final action = actions[index];
        return Card(
          child: InkWell(
            onTap: action.onTap,
            borderRadius: BorderRadius.circular(12),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(action.icon, size: 32),
                const SizedBox(height: 8),
                Text(
                  action.label,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
