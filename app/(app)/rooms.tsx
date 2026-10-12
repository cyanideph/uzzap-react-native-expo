import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton, EmptyState, Screen, SectionHeader, TitleBar } from '@/components/ui';
import { useUzzapStore } from '@/store';
import { useTheme } from '@/theme';
import type { ChatRoom } from '@/types/models';
import type { ChatRoomType } from '@/types/protocol';
import { chatRoomService, syncChatRooms } from '@/services/chatRoomService';

const ROOM_TYPE_OPTIONS: readonly { value: ChatRoomType; label: string }[] = [
  { value: 'generated', label: 'Public (Generated)' },
  { value: 'private', label: 'Private (Password)' },
  { value: 'system', label: 'System' },
];

export default function RoomsScreen(): React.ReactElement {
  const { theme } = useTheme();
  const chatRooms = useUzzapStore((state) => state.chatRooms);
  const syncing = useUzzapStore((state) => state.syncingChatRooms);
  const syncRooms = syncChatRooms;

  const [showCreate, setShowCreate] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState<ChatRoomType>('generated');
  const [newRoomPassword, setNewRoomPassword] = useState('');
  const [newRoomMaxUsers, setNewRoomMaxUsers] = useState('20');
  const [newRoomNick, setNewRoomNick] = useState('');

  const rooms = useMemo<ChatRoom[]>(() => Object.values(chatRooms), [chatRooms]);
  const joinedRooms = rooms.filter((r) => r.isJoined);
  const availableRooms = rooms.filter((r) => !r.isJoined);

  const handleCreateRoom = async (): Promise<void> => {
    if (!newRoomName.trim()) return;
    const nick = newRoomNick.trim() || useUzzapStore.getState().user?.id || 'me';
    try {
      await chatRoomService.createRoom({
        name: newRoomName.trim(),
        type: newRoomType,
        password: newRoomType === 'private' ? newRoomPassword : undefined,
        maxUsers: parseInt(newRoomMaxUsers, 10) || 20,
        nick,
      });
      setShowCreate(false);
      setNewRoomName('');
      setNewRoomPassword('');
      setNewRoomMaxUsers('20');
      setNewRoomNick('');
    } catch {
      Alert.alert('Error', 'Failed to create room');
    }
  };

  const handleJoinRoom = async (room: ChatRoom): Promise<void> => {
    const nick = useUzzapStore.getState().user?.id || 'me';
    const password = room.passwordProtected ? await promptPassword(room.name) : undefined;
    if (room.passwordProtected && !password) return;
    try {
      await chatRoomService.joinRoom(room.id, nick, password);
      router.push({ pathname: '/room/[id]', params: { id: room.id } });
    } catch {
      Alert.alert('Error', 'Failed to join room');
    }
  };

  const handleSync = async (): Promise<void> => {
    await syncRooms();
  };

  return (
    <Screen edges={['top']}>
      <TitleBar
        title="ROOMS"
        subtitle={`${joinedRooms.length} joined, ${availableRooms.length} available`}
        right={
          showCreate ? (
            <AppButton label="CANCEL" variant="ghost" onPress={() => setShowCreate(false)} />
          ) : (
            <>
              <AppButton label="SYNC" variant="ghost" onPress={handleSync} disabled={syncing} />
              <AppButton label="CREATE" onPress={() => setShowCreate(true)} />
            </>
          )
        }
      />
      {showCreate ? (
        <View style={styles.createForm}>
          <SectionHeader title="CREATE ROOM" />
          <TextInput
            value={newRoomName}
            onChangeText={setNewRoomName}
            placeholder="Room name"
            style={styles.input}
            autoFocus
          />
          <TextInput
            value={newRoomNick}
            onChangeText={setNewRoomNick}
            placeholder="Your nickname"
            style={styles.input}
          />
          {ROOM_TYPE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => setNewRoomType(opt.value)}
              style={[styles.typeOption, newRoomType === opt.value && styles.typeOptionSelected]}
            >
              <Text
                style={[
                  styles.typeOptionText,
                  newRoomType === opt.value && styles.typeOptionTextSelected,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
          {newRoomType === 'private' && (
            <TextInput
              value={newRoomPassword}
              onChangeText={setNewRoomPassword}
              placeholder="Password (optional)"
              secureTextEntry
              style={styles.input}
            />
          )}
          <TextInput
            value={newRoomMaxUsers}
            onChangeText={setNewRoomMaxUsers}
            placeholder="Max users"
            keyboardType="numeric"
            style={styles.input}
          />
          <AppButton
            label="CREATE ROOM"
            onPress={handleCreateRoom}
            disabled={!newRoomName.trim()}
          />
        </View>
      ) : (
        <>
          {joinedRooms.length > 0 && (
            <>
              <SectionHeader title={`JOINED (${joinedRooms.length})`} />
              <FlatList
                data={joinedRooms}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => router.push({ pathname: '/room/[id]', params: { id: item.id } })}
                    style={({ pressed }) => [
                      styles.roomRow,
                      {
                        backgroundColor: pressed
                          ? theme.colors.surface.alt
                          : theme.colors.surface.base,
                      },
                    ]}
                  >
                    <View style={styles.roomInfo}>
                      <Text style={styles.roomName}>{item.name}</Text>
                      <Text style={styles.roomMeta}>
                        {item.type} • {item.myNick ? `as ${item.myNick}` : ''} •{' '}
                        {item.unreadCount > 0 ? `${item.unreadCount} unread` : ''}
                      </Text>
                    </View>
                    <Text style={styles.roomType}>{item.type}</Text>
                  </Pressable>
                )}
              />
            </>
          )}
          {availableRooms.length > 0 && (
            <>
              <SectionHeader title={`AVAILABLE (${availableRooms.length})`} />
              <FlatList
                data={availableRooms}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => handleJoinRoom(item)}
                    style={({ pressed }) => [
                      styles.roomRow,
                      {
                        backgroundColor: pressed
                          ? theme.colors.surface.alt
                          : theme.colors.surface.base,
                      },
                    ]}
                  >
                    <View style={styles.roomInfo}>
                      <Text style={styles.roomName}>{item.name}</Text>
                      <Text style={styles.roomMeta}>
                        {item.type} • {item.maxUsers} max • {item.passwordProtected ? '🔒' : 'Open'}
                      </Text>
                    </View>
                    <Text style={styles.roomType}>{item.type}</Text>
                  </Pressable>
                )}
              />
            </>
          )}
          {rooms.length === 0 && (
            <EmptyState
              title="No rooms yet"
              message="Create a room or sync to discover public rooms."
              actionLabel={showCreate ? undefined : 'SYNC ROOMS'}
              onAction={handleSync}
            />
          )}
        </>
      )}
    </Screen>
  );
}

function promptPassword(roomName: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    Alert.prompt(
      `Join ${roomName}`,
      'Enter room password',
      [
        { text: 'Cancel', onPress: () => resolve(undefined), style: 'cancel' },
        { text: 'Join', onPress: (password) => resolve(password) },
      ],
    );
  });
}

const styles = StyleSheet.create({
  createForm: {
    padding: 16,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    backgroundColor: '#1a1a1a',
  },
  typeOption: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
  },
  typeOptionSelected: {
    borderColor: '#FF7A1A',
    backgroundColor: '#2a1a10',
  },
  typeOptionText: {
    color: '#ccc',
  },
  typeOptionTextSelected: {
    color: '#FF7A1A',
    fontWeight: '700',
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  roomInfo: {
    flex: 1,
    gap: 4,
  },
  roomName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  roomMeta: {
    color: '#888',
    fontSize: 12,
  },
  roomType: {
    color: '#FF7A1A',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
