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

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final pendingQuestions = ref.watch(pendingQuestionsProvider);
    final activeSessions = ref.watch(activeSessionsProvider);

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
                            child: SessionCard(session: s),
                          ))
                      .toList(),
                );
              },
            ),

            const SizedBox(height: 24),

            // Quick Actions
            _buildSectionHeader(context, 'Quick Actions', Icons.flash_on),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _buildActionCard(
                    context,
                    Icons.folder,
                    'Projects',
                    () => context.go('/projects'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildActionCard(
                    context,
                    Icons.history,
                    'Questions',
                    () => context.go('/questions'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildActionCard(
                    context,
                    Icons.settings,
                    'Settings',
                    () => context.go('/settings'),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 32),

            // User info
            Center(
              child: Text(
                'Signed in as ${user?.email ?? 'Unknown'}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
            ),
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
              errorMessage.length > 200 ? '${errorMessage.substring(0, 200)}...' : errorMessage,
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

  Widget _buildActionCard(
    BuildContext context,
    IconData icon,
    String label,
    VoidCallback onTap,
  ) {
    return Card(
      child: InkWell(
        onTap: () {
          HapticService.light();
          onTap();
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Icon(icon, size: 32, color: Theme.of(context).colorScheme.primary),
              const SizedBox(height: 8),
              Text(label, style: Theme.of(context).textTheme.labelLarge),
            ],
          ),
        ),
      ),
    );
  }
}
