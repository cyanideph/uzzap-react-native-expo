import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { AppButton, Screen, SectionHeader, TitleBar } from '@/components/ui';
import { deleteMessage } from '@/services/messageService';
import { useUzzapStore } from '@/store';
import { useTheme } from '@/theme';

function formatFull(timestamp: number): string {
  const date = new Date(timestamp > 10000000000 ? timestamp : timestamp * 1000);
  return `${date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(
    date.getSeconds(),
  ).padStart(2, '0')}`;
}

export default function MessageDetailScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ id: string; conversation?: string }>();
  const id = typeof params.id === 'string' && params.id.length > 0 ? params.id : undefined;
  const conversationId =
    typeof params.conversation === 'string' && params.conversation.length > 0
      ? params.conversation
      : undefined;
  const { theme } = useTheme();

  const message = useUzzapStore((state) => {
    if (!id) return undefined;
    if (conversationId) {
      return state.messagesByConversation[conversationId]?.find((m) => m.id === id);
    }
    for (const list of Object.values(state.messagesByConversation)) {
      const found = list.find((m) => m.id === id);
      if (found) return found;
    }
    return undefined;
  });
  const buddies = useUzzapStore((state) => state.buddies);

  if (!id) {
    return <Redirect href="/chat" />;
  }

  if (!message) {
    return (
      <Screen edges={['top']}>
        <TitleBar title="MESSAGE" onBack={() => router.back()} />
        <View style={styles.empty}>
          <Text style={{ color: theme.colors.text.secondary }}>Message not found.</Text>
        </View>
      </Screen>
    );
  }

  const senderName = buddies[message.senderId]?.displayName ?? message.senderId;
  const reply = message.meta?.replyTo as
    | { id: string; senderId: string; content: string }
    | undefined;

  const handleCopy = (): void => {
    void Clipboard.setStringAsync(message.content).then(() => {
      Alert.alert('Copied', 'Message copied to clipboard');
    });
  };

  const handleDelete = (): void => {
    Alert.alert('Delete Message', 'Are you sure you want to delete this message?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteMessage(message.conversationId, message.id)
            .then(() => router.back())
            .catch(() => Alert.alert('Error', 'Failed to delete message'));
        },
      },
    ]);
  };

  return (
    <Screen edges={['top']}>
      <TitleBar title="MESSAGE" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeader title="CONTENT" />
        <View style={styles.body}>
          <Text style={{ color: theme.colors.text.primary, fontSize: 16 }}>{message.content}</Text>
        </View>

        <SectionHeader title="DETAILS" />
        <Row label="From" value={senderName} />
        <Row label="To" value={buddies[message.recipientId]?.displayName ?? message.recipientId} />
        <Row label="Sent" value={formatFull(message.timestamp)} />
        <Row label="Type" value={`${message.type} / ${message.protocol}`} />
        <Row label="Status" value={message.status} />
        {message.amazMsgId ? <Row label="Server ID" value={message.amazMsgId} /> : null}
        {reply ? <Row label="Reply to" value={reply.content} /> : null}
        {message.meta?.forwardedFrom ? (
          <Row label="Forwarded from" value={String(message.meta.forwardedFrom)} />
        ) : null}

        <SectionHeader title="ACTIONS" />
        <View style={styles.actions}>
          <AppButton label="COPY TEXT" variant="secondary" onPress={handleCopy} />
          <AppButton label="DELETE MESSAGE" variant="danger" onPress={handleDelete} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  label: {
    color: '#888',
    fontSize: 14,
  },
  value: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    maxWidth: '65%',
    textAlign: 'right',
  },
  actions: {
    padding: 16,
    gap: 12,
  },
});
