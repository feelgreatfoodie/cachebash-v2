import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/message_model.dart';
import '../../providers/auth_provider.dart';
import '../../providers/messages_provider.dart';
import '../../providers/questions_provider.dart';
import '../../services/haptic_service.dart';
import '../../widgets/reply_sheet.dart';

class QuestionDetailScreen extends ConsumerStatefulWidget {
  final String questionId;

  const QuestionDetailScreen({super.key, required this.questionId});

  @override
  ConsumerState<QuestionDetailScreen> createState() =>
      _QuestionDetailScreenState();
}

class _QuestionDetailScreenState extends ConsumerState<QuestionDetailScreen> {
  final _responseController = TextEditingController();
  final _contextController = TextEditingController();
  String? _selectedOption;
  bool _isSubmitting = false;

  @override
  void dispose() {
    _responseController.dispose();
    _contextController.dispose();
    super.dispose();
  }

  Future<void> _submitResponse() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;

    String finalResponse = _selectedOption ?? _responseController.text.trim();
    if (finalResponse.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a response')),
      );
      return;
    }

    // Append additional context if provided
    final contextText = _contextController.text.trim();
    if (contextText.isNotEmpty) {
      finalResponse += '\n\n[Additional Context]\n$contextText';
    }

    setState(() => _isSubmitting = true);

    try {
      await ref.read(questionsServiceProvider).answerQuestion(
            userId: user.uid,
            questionId: widget.questionId,
            response: finalResponse,
          );

      if (mounted) {
        HapticService.success();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Response sent!')),
        );
        if (context.canPop()) {
          context.pop();
        } else {
          context.go('/messages');
        }
      }
    } catch (e) {
      if (mounted) {
        HapticService.error();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  Future<void> _acknowledgeAlert() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;

    setState(() => _isSubmitting = true);

    try {
      await ref.read(messagesServiceProvider).acknowledgeAlert(
            userId: user.uid,
            messageId: widget.questionId,
          );

      if (mounted) {
        HapticService.success();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Alert acknowledged')),
        );
        if (context.canPop()) {
          context.pop();
        } else {
          context.go('/messages');
        }
      }
    } catch (e) {
      if (mounted) {
        HapticService.error();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  void _dismissKeyboard() {
    FocusScope.of(context).unfocus();
  }

  @override
  Widget build(BuildContext context) {
    // Try unified messages collection first, fall back to legacy questions
    final messageAsync = ref.watch(messageProvider(widget.questionId));

    return GestureDetector(
      onTap: _dismissKeyboard,
      child: Scaffold(
        appBar: AppBar(
          title: messageAsync.when(
            loading: () => const Text('Loading...'),
            error: (_, __) => const Text('Message'),
            data: (message) {
              if (message == null) return const Text('Message');
              if (message.isAlert) return const Text('Alert');
              return const Text('Question');
            },
          ),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.pop(),
          ),
        ),
        body: messageAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stack) => Center(child: Text('Error: $error')),
          data: (message) {
            if (message == null) {
              // Fall back to legacy question provider
              return _buildLegacyQuestionView();
            }
            return _buildMessageView(message);
          },
        ),
      ),
    );
  }

  Widget _buildLegacyQuestionView() {
    final questionAsync = ref.watch(questionProvider(widget.questionId));

    return questionAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, stack) => Center(child: Text('Error: $error')),
      data: (question) {
        if (question == null) {
          return const Center(child: Text('Message not found'));
        }

        return SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Priority badge
              if (question.isHighPriority) _buildPriorityBadge(),
              const SizedBox(height: 16),

              // Question text
              Text(
                question.question,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 16),

              // Context if available
              if (question.context != null) ...[
                _buildContextCard(question.context!),
                const SizedBox(height: 24),
              ],

              // Already answered
              if (question.isAnswered)
                _buildAnsweredCard(question.response ?? '')
              else if (question.isExpired)
                _buildExpiredCard()
              else
                _buildResponseInput(question.options),

              // Timestamp
              const SizedBox(height: 24),
              Text(
                'Asked ${_formatTime(question.createdAt)}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildMessageView(MessageModel message) {
    // Handle alert messages
    if (message.isAlert) {
      return _buildAlertView(message);
    }

    // Handle question messages
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Priority badge
          if (message.isHighPriority) _buildPriorityBadge(),
          const SizedBox(height: 16),

          // Message content
          Text(
            message.content,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 16),

          // Context if available
          if (message.context != null && message.context!.isNotEmpty) ...[
            _buildContextCard(message.context!),
            const SizedBox(height: 24),
          ],

          // Already answered
          if (message.isAnswered)
            _buildAnsweredCard(message.response ?? '')
          else if (message.isExpired)
            _buildExpiredCard()
          else
            _buildResponseInput(message.options),

          // Reply button (always show for answered questions to start a thread)
          if (message.isAnswered) ...[
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: () {
                HapticService.light();
                ReplySheet.show(context, message);
              },
              icon: const Icon(Icons.reply),
              label: const Text('Reply to Thread'),
            ),
          ],

          // Timestamp
          const SizedBox(height: 24),
          Text(
            'Asked ${_formatTime(message.createdAt)}',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildAlertView(MessageModel message) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Alert type badge
          _buildAlertTypeBadge(message.alertType),
          const SizedBox(height: 16),

          // Alert content
          Text(
            message.content,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 16),

          // Context if available
          if (message.context != null && message.context!.isNotEmpty) ...[
            _buildContextCard(message.context!),
            const SizedBox(height: 24),
          ],

          // Status card based on alert state
          if (message.isAcknowledged)
            _buildAcknowledgedCard()
          else
            _buildAcknowledgeButton(),

          // Timestamp
          const SizedBox(height: 24),
          Text(
            'Sent ${_formatTime(message.createdAt)}',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildAlertTypeBadge(AlertType? alertType) {
    Color color;
    IconData icon;
    String label;

    switch (alertType) {
      case AlertType.error:
        color = Theme.of(context).colorScheme.error;
        icon = Icons.error;
        label = 'Error';
        break;
      case AlertType.warning:
        color = Colors.orange;
        icon = Icons.warning;
        label = 'Warning';
        break;
      case AlertType.success:
        color = Colors.green;
        icon = Icons.check_circle;
        label = 'Success';
        break;
      case AlertType.info:
      default:
        color = Colors.blue;
        icon = Icons.info;
        label = 'Info';
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withAlpha(30),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withAlpha(80)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAcknowledgedCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(
            Icons.check,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
          const SizedBox(width: 8),
          Text(
            'Alert acknowledged',
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAcknowledgeButton() {
    return FilledButton.icon(
      onPressed: _isSubmitting ? null : _acknowledgeAlert,
      icon: _isSubmitting
          ? const SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Icon(Icons.check),
      label: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Text(_isSubmitting ? 'Acknowledging...' : 'Acknowledge'),
      ),
    );
  }

  Widget _buildPriorityBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.priority_high,
            size: 16,
            color: Theme.of(context).colorScheme.onErrorContainer,
          ),
          const SizedBox(width: 4),
          Text(
            'High Priority',
            style: TextStyle(
              color: Theme.of(context).colorScheme.onErrorContainer,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContextCard(String context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(this.context).colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Context',
            style: Theme.of(this.context).textTheme.labelMedium?.copyWith(
                  color: Theme.of(this.context).colorScheme.onSurfaceVariant,
                ),
          ),
          const SizedBox(height: 4),
          Text(context),
        ],
      ),
    );
  }

  Widget _buildAnsweredCard(String response) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primaryContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.check_circle,
                color: Theme.of(context).colorScheme.onPrimaryContainer,
              ),
              const SizedBox(width: 8),
              Text(
                'Answered',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onPrimaryContainer,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            response,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onPrimaryContainer,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildExpiredCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(
            Icons.timer_off,
            color: Theme.of(context).colorScheme.onErrorContainer,
          ),
          const SizedBox(width: 8),
          Text(
            'This question has expired',
            style: TextStyle(
              color: Theme.of(context).colorScheme.onErrorContainer,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildResponseInput(List<String>? options) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (options != null && options.isNotEmpty) ...[
          // Multiple choice options
          Text(
            'Select an option:',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          ...options.map((option) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: ChoiceChip(
                  label: Text(option),
                  selected: _selectedOption == option,
                  onSelected: (selected) {
                    HapticService.selection();
                    setState(() {
                      _selectedOption = selected ? option : null;
                    });
                  },
                ),
              )),
          const SizedBox(height: 16),
          const Divider(),
          const SizedBox(height: 16),
          Text(
            'Or type a custom response:',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
        ] else ...[
          Text(
            'Your response:',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
        ],

        // Text input
        TextField(
          controller: _responseController,
          maxLines: 4,
          decoration: const InputDecoration(
            hintText: 'Type your response here...',
            border: OutlineInputBorder(),
          ),
          onChanged: (_) {
            if (_selectedOption != null) {
              setState(() => _selectedOption = null);
            }
          },
        ),
        const SizedBox(height: 16),

        // Additional context field
        TextField(
          controller: _contextController,
          maxLines: 3,
          maxLength: 500,
          decoration: const InputDecoration(
            labelText: 'Additional Context (optional)',
            hintText: 'Add any clarifying details or questions...',
            border: OutlineInputBorder(),
            helperText: 'Provide extra context to help Claude understand your response',
          ),
        ),
        const SizedBox(height: 24),

        // Submit button
        FilledButton(
          onPressed: _isSubmitting
              ? null
              : () {
                  HapticService.medium();
                  _submitResponse();
                },
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: _isSubmitting
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Send Response'),
          ),
        ),
      ],
    );
  }

  String _formatTime(DateTime time) {
    final now = DateTime.now();
    final diff = now.difference(time);

    if (diff.inMinutes < 1) {
      return 'just now';
    } else if (diff.inMinutes < 60) {
      return '${diff.inMinutes} minutes ago';
    } else if (diff.inHours < 24) {
      return '${diff.inHours} hours ago';
    } else {
      return '${diff.inDays} days ago';
    }
  }
}
