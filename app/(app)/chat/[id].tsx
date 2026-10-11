import { Redirect, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
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
import { messageService, sendMedia } from '@/services/messageService';
import { mediaService } from '@/services/mediaService';
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
  const [showMediaOptions, setShowMediaOptions] = useState(false);

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
    void messageService
      .sendMessage({ recipientId: id, conversationId: id, content: text })
      .catch(() => {});
  };

  const handleMediaSelect = async (
    type: 'image' | 'voice' | 'location' | 'file',
  ): Promise<void> => {
    setShowMediaOptions(false);
    try {
      let media;
      switch (type) {
        case 'image':
          media = await mediaService.pickImage();
          break;
        case 'voice':
          await mediaService.startRecording();
          media = await mediaService.stopRecording();
          break;
        case 'location':
          media = await mediaService.getCurrentLocation();
          break;
        case 'file':
          media = await mediaService.pickFile();
          break;
      }
      if (media) {
        await sendMedia({
          recipientId: id,
          type: media.type as 'image' | 'voice' | 'location' | 'file',
          uri: media.content,
          conversationId: id,
          mimeType: media.meta.mimeType as string,
          fileName: media.meta.fileName as string,
          duration: media.meta.duration as number,
          latitude: media.meta.latitude as number,
          longitude: media.meta.longitude as number,
          locationName: media.meta.locationName as string,
        });
      }
    } catch {
      Alert.alert('Error', `Failed to send ${type}`);
    }
  };

  const showMediaActionSheet = (): void => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Photo', 'Camera', 'Voice', 'Location', 'File'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          switch (buttonIndex) {
            case 1:
              handleMediaSelect('image');
              break;
            case 2:
              handleMediaSelect('image');
              break; // Camera would be separate
            case 3:
              handleMediaSelect('voice');
              break;
            case 4:
              handleMediaSelect('location');
              break;
            case 5:
              handleMediaSelect('file');
              break;
          }
        },
      );
    } else {
      setShowMediaOptions(true);
    }
  };

  const handleMediaOptionPress = (type: 'image' | 'voice' | 'location' | 'file'): void => {
    setShowMediaOptions(false);
    handleMediaSelect(type);
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

        {Platform.OS !== 'ios' && showMediaOptions && (
          <View style={styles.mediaOptionsOverlay}>
            <View style={styles.mediaOptions}>
              <Text style={styles.mediaOptionTitle}>Attach</Text>
              <Pressable onPress={() => handleMediaOptionPress('image')} style={styles.mediaOption}>
                <Text style={styles.mediaOptionIcon}>📷</Text>
                <Text style={styles.mediaOptionText}>Photo</Text>
              </Pressable>
              <Pressable onPress={() => handleMediaOptionPress('voice')} style={styles.mediaOption}>
                <Text style={styles.mediaOptionIcon}>🎤</Text>
                <Text style={styles.mediaOptionText}>Voice</Text>
              </Pressable>
              <Pressable
                onPress={() => handleMediaOptionPress('location')}
                style={styles.mediaOption}
              >
                <Text style={styles.mediaOptionIcon}>📍</Text>
                <Text style={styles.mediaOptionText}>Location</Text>
              </Pressable>
              <Pressable onPress={() => handleMediaOptionPress('file')} style={styles.mediaOption}>
                <Text style={styles.mediaOptionIcon}>📎</Text>
                <Text style={styles.mediaOptionText}>File</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowMediaOptions(false)}
                style={styles.mediaOptionCancel}
              >
                <Text style={styles.mediaOptionCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View
          style={[
            styles.toolbar,
            {
              backgroundColor: theme.colors.chrome.bg,
              borderTopColor: theme.colors.chrome.bevelLo,
            },
          ]}
        >
          <Pressable
            onPress={showMediaActionSheet}
            accessibilityRole="button"
            style={styles.mediaButton}
          >
            <Text style={styles.mediaButtonText}>+</Text>
          </Pressable>
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
  mediaButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  mediaButtonText: {
    color: '#FF7A1A',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 24,
  },
  mediaOptionsOverlay: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 100,
  },
  mediaOptions: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  mediaOptionTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  mediaOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  mediaOptionIcon: {
    fontSize: 20,
  },
  mediaOptionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  mediaOptionCancel: {
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
  },
  mediaOptionCancelText: {
    color: '#FF7A1A',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 12,
  },
});
