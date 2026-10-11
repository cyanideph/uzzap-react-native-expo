import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Screen, TitleBar } from '@/components/ui';
import { contactService } from '@/services/contactService';
import { useUzzapStore } from '@/store';
import { useTheme } from '@/theme';

function BlockedUsersScreen(): React.ReactElement {
  const { theme } = useTheme();
  const blockedBuddies = useUzzapStore((state) =>
    Object.values(state.buddies).filter((b) => b.isBlocked)
  );
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    contactService.listContacts();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await contactService.listContacts();
    setRefreshing(false);
  };

  const handleUnblock = async (userId: string) => {
    Alert.alert('Unblock User', 'Are you sure you want to unblock this user?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        style: 'destructive',
        onPress: async () => {
          try {
            const buddy = contactService.getContact(userId);
            if (buddy) {
              await contactService.blockContact(userId, false);
              Alert.alert('Success', 'User unblocked');
            }
          } catch {
            Alert.alert('Error', 'Failed to unblock user');
          }
        },
      },
    ]);
  };

  if (blockedBuddies.length === 0) {
    return (
      <Screen edges={['top']}>
        <TitleBar title="BLOCKED USERS" />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No blocked users</Text>
          <Text style={styles.emptySubtext}>
            Users you block will appear here. You can unblock them to restore contact.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <TitleBar title="BLOCKED USERS" />
      <FlatList
        data={blockedBuddies}
        keyExtractor={(item) => item.userId}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            style={[
              styles.row,
              { borderBottomColor: theme.colors.border.divider },
            ]}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(item.displayName.charAt(0) || '?').toUpperCase()}
              </Text>
            </View>
            <View style={styles.rowText}>
              <Text style={styles.name}>{item.displayName}</Text>
              <Text style={styles.userId}>@{item.userId}</Text>
            </View>
            <Pressable
              onPress={() => handleUnblock(item.userId)}
              style={styles.unblockButton}
            >
              <Text style={styles.unblockButtonText}>Unblock</Text>
            </Pressable>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FF7A1A',
    fontSize: 18,
    fontWeight: '700',
  },
  rowText: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  userId: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  unblockButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#E5484D',
    borderRadius: 8,
  },
  unblockButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default BlockedUsersScreen;