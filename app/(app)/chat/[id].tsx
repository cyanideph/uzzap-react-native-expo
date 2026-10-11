import { Redirect, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen, TitleBar } from '@/components/ui';
import { messageService } from '@/services/messageService';
import { useUzzapStore } from '@/store';
import { useTheme } from '@/theme';
import type { Message } from '@/types/models';
import type { PresenceStatus } from '@/types/protocol';

const EMPTY_MESSAGES: Message[] = [];

const TICK: Record<Message['status'], string> = {
  pending: '◷',
  sending: '◷',
  sent: '✓',
  delivered: '✓✓',
  read: '✓✓',
  failed: '!',
};

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function ChatScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' && params.id.length > 0 ? params.id : undefined;
  const { theme } = useTheme();

  const buddies = useUzzapStore((state) => state.buddies);
  const presence = useUzzapStore((state) => state.presence);
  const user = useUzzapStore((state) => state.user);
  const storedMessages = useUzzapStore((state) =>
    id ? state.messagesByConversation[id] : undefined,
  );

  const [draft, setDraft] = useState('');

  const messages = storedMessages ?? EMPTY_MESSAGES;
  const data = useMemo(() => [...messages].reverse(), [messages]);

  // Enter/leave the conversation (read receipts + active id) exactly once per id.
  useEffect(() => {
    if (!id) return;
    const store = useUzzapStore.getState();
    if (!store.conversations[id]) {
      store.upsertConversation({
        id,
        buddyId: id,
        unreadCount: 0,
        isPinned: false,
        updatedAt: Date.now(),
      });
    }
    store.setActiveConversation(id);
    store.markConversationRead(id);
    return () => {
      useUzzapStore.getState().setActiveConversation(null);
    };
  }, [id]);

  if (!id) {
    return <Redirect href="/chat" />;
  }

  const buddy = buddies[id];
  const title = buddy?.displayName ?? id;
  const status: PresenceStatus = presence[id]?.status ?? buddy?.status ?? 'offline';
  const selfId = user?.id ?? 'me';
  const canSend = draft.trim().length > 0;

  const handleSend = (): void => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    // Echo locally (optimistic, status `sending`), persist to SQLite and hand
    // off to the transport; `messageService` flips the status to `sent` when
    // the server ACK arrives, or `failed` + offline-queues on error.
    void messageService
      .sendMessage({ recipientId: id, conversationId: id, content: text })
      .catch(() => {
        // `sendMessage` already marks the message failed and queues it offline.
      });
  };

  return (
    <Screen edges={['top']}>
      <TitleBar title={title} subtitle={status} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <FlatList
          data={data}
          inverted
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, messages.length === 0 && styles.listEmpty]}
          ListEmptyComponent={
            <Text
              style={{
                color: theme.colors.text.secondary,
                fontSize: theme.typography.size.bodySm,
                textAlign: 'center',
                transform: [{ scaleY: -1 }],
              }}
            >
              No messages yet. Say hello!
            </Text>
          }
          renderItem={({ item }) => {
            const mine = item.senderId === selfId;
            return (
              <View style={[styles.bubbleRow, mine ? styles.alignEnd : styles.alignStart]}>
                <View
                  style={[
                    styles.bubble,
                    {
                      backgroundColor: mine
                        ? theme.colors.brand.sentBubble
                        : theme.colors.semantic.bubbleIn,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: mine
                        ? theme.colors.brand.sentBubbleText
                        : theme.colors.semantic.bubbleInText,
                      fontSize: theme.typography.size.body,
                    }}
                  >
                    {item.content}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.text.secondary,
                      fontSize: theme.typography.size.xxs,
                      marginTop: 2,
                      alignSelf: mine ? 'flex-end' : 'flex-start',
                    }}
                  >
                    {formatTime(item.timestamp)}
                    {mine ? `  ${TICK[item.status]}` : ''}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        <View
          style={[
            styles.toolbar,
            {
              backgroundColor: theme.colors.chrome.bg,
              borderTopColor: theme.colors.chrome.bevelLo,
            },
          ]}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message"
            placeholderTextColor={theme.colors.text.disabled}
            multiline
            style={[
              styles.input,
              {
                color: theme.colors.text.primary,
                backgroundColor: theme.colors.surface.base,
                borderColor: theme.colors.border.input,
              },
            ]}
          />
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSend }}
            style={[
              styles.send,
              {
                backgroundColor: canSend ? theme.colors.brand.primary : theme.colors.surface.alt,
              },
            ]}
          >
            <Text
              style={{
                color: canSend ? theme.colors.brand.onPrimary : theme.colors.text.disabled,
                fontSize: theme.typography.size.sm,
                fontWeight: '700',
              }}
            >
              SEND
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: {
    padding: 12,
    gap: 8,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  alignStart: { justifyContent: 'flex-start' },
  alignEnd: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
  },
  send: {
    minHeight: 40,
    minWidth: 64,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});
