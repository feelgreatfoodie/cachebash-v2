import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../providers/auth_provider.dart';

class ApiKeyScreen extends ConsumerStatefulWidget {
  const ApiKeyScreen({super.key});

  @override
  ConsumerState<ApiKeyScreen> createState() => _ApiKeyScreenState();
}

class _ApiKeyScreenState extends ConsumerState<ApiKeyScreen> {
  String? _apiKey;
  bool _isLoading = true;
  bool _showKey = false;
  bool _copied = false;

  @override
  void initState() {
    super.initState();
    _loadApiKey();
  }

  Future<void> _loadApiKey() async {
    final key = await ref.read(authNotifierProvider.notifier).getStoredApiKey();
    if (mounted) {
      setState(() {
        _apiKey = key;
        _isLoading = false;
      });
    }
  }

  Future<void> _regenerateKey() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Regenerate API Key?'),
        content: const Text(
          'This will invalidate your current API key. '
          'You will need to update your Claude Code MCP configuration.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Regenerate'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      setState(() => _isLoading = true);
      final user = ref.read(currentUserProvider);
      if (user != null) {
        final newKey = await ref
            .read(authNotifierProvider.notifier)
            .regenerateApiKey(user.uid);
        if (mounted && newKey != null) {
          setState(() {
            _apiKey = newKey;
            _isLoading = false;
            _showKey = true;
            _copied = false;
          });
        }
      }
    }
  }

  Future<void> _copyToClipboard() async {
    if (_apiKey == null) return;
    await Clipboard.setData(ClipboardData(text: _apiKey!));
    setState(() => _copied = true);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('API key copied to clipboard'),
        duration: Duration(seconds: 2),
      ),
    );
  }

  String _maskKey(String key) {
    if (key.length <= 8) return '********';
    return '${key.substring(0, 4)}${'*' * (key.length - 8)}${key.substring(key.length - 4)}';
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('API Key'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/home'),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Info card
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                Icons.info_outline,
                                color: Theme.of(context).colorScheme.primary,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                'About Your API Key',
                                style: Theme.of(context)
                                    .textTheme
                                    .titleMedium
                                    ?.copyWith(fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          const Text(
                            'Your API key connects Claude Code to this app. '
                            'Add it to your MCP configuration to receive notifications '
                            'and respond to questions from Claude.',
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // API Key display
                  Text(
                    'Your API Key',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Theme.of(context)
                          .colorScheme
                          .surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    ),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: SelectableText(
                                _apiKey != null
                                    ? (_showKey
                                        ? _apiKey!
                                        : _maskKey(_apiKey!))
                                    : 'No API key found',
                                style: const TextStyle(
                                  fontFamily: 'monospace',
                                  fontSize: 14,
                                ),
                              ),
                            ),
                            if (_apiKey != null) ...[
                              IconButton(
                                icon: Icon(
                                  _showKey
                                      ? Icons.visibility_off
                                      : Icons.visibility,
                                ),
                                onPressed: () {
                                  setState(() => _showKey = !_showKey);
                                },
                                tooltip: _showKey ? 'Hide' : 'Show',
                              ),
                              IconButton(
                                icon: Icon(
                                  _copied ? Icons.check : Icons.copy,
                                  color: _copied ? Colors.green : null,
                                ),
                                onPressed: _copyToClipboard,
                                tooltip: 'Copy',
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),

                  // MCP Configuration example
                  Text(
                    'MCP Configuration',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surfaceContainerLow,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: SelectableText(
                      _getMcpConfigExample(_apiKey ?? 'YOUR_API_KEY'),
                      style: TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 12,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Add this to ~/.config/claude/mcp.json',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
                  const SizedBox(height: 32),

                  // Regenerate button
                  OutlinedButton.icon(
                    onPressed: _regenerateKey,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Regenerate API Key'),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Regenerating will invalidate your current key',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 32),

                  // Continue button (for new users)
                  FilledButton(
                    onPressed: () => context.go('/home'),
                    child: const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: Text('Continue to Dashboard'),
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  String _getMcpConfigExample(String apiKey) {
    return '''{
  "mcpServers": {
    "cachebash": {
      "command": "npx",
      "args": ["cachebash-mcp"],
      "env": {
        "CACHEBASH_API_KEY": "$apiKey"
      }
    }
  }
}''';
  }
}
