import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/session_model.dart';
import '../../providers/auth_provider.dart';
import '../../providers/sessions_provider.dart';
import '../../providers/selection_provider.dart';
import '../../services/haptic_service.dart';
import '../../widgets/animated_list_item.dart';
import '../../widgets/selectable_card.dart';
import '../../widgets/selection_action_bar.dart';
import '../../widgets/session_card.dart';
import '../../widgets/shimmer_card.dart';

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

  Future<void> _archiveSelected(
    BuildContext context,
    WidgetRef ref,
    Set<String> selectedIds,
  ) async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Archive Sessions?'),
        content: Text('Archive ${selectedIds.length} selected session(s)?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              HapticService.medium();
              Navigator.pop(context, true);
            },
            child: const Text('Archive'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      final service = ref.read(sessionsServiceProvider);
      for (final id in selectedIds) {
        await service.archiveSession(userId: user.uid, sessionId: id);
      }
      HapticService.success();
      ref.read(sessionsSelectionProvider.notifier).exitSelectionMode();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Archived ${selectedIds.length} session(s)')),
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

  Future<void> _deleteSelected(
    BuildContext context,
    WidgetRef ref,
    Set<String> selectedIds,
  ) async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Sessions?'),
        content: Text(
          'Delete ${selectedIds.length} selected session(s)? This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              HapticService.medium();
              Navigator.pop(context, true);
            },
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      final service = ref.read(sessionsServiceProvider);
      for (final id in selectedIds) {
        await service.deleteSession(userId: user.uid, sessionId: id);
      }
      HapticService.success();
      ref.read(sessionsSelectionProvider.notifier).exitSelectionMode();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Deleted ${selectedIds.length} session(s)')),
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
    final selectionState = ref.watch(sessionsSelectionProvider);

    return PopScope(
      canPop: !selectionState.isSelecting,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop && selectionState.isSelecting) {
          ref.read(sessionsSelectionProvider.notifier).exitSelectionMode();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: selectionState.isSelecting
              ? Text('${selectionState.selectedCount} selected')
              : const Text('All Sessions'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () {
              if (selectionState.isSelecting) {
                HapticService.light();
                ref.read(sessionsSelectionProvider.notifier).exitSelectionMode();
              } else {
                HapticService.light();
                context.go('/home');
              }
            },
          ),
          actions: [
            if (!selectionState.isSelecting) ...[
              IconButton(
                icon: const Icon(Icons.checklist),
                onPressed: () {
                  HapticService.light();
                  ref.read(sessionsSelectionProvider.notifier).enterSelectionMode();
                },
                tooltip: 'Select',
              ),
              IconButton(
                icon: const Icon(Icons.archive),
                onPressed: () {
                  HapticService.light();
                  context.go('/sessions/archived');
                },
                tooltip: 'Archived',
              ),
            ] else
              // Select all button
              allSessions.whenOrNull(
                data: (sessions) {
                  final visibleSessions = sessions.where((s) => !s.isArchived).toList();
                  return IconButton(
                    icon: Icon(
                      selectionState.selectedCount == visibleSessions.length
                          ? Icons.deselect
                          : Icons.select_all,
                    ),
                    onPressed: () {
                      HapticService.light();
                      if (selectionState.selectedCount == visibleSessions.length) {
                        ref.read(sessionsSelectionProvider.notifier).clearSelection();
                      } else {
                        ref.read(sessionsSelectionProvider.notifier).selectAll(
                              visibleSessions.map((s) => s.id).toList(),
                            );
                      }
                    },
                    tooltip: selectionState.selectedCount == visibleSessions.length
                        ? 'Deselect All'
                        : 'Select All',
                  );
                },
              ) ?? const SizedBox.shrink(),
          ],
        ),
        body: Column(
          children: [
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(allSessionsProvider);
                },
                child: allSessions.when(
                  loading: () => Padding(
                    padding: const EdgeInsets.all(16),
                    child: ShimmerList.sessions(itemCount: 4),
                  ),
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

                    // Get grouped sessions
                    final grouped = ref.watch(groupedSessionsProvider);
                    final sprintIds = ref.watch(sprintIdsWithSessionsProvider);
                    final standaloneSessions = ref.watch(standaloneSessionsProvider);

                    // Group standalone sessions by state
                    final activeStandalone =
                        standaloneSessions.where((s) => s.isActive).toList();
                    final inactiveStandalone =
                        standaloneSessions.where((s) => s.isStale && !s.isComplete).toList();
                    final completedStandalone =
                        standaloneSessions.where((s) => s.isComplete).toList();

                    int animationIndex = 0;
                    return ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        // Sprint sections first
                        ...sprintIds.expand((sprintId) {
                          final waveSessions = grouped[sprintId] ?? [];
                          if (waveSessions.isEmpty) return <Widget>[];

                          // Get the first session to extract project name
                          final projectName = waveSessions.first.projectName ?? 'Sprint';

                          // Separate active and completed waves
                          final activeWaves = waveSessions.where((s) => !s.isComplete).toList();
                          final completedWaves = waveSessions.where((s) => s.isComplete).toList();

                          return [
                            AnimatedListItem(
                              index: animationIndex++,
                              child: _buildSprintHeader(context, projectName, waveSessions.length, sprintId),
                            ),
                            const SizedBox(height: 12),
                            // Active waves - expanded
                            ...activeWaves.map((s) => AnimatedListItem(
                                  index: animationIndex++,
                                  child: _buildSessionCard(context, ref, s, selectionState),
                                )),
                            // Completed waves - collapsed (smaller cards)
                            if (completedWaves.isNotEmpty)
                              AnimatedListItem(
                                index: animationIndex++,
                                child: _buildCompletedWavesSection(
                                  context, ref, completedWaves, selectionState,
                                ),
                              ),
                            const SizedBox(height: 16),
                          ];
                        }),

                        // Standalone sessions by state
                        if (activeStandalone.isNotEmpty) ...[
                          AnimatedListItem(
                            index: animationIndex++,
                            child: _buildSectionHeader(context, 'Active', Icons.play_circle),
                          ),
                          const SizedBox(height: 12),
                          ...activeStandalone.map((s) => AnimatedListItem(
                                index: animationIndex++,
                                child: _buildSessionCard(context, ref, s, selectionState),
                              )),
                          const SizedBox(height: 16),
                        ],
                        if (inactiveStandalone.isNotEmpty) ...[
                          AnimatedListItem(
                            index: animationIndex++,
                            child: _buildSectionHeader(context, 'Inactive', Icons.access_time),
                          ),
                          const SizedBox(height: 12),
                          ...inactiveStandalone.map((s) => AnimatedListItem(
                                index: animationIndex++,
                                child: _buildSessionCard(context, ref, s, selectionState),
                              )),
                          const SizedBox(height: 16),
                        ],
                        if (completedStandalone.isNotEmpty) ...[
                          AnimatedListItem(
                            index: animationIndex++,
                            child: _buildSectionHeader(context, 'Completed', Icons.check_circle),
                          ),
                          const SizedBox(height: 12),
                          ...completedStandalone.map((s) => AnimatedListItem(
                                index: animationIndex++,
                                child: _buildSessionCard(context, ref, s, selectionState),
                              )),
                        ],
                      ],
                    );
                  },
                ),
              ),
            ),
            // Selection action bar
            if (selectionState.isSelecting && selectionState.hasSelection)
              SelectionActionBar(
                selectedCount: selectionState.selectedCount,
                onCancel: () {
                  ref.read(sessionsSelectionProvider.notifier).exitSelectionMode();
                },
                actions: [
                  SelectionAction(
                    label: 'Archive',
                    icon: Icons.archive,
                    onPressed: () => _archiveSelected(
                      context,
                      ref,
                      selectionState.selectedIds,
                    ),
                  ),
                  SelectionAction(
                    label: 'Delete',
                    icon: Icons.delete,
                    isDestructive: true,
                    onPressed: () => _deleteSelected(
                      context,
                      ref,
                      selectionState.selectedIds,
                    ),
                  ),
                ],
              ),
          ],
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

  Widget _buildSprintHeader(
    BuildContext context,
    String projectName,
    int waveCount,
    String sprintId,
  ) {
    return InkWell(
      onTap: () {
        HapticService.light();
        context.push('/sprints/$sprintId');
      },
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            Icon(Icons.rocket_launch, size: 20, color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                projectName,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                '$waveCount waves',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onPrimaryContainer,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            const SizedBox(width: 4),
            Icon(
              Icons.chevron_right,
              size: 20,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSessionCard(
    BuildContext context,
    WidgetRef ref,
    SessionModel session,
    SelectionState selectionState,
  ) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SelectableCard(
        isSelecting: selectionState.isSelecting,
        isSelected: selectionState.isSelected(session.id),
        onTap: () {
          HapticService.light();
          context.push('/sessions/${session.id}');
        },
        onLongPress: () {
          if (!selectionState.isSelecting) {
            ref.read(sessionsSelectionProvider.notifier).enterSelectionMode();
          }
          ref.read(sessionsSelectionProvider.notifier).toggleSelection(session.id);
        },
        onToggleSelection: () {
          ref.read(sessionsSelectionProvider.notifier).toggleSelection(session.id);
        },
        child: SessionCard(
          session: session,
          onTap: null,
          onArchive: selectionState.isSelecting
              ? null
              : () => _archiveSession(context, ref, session.id),
        ),
      ),
    );
  }

  Widget _buildCompletedWavesSection(
    BuildContext context,
    WidgetRef ref,
    List<SessionModel> completedWaves,
    SelectionState selectionState,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text(
            'Completed (${completedWaves.length})',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
        ),
        // Show collapsed cards for completed waves
        ...completedWaves.map((s) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _buildCollapsedWaveCard(context, ref, s, selectionState),
            )),
      ],
    );
  }

  Widget _buildCollapsedWaveCard(
    BuildContext context,
    WidgetRef ref,
    SessionModel session,
    SelectionState selectionState,
  ) {
    return SelectableCard(
      isSelecting: selectionState.isSelecting,
      isSelected: selectionState.isSelected(session.id),
      onTap: () {
        HapticService.light();
        context.push('/sessions/${session.id}');
      },
      onLongPress: () {
        if (!selectionState.isSelecting) {
          ref.read(sessionsSelectionProvider.notifier).enterSelectionMode();
        }
        ref.read(sessionsSelectionProvider.notifier).toggleSelection(session.id);
      },
      onToggleSelection: () {
        ref.read(sessionsSelectionProvider.notifier).toggleSelection(session.id);
      },
      child: Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              Icon(
                Icons.check_circle,
                size: 16,
                color: Colors.grey,
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'Wave ${session.formattedWaveNumber}',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  session.status.isNotEmpty ? session.status : 'Complete',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Icon(
                Icons.chevron_right,
                size: 16,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
