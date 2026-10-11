import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState, Screen, TitleBar } from '@/components/ui';
import { useUzzapStore } from '@/store';
import { useTheme } from '@/theme';
import type { Conversation } from '@/types/models';

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** Recent conversations — the "Chat" tab landing screen. */
export default function ChatListScreen(): React.ReactElement {
  const { theme } = useTheme();
  const conversations = useUzzapStore((state) => state.conversations);
  const messagesByConversation = useUzzapStore((state) => state.messagesByConversation);
  const buddies = useUzzapStore((state) => state.buddies);

  const items = useMemo<Conversation[]>(
    () => Object.values(conversations).sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  );

  return (
    <Screen edges={['top']}>
      <TitleBar title="CHAT" subtitle={`${items.length} conversations`} />
      {items.length === 0 ? (
        <EmptyState
          title="No conversations"
          message="Open a buddy from Contacts to start chatting."
          actionLabel="GO TO CONTACTS"
          onAction={() => router.push('/contacts')}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const buddy = buddies[item.buddyId];
            const name = buddy?.displayName ?? item.buddyId;
            const history = messagesByConversation[item.id];
            const last = history && history.length > 0 ? history[history.length - 1] : undefined;
            const preview = last?.content ?? item.draftText ?? 'No messages yet';
            return (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/chat/[id]', params: { id: item.buddyId } })
                }
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderBottomColor: theme.colors.border.divider,
                    backgroundColor: pressed ? theme.colors.surface.alt : theme.colors.surface.base,
                  },
                ]}
              >
                <View
                  style={[
                    styles.avatar,
                    {
                      backgroundColor: theme.colors.chrome.bg,
                      borderColor: theme.colors.border.divider,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: theme.colors.brand.primary,
                      fontSize: theme.typography.size.bodyLg,
                      fontWeight: '700',
                    }}
                  >
                    {(name.charAt(0) || '?').toUpperCase()}
                  </Text>
                </View>

                <View style={styles.rowText}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: theme.colors.text.primary,
                      fontSize: theme.typography.size.md,
                      fontWeight: item.unreadCount > 0 ? '700' : '500',
                    }}
                  >
                    {name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: theme.colors.text.secondary,
                      fontSize: theme.typography.size.bodySm,
                    }}
                  >
                    {preview}
                  </Text>
                </View>

                <View style={styles.trailing}>
                  <Text
                    style={{
                      color: theme.colors.text.secondary,
                      fontSize: theme.typography.size.xs,
                    }}
                  >
                    {formatTime(item.updatedAt)}
                  </Text>
                  {item.unreadCount > 0 ? (
                    <View
                      style={[styles.badge, { backgroundColor: theme.colors.semantic.unreadBadge }]}
                    >
                      <Text
                        style={{
                          color: theme.colors.text.inverse,
                          fontSize: theme.typography.size.xxs,
                          fontWeight: '700',
                        }}
                      >
                        {item.unreadCount > 99 ? '99+' : String(item.unreadCount)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 4,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
