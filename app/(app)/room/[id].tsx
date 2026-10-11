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
import { chatRoomService } from '@/services/chatRoomService';
import { useUzzapStore } from '@/store';
import { useTheme } from '@/theme';
import type { ChatMessage, ChatRoomUser } from '@/types/models';

const EMPTY_MESSAGES: ChatMessage[] = [];

const TICK: Record<ChatMessage['status'], string> = {
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

export default function RoomChatScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' && params.id.length > 0 ? params.id : undefined;
  const { theme } = useTheme();

  const chatRooms = useUzzapStore((state) => state.chatRooms);
  const chatRoomUsers = useUzzapStore((state) => state.chatRoomUsers);
  const storedMessages = useUzzapStore((state) => (id ? state.chatMessagesByRoom[id] : undefined));
  const user = useUzzapStore((state) => state.user);
  const setActiveRoom = useUzzapStore((state) => state.setActiveConversation);

  const [draft, setDraft] = useState('');
  const [showUsers, setShowUsers] = useState(false);

  const messages = storedMessages ?? EMPTY_MESSAGES;
  const data = useMemo(() => [...messages].reverse(), [messages]);
  const users = useMemo<ChatRoomUser[]>(
    () => Object.values(chatRoomUsers).filter((u) => u.roomId === id ?? ''),
    [chatRoomUsers, id],
  );
  const selfId = user?.id ?? 'me';
  const myUser = users.find((u) => u.isSelf);
  const canSend = draft.trim().length > 0 && myUser?.status !== 'offline';

  useEffect(() => {
    if (!id) return;
    setActiveRoom(id);
    useUzzapStore.getState().clearChatMessages(id);
    return () => {
      useUzzapStore.getState().setActiveConversation(null);
    };
  }, [id, setActiveRoom]);

  if (!id) {
    return <Redirect href="/rooms" />;
  }

  const room = chatRooms[id];
  const title = room?.name ?? id;

  const handleSend = (): void => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void chatRoomService.sendMessage({ roomId: id, body: text }).catch(() => {});
  };

  const handleUserPress = (_user: ChatRoomUser): void => {
    // Could show user profile or whisper
  };

  return (
    <Screen edges={['top']}>
      <TitleBar
        title={title}
        subtitle={`${users.length} users`}
        right={
          <Pressable onPress={() => setShowUsers(!showUsers)} accessibilityRole="button">
            <Text style={{ color: theme.colors.brand.primary, fontSize: 16, fontWeight: '700' }}>
              {showUsers ? 'HIDE' : 'USERS'}
            </Text>
          </Pressable>
        }
      />
      {showUsers && (
        <View style={styles.usersPanel}>
          <Text style={styles.usersTitle}>USERS ({users.length})</Text>
          <FlatList
            data={users}
            keyExtractor={(item) => `${item.userId}:${item.roomId}`}
            renderItem={({ item }) => (
              <Pressable onPress={() => handleUserPress(item)} style={styles.userRow}>
                <View style={styles.userAvatar}>
                  <Text style={styles.userInitial}>
                    {(item.nick.charAt(0) || '?').toUpperCase()}
                  </Text>
                  {item.isSelf && <Text style={styles.youBadge}>YOU</Text>}
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userNick}>
                    {item.nick}
                    {item.isSelf ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.userRole}>
                    {item.role} • {item.status}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        </View>
      )}
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
                  {!mine && <Text style={styles.senderName}>{item.senderNick}</Text>}
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
  senderName: {
    color: '#FF7A1A',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
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
  usersPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 200,
    backgroundColor: '#1a1a1a',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#333',
    padding: 12,
    zIndex: 100,
  },
  usersTitle: {
    color: '#FF7A1A',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  userInitial: {
    color: '#FF7A1A',
    fontSize: 14,
    fontWeight: '700',
  },
  youBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#FF7A1A',
    color: '#000',
    fontSize: 7,
    fontWeight: '700',
    paddingHorizontal: 3,
    borderRadius: 3,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userNick: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  userRole: {
    color: '#888',
    fontSize: 10,
    textTransform: 'uppercase',
  },
});
