import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState, Screen, SectionHeader, TitleBar } from '@/components/ui';
import { useUzzapStore } from '@/store';
import { useTheme } from '@/theme';
import type { Buddy } from '@/types/models';
import type { PresenceStatus } from '@/types/protocol';

/** Presence sort bucket: online/available first, offline last. */
const PRESENCE_RANK: Record<PresenceStatus, number> = {
  online: 0,
  available: 0,
  away: 1,
  busy: 2,
  invisible: 3,
  offline: 4,
};

type DotStatus = Exclude<PresenceStatus, 'available'>;

function dotStatus(status: PresenceStatus): DotStatus {
  return status === 'available' ? 'online' : status;
}

function byName(a: Buddy, b: Buddy): number {
  return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
}

interface BuddySection {
  title: string;
  data: Buddy[];
}

/** Buddy list — the primary screen. */
export default function ContactsScreen(): React.ReactElement {
  const { theme } = useTheme();
  const buddies = useUzzapStore((state) => state.buddies);
  const conversations = useUzzapStore((state) => state.conversations);
  const presence = useUzzapStore((state) => state.presence);

  const [searchQuery, setSearchQuery] = useState('');

  const sections = useMemo<BuddySection[]>(() => {
    const all = Object.values(buddies);
    const rank = (buddy: Buddy): number =>
      PRESENCE_RANK[presence[buddy.userId]?.status ?? buddy.status];

    const filtered = all.filter((buddy) => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return (
        buddy.userId.toLowerCase().includes(query) ||
        buddy.displayName.toLowerCase().includes(query) ||
        (buddy.phoneNumber ?? '').includes(query)
      );
    });

    const online = filtered.filter((buddy) => rank(buddy) <= 2).sort(byName);
    const others = filtered.filter((buddy) => rank(buddy) > 2).sort(byName);

    const result: BuddySection[] = [];
    if (online.length > 0) result.push({ title: `ONLINE (${online.length})`, data: online });
    if (others.length > 0) result.push({ title: `OTHERS (${others.length})`, data: others });
    return result;
  }, [buddies, presence, searchQuery]);

  // Conversations are keyed by conversation id; index unread counts by buddy.
  const unreadByBuddy = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const conversation of Object.values(conversations)) {
      map[conversation.buddyId] =
        (map[conversation.buddyId] ?? 0) + (conversation.unreadCount || 0);
    }
    return map;
  }, [conversations]);

  const onlineCount =
    sections.find((section) => section.title.startsWith('ONLINE'))?.data.length ?? 0;

  return (
    <Screen edges={['top']}>
      <TitleBar
        title="UZZAP"
        subtitle={`${onlineCount} online`}
        right={
          <Pressable onPress={() => router.push('/add-buddy')} accessibilityRole="button">
            <Text style={{ color: theme.colors.brand.primary, fontSize: 16, fontWeight: '700' }}>
              ADD
            </Text>
          </Pressable>
        }
      />
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search buddies..."
          placeholderTextColor={theme.colors.text.disabled}
          style={styles.searchInput}
        />
      </View>
      {Object.keys(buddies).length === 0 ? (
        <EmptyState
          title="No buddies yet"
          message="Add a buddy by User ID or invite someone from your phonebook."
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.userId}
          stickySectionHeadersEnabled
          contentContainerStyle={styles.listContent}
          renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
          renderItem={({ item }) => {
            const status = dotStatus(presence[item.userId]?.status ?? item.status);
            const unread = unreadByBuddy[item.userId] ?? 0;
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.userId } })}
                accessibilityRole="button"
                accessibilityLabel={`${item.displayName}, ${status}${unread > 0 ? `, ${unread} unread` : ''}`}
                style={({ pressed }) => [
                  styles.row,
                  {
                    minHeight: theme.layout.buddyRowHeight,
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
                    {(item.displayName.charAt(0) || '?').toUpperCase()}
                  </Text>
                </View>

                <View style={styles.rowText}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: theme.colors.text.primary,
                      fontSize: theme.typography.size.md,
                      fontWeight: unread > 0 ? '700' : '500',
                    }}
                  >
                    {item.displayName}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: theme.colors.text.secondary,
                      fontSize: theme.typography.size.bodySm,
                    }}
                  >
                    {item.statusMessage ?? status}
                  </Text>
                </View>

                {unread > 0 ? (
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
                      {unread > 99 ? '99+' : String(unread)}
                    </Text>
                  </View>
                ) : (
                  <View
                    style={[styles.presenceDot, { backgroundColor: theme.colors.presence[status] }]}
                  />
                )}
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
    paddingVertical: 6,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presenceDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  searchInput: {
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#333',
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 15,
    color: '#fff',
    backgroundColor: '#1a1a1a',
    placeholderTextColor: '#666',
  },
});
