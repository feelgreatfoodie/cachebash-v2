import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../providers/auth_provider.dart';
import '../../providers/questions_provider.dart';
import '../../providers/sessions_provider.dart';
import '../../services/haptic_service.dart';
import '../../widgets/question_card.dart';
import '../../widgets/session_card.dart';

void _log(String message) {
  debugPrint('[HomeScreen] $message');
}

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  Future<void> _archiveSession(
    BuildContext context,
    WidgetRef ref,
    String sessionId,
  ) async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;

    try {
      await ref.read(sessionsServiceProvider).archiveSession(
            userId: user.uid,
            sessionId: sessionId,
          );
      HapticService.success();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Session archived')),
        );
      }
    } catch (e) {
      HapticService.error();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  Future<void> _archiveAllInactive(
    BuildContext context,
    WidgetRef ref,
  ) async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;

    HapticService.medium();

    try {
      final count = await ref.read(sessionsServiceProvider).archiveAllStale(
            userId: user.uid,
          );
      HapticService.success();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Archived $count session(s)')),
        );
      }
    } catch (e) {
      HapticService.error();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final pendingQuestions = ref.watch(pendingQuestionsProvider);
    final activeSessions = ref.watch(activeSessionsProvider);
    final inactiveSessions = ref.watch(inactiveSessionsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('CacheBash'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () {
              HapticService.light();
              context.go('/settings');
            },
            tooltip: 'Settings',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(pendingQuestionsProvider);
          ref.invalidate(activeSessionsProvider);
          ref.invalidate(inactiveSessionsProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Pending Questions Section
            _buildSectionHeader(
              context,
              'Pending Questions',
              Icons.help_outline,
              onViewAll: () => context.go('/questions'),
            ),
            const SizedBox(height: 12),
            pendingQuestions.when(
              loading: () => const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(),
                ),
              ),
              error: (error, stack) => _buildErrorCard(context, error),
              data: (questions) {
                if (questions.isEmpty) {
                  return _buildEmptyCard(
                    context,
                    Icons.inbox,
                    'No pending questions',
                    'Questions from Claude will appear here',
                  );
                }
                return Column(
                  children: questions
                      .take(3)
                      .map((q) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: QuestionCard(
                              question: q,
                              onTap: () => context.go('/questions/${q.id}'),
                            ),
                          ))
                      .toList(),
                );
              },
            ),

            const SizedBox(height: 24),

            // Active Sessions Section
            _buildSectionHeader(
              context,
              'Active Sessions',
              Icons.terminal,
              onViewAll: () => context.go('/sessions'),
            ),
            const SizedBox(height: 12),
            activeSessions.when(
              loading: () => const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(),
                ),
              ),
              error: (error, stack) => _buildErrorCard(context, error),
              data: (sessions) {
                if (sessions.isEmpty) {
                  return _buildEmptyCard(
                    context,
                    Icons.terminal,
                    'No active sessions',
                    'Claude Code sessions will appear here',
                  );
                }
                return Column(
                  children: sessions
                      .take(3)
                      .map((s) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: SessionCard(
                              session: s,
                              onTap: () {
                                HapticService.light();
                                context.go('/sessions/${s.id}');
                              },
                              onArchive: () =>
                                  _archiveSession(context, ref, s.id),
                            ),
                          ))
                      .toList(),
                );
              },
            ),

            // Inactive Sessions Section (stale sessions)
            inactiveSessions.when(
              loading: () => const SizedBox.shrink(),
              error: (error, stack) => const SizedBox.shrink(),
              data: (sessions) {
                if (sessions.isEmpty) {
                  return const SizedBox.shrink();
                }
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 24),
                    _buildSectionHeader(
                      context,
                      'Inactive (${sessions.length})',
                      Icons.access_time,
                      actionWidget: TextButton.icon(
                        onPressed: () => _archiveAllInactive(context, ref),
                        icon: const Icon(Icons.archive, size: 16),
                        label: const Text('Archive All'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Sessions not updated in 30+ minutes',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color:
                                Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                    ),
                    const SizedBox(height: 12),
                    ...sessions.take(5).map((s) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: SessionCard(
                            session: s,
                            showSwipeHint: sessions.indexOf(s) == 0,
                            onTap: () {
                              HapticService.light();
                              context.go('/sessions/${s.id}');
                            },
                            onArchive: () =>
                                _archiveSession(context, ref, s.id),
                          ),
                        )),
                  ],
                );
              },
            ),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(
    BuildContext context,
    String title,
    IconData icon, {
    VoidCallback? onViewAll,
    Widget? actionWidget,
  }) {
    return Row(
      children: [
        Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary),
        const SizedBox(width: 8),
        Text(
          title,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
        ),
        const Spacer(),
        if (actionWidget != null) actionWidget,
        if (onViewAll != null)
          TextButton(
            onPressed: onViewAll,
            child: const Text('View All'),
          ),
      ],
    );
  }

  Widget _buildEmptyCard(
    BuildContext context,
    IconData icon,
    String title,
    String subtitle,
  ) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Icon(
              icon,
              size: 48,
              color: Theme.of(context).colorScheme.outline,
            ),
            const SizedBox(height: 12),
            Text(
              title,
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorCard(BuildContext context, Object error) {
    _log('ERROR: $error');
    final errorMessage = error.toString();
    return Card(
      color: Theme.of(context).colorScheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.error_outline,
                  color: Theme.of(context).colorScheme.onErrorContainer,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Error loading data',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onErrorContainer,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              errorMessage.length > 200
                  ? '${errorMessage.substring(0, 200)}...'
                  : errorMessage,
              style: TextStyle(
                color: Theme.of(context).colorScheme.onErrorContainer,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }

}
