import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/message_model.dart';
import 'auth_provider.dart';

/// Stream provider for user's relay messages collection
///
/// Watches pending messages and orders by priority then creation time.
/// High priority messages appear first in the stream.
final messagesProvider = StreamProvider<List<MessageModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return Stream.value([]);
  }

  return FirebaseFirestore.instance
      .collection('users')
      .doc(user.uid)
      .collection('relay')
      .where('status', isEqualTo: 'pending')
      .orderBy('priority', descending: true)
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map((snapshot) {
    return snapshot.docs
        .map((doc) => MessageModel.fromFirestore(doc))
        .toList();
  });
});

/// Count of unread high-priority messages
final highPriorityMessageCountProvider = Provider<int>((ref) {
  final messages = ref.watch(messagesProvider);
  return messages.when(
    data: (messageList) =>
        messageList.where((msg) => msg.priority == 'high').length,
    loading: () => 0,
    error: (_, __) => 0,
  );
});
