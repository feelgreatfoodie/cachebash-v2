import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../providers/auth_provider.dart';
import '../../providers/sessions_provider.dart';
import '../../services/haptic_service.dart';
import '../../widgets/session_card.dart';

class SessionsScreen extends ConsumerWidget {
  const SessionsScreen({super.key});

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

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final allSessions = ref.watch(allSessionsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('All Sessions'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            HapticService.light();
            context.go('/home');
          },
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.archive),
            onPressed: () {
              HapticService.light();
              context.go('/sessions/archived');
            },
            tooltip: 'Archived',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(allSessionsProvider);
        },
        child: allSessions.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stack) => Center(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text('Error: $error'),
            ),
          ),
          data: (sessions) {
            // Filter out archived sessions
            final visibleSessions =
                sessions.where((s) => !s.isArchived).toList();

            if (visibleSessions.isEmpty) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.terminal,
                      size: 64,
                      color: Theme.of(context).colorScheme.outline,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'No sessions yet',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Claude Code sessions will appear here',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color:
                                Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                    ),
                  ],
                ),
              );
            }

            // Group sessions by state
            final activeSessions =
                visibleSessions.where((s) => s.isActive).toList();
            final inactiveSessions =
                visibleSessions.where((s) => s.isStale && !s.isComplete).toList();
            final completedSessions =
                visibleSessions.where((s) => s.isComplete).toList();

            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (activeSessions.isNotEmpty) ...[
                  _buildSectionHeader(context, 'Active', Icons.play_circle),
                  const SizedBox(height: 12),
                  ...activeSessions.map((s) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: SessionCard(
                          session: s,
                          onTap: () {
                            HapticService.light();
                            context.go('/sessions/${s.id}');
                          },
                          onArchive: () => _archiveSession(context, ref, s.id),
                        ),
                      )),
                  const SizedBox(height: 16),
                ],
                if (inactiveSessions.isNotEmpty) ...[
                  _buildSectionHeader(context, 'Inactive', Icons.access_time),
                  const SizedBox(height: 12),
                  ...inactiveSessions.map((s) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: SessionCard(
                          session: s,
                          onTap: () {
                            HapticService.light();
                            context.go('/sessions/${s.id}');
                          },
                          onArchive: () => _archiveSession(context, ref, s.id),
                        ),
                      )),
                  const SizedBox(height: 16),
                ],
                if (completedSessions.isNotEmpty) ...[
                  _buildSectionHeader(context, 'Completed', Icons.check_circle),
                  const SizedBox(height: 12),
                  ...completedSessions.map((s) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: SessionCard(
                          session: s,
                          onTap: () {
                            HapticService.light();
                            context.go('/sessions/${s.id}');
                          },
                          onArchive: () => _archiveSession(context, ref, s.id),
                        ),
                      )),
                ],
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildSectionHeader(
    BuildContext context,
    String title,
    IconData icon,
  ) {
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
      ],
    );
  }
}
