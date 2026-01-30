import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../services/haptic_service.dart';

/// Shell wrapper that provides persistent bottom nav for all authenticated routes
class MainShellWrapper extends StatelessWidget {
  final Widget child;

  const MainShellWrapper({
    super.key,
    required this.child,
  });

  int _getSelectedIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    if (location.startsWith('/questions')) return 1;
    if (location.startsWith('/sessions')) return 2;
    return 0; // Home and everything else
  }

  @override
  Widget build(BuildContext context) {
    final selectedIndex = _getSelectedIndex(context);

    return Column(
      children: [
        Expanded(child: child),
        Container(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            border: Border(
              top: BorderSide(
                color: Theme.of(context).colorScheme.outlineVariant,
                width: 0.5,
              ),
            ),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _NavItem(
                    icon: Icons.home_outlined,
                    selectedIcon: Icons.home,
                    isSelected: selectedIndex == 0,
                    onTap: () {
                      HapticService.light();
                      context.go('/home');
                    },
                  ),
                  _NavItem(
                    icon: Icons.inbox_outlined,
                    selectedIcon: Icons.inbox,
                    isSelected: selectedIndex == 1,
                    onTap: () {
                      HapticService.light();
                      context.go('/questions');
                    },
                  ),
                  _ComposeButton(
                    onTap: () {
                      HapticService.medium();
                      context.go('/tasks/new');
                    },
                  ),
                  _NavItem(
                    icon: Icons.terminal_outlined,
                    selectedIcon: Icons.terminal,
                    isSelected: selectedIndex == 2,
                    onTap: () {
                      HapticService.light();
                      context.go('/sessions');
                    },
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final IconData selectedIcon;
  final bool isSelected;
  final VoidCallback onTap;

  const _NavItem({
    required this.icon,
    required this.selectedIcon,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 48,
        height: 48,
        child: Icon(
          isSelected ? selectedIcon : icon,
          size: 26,
          color: isSelected
              ? Theme.of(context).colorScheme.primary
              : Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}

class _ComposeButton extends StatelessWidget {
  final VoidCallback onTap;

  const _ComposeButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 52,
        height: 52,
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.primary,
          shape: BoxShape.circle,
        ),
        child: Icon(
          Icons.add,
          size: 28,
          color: Theme.of(context).colorScheme.onPrimary,
        ),
      ),
    );
  }
}

// Keep old class for backwards compatibility during transition
class MainShell extends StatelessWidget {
  final StatefulNavigationShell navigationShell;

  const MainShell({
    super.key,
    required this.navigationShell,
  });

  @override
  Widget build(BuildContext context) {
    return MainShellWrapper(child: navigationShell);
  }
}
