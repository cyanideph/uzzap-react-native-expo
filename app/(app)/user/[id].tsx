import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton, Screen, SectionHeader, TitleBar } from '@/components/ui';
import { blockContact, deleteContact } from '@/services/contactService';
import { useUzzapStore } from '@/store';
import { useTheme } from '@/theme';

export default function UserDetailsScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' && params.id.length > 0 ? params.id : undefined;
  const { theme } = useTheme();
  const buddy = useUzzapStore((state) => (id ? state.buddies[id] : undefined));
  const presence = useUzzapStore((state) => (id ? state.presence[id] : undefined));

  if (!id) {
    return <Redirect href="/contacts" />;
  }

  const name = buddy?.displayName ?? id;
  const status = presence?.status ?? buddy?.status ?? 'offline';

  const handleBlock = (): void => {
    const willBlock = !(buddy?.isBlocked ?? false);
    Alert.alert(
      willBlock ? 'Block User' : 'Unblock User',
      willBlock
        ? `Block ${name}? You won't receive messages from them.`
        : `Unblock ${name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: willBlock ? 'Block' : 'Unblock',
          style: willBlock ? 'destructive' : 'default',
          onPress: () => {
            void blockContact(id, willBlock).catch(() => {
              Alert.alert('Error', 'Failed to update block status');
            });
          },
        },
      ],
    );
  };

  const handleRemove = (): void => {
    Alert.alert('Remove Buddy', `Remove ${name} from your buddy list?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void deleteContact(id)
            .then(() => router.replace('/contacts'))
            .catch(() => Alert.alert('Error', 'Failed to remove buddy'));
        },
      },
    ]);
  };

  return (
    <Screen edges={['top']}>
      <TitleBar title="DETAILS" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: theme.colors.chrome.bg }]}>
            <Text style={{ color: theme.colors.brand.primary, fontSize: 32, fontWeight: '700' }}>
              {(name.charAt(0) || '?').toUpperCase()}
            </Text>
          </View>
          <Text style={{ color: theme.colors.text.primary, fontSize: 20, fontWeight: '700' }}>
            {name}
          </Text>
          <Text style={{ color: theme.colors.text.secondary, fontSize: 13 }}>
            @{id} • {status}
            {buddy?.isBlocked ? ' • blocked' : ''}
          </Text>
          {buddy?.statusMessage ? (
            <Text style={{ color: theme.colors.text.secondary, fontSize: 13, fontStyle: 'italic' }}>
              “{buddy.statusMessage}”
            </Text>
          ) : null}
        </View>

        <SectionHeader title="INFO" />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>User ID</Text>
          <Text style={styles.infoValue}>{id}</Text>
        </View>
        {buddy?.phoneNumber ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone</Text>
            <Text style={styles.infoValue}>{buddy.phoneNumber}</Text>
          </View>
        ) : null}
        {buddy && buddy.groups.length > 0 ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Groups</Text>
            <Text style={styles.infoValue}>{buddy.groups.join(', ')}</Text>
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Account</Text>
          <Text style={styles.infoValue}>{buddy?.isUzzapUser === false ? 'SMS contact' : 'Uzzap user'}</Text>
        </View>

        <SectionHeader title="ACTIONS" />
        <View style={styles.actions}>
          <AppButton
            label="OPEN CHAT"
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id } })}
          />
          <AppButton
            label={buddy?.isBlocked ? 'UNBLOCK' : 'BLOCK'}
            variant={buddy?.isBlocked ? 'secondary' : 'danger'}
            onPress={handleBlock}
          />
          <Pressable onPress={handleRemove} style={styles.removeLink}>
            <Text style={styles.removeText}>Remove buddy</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  infoLabel: {
    color: '#888',
    fontSize: 14,
  },
  infoValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    maxWidth: '60%',
    textAlign: 'right',
  },
  actions: {
    padding: 16,
    gap: 12,
  },
  removeLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  removeText: {
    color: '#E5484D',
    fontSize: 14,
  },
});
