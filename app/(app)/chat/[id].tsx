import { Redirect, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Audio } from 'expo-av';

import { Screen, TitleBar } from '@/components/ui';
import { messageService, sendMedia, deleteMessage, forwardMessage } from '@/services/messageService';
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
  const [longPressMessage, setLongPressMessage] = useState<Message | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [imageViewer, setImageViewer] = useState<{ uri: string; mimeType?: string } | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showForwardPicker, setShowForwardPicker] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const soundRef = React.useRef<Audio.Sound | null>(null);

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

  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync().catch(() => undefined);
      soundRef.current = null;
    };
  }, []);

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
    const replyMeta = replyTo
      ? { replyTo: { id: replyTo.id, senderId: replyTo.senderId, content: replyTo.content } }
      : undefined;
    setReplyTo(null);
    void messageService
      .sendMessage({ recipientId: id, conversationId: id, content: text, meta: replyMeta })
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
          mimeType: media.meta.mimeType as string | undefined,
          fileName: media.meta.fileName as string | undefined,
          duration: media.meta.duration as number | undefined,
          latitude: media.meta.latitude as number | undefined,
          longitude: media.meta.longitude as number | undefined,
          locationName: media.meta.locationName as string | undefined,
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

  const handleLongPress = (message: Message): void => {
    setLongPressMessage(message);
    setShowActionSheet(true);
  };

  const handleReply = (): void => {
    if (!longPressMessage) return;
    setShowActionSheet(false);
    setReplyTo(longPressMessage);
    setLongPressMessage(null);
  };

  const handleForward = (): void => {
    if (!longPressMessage) return;
    setShowActionSheet(false);
    setShowForwardPicker(true);
  };

  const handleForwardTo = (targetId: string): void => {
    if (!longPressMessage) return;
    const source = longPressMessage;
    setShowForwardPicker(false);
    setLongPressMessage(null);
    void forwardMessage(source.id, targetId).catch(() => {
      Alert.alert('Error', 'Failed to forward message');
    });
  };

  const handleCopy = (): void => {
    if (!longPressMessage) return;
    const text = longPressMessage.content;
    setShowActionSheet(false);
    setLongPressMessage(null);
    void Clipboard.setStringAsync(text).then(() => {
      Alert.alert('Copied', 'Message copied to clipboard');
    });
  };

  const handleDelete = (): void => {
    if (!longPressMessage) return;
    const target = longPressMessage;
    setShowActionSheet(false);
    setLongPressMessage(null);
    Alert.alert('Delete Message', 'Are you sure you want to delete this message?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteMessage(id, target.id).catch(() => {
            Alert.alert('Error', 'Failed to delete message');
          });
        },
      },
    ]);
  };

  const handleVoiceToggle = async (message: Message): Promise<void> => {
    try {
      if (playingVoiceId === message.id) {
        await soundRef.current?.stopAsync().catch(() => undefined);
        await soundRef.current?.unloadAsync().catch(() => undefined);
        soundRef.current = null;
        setPlayingVoiceId(null);
        return;
      }
      await soundRef.current?.unloadAsync().catch(() => undefined);
      const sound = new Audio.Sound();
      soundRef.current = sound;
      setPlayingVoiceId(message.id);
      await sound.loadAsync({ uri: message.content }, { shouldPlay: true });
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingVoiceId(null);
        }
      });
    } catch {
      setPlayingVoiceId(null);
      Alert.alert('Error', 'Failed to play voice message');
    }
  };

  const handleOpenLocation = (message: Message): void => {
    const lat = message.meta?.latitude as number | undefined;
    const lng = message.meta?.longitude as number | undefined;
    if (lat === undefined || lng === undefined) return;
    const url = Platform.OS === 'ios'
      ? `maps://?q=${lat},${lng}`
      : `geo:${lat},${lng}?q=${lat},${lng}`;
    void Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open maps');
    });
  };

  const handleOpenFile = (message: Message): void => {
    const uri = message.content;
    if (!uri) return;
    void Linking.openURL(uri).catch(() => {
      Alert.alert('Error', 'Could not open file');
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
            const isImage = item.type === 'image' && item.meta?.uri;
            const isVoice = item.type === 'voice';
            const isLocation = item.type === 'location';
            const isFile = item.type === 'file';
            const reply = item.meta?.replyTo as
              | { id: string; senderId: string; content: string }
              | undefined;
            const forwardedFrom = item.meta?.forwardedFrom as string | undefined;
            const duration = item.meta?.duration as number | undefined;
            return (
              <Pressable
                onLongPress={() => handleLongPress(item)}
                onPress={
                  isImage
                    ? () =>
                        setImageViewer({
                          uri: item.meta?.uri as string,
                          mimeType: item.meta?.mimeType as string,
                        })
                    : undefined
                }
                style={[styles.bubbleRow, mine ? styles.alignEnd : styles.alignStart]}
              >
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
                  {reply ? (
                    <View style={styles.replyQuote}>
                      <Text style={styles.replyQuoteText} numberOfLines={2}>
                        {reply.content}
                      </Text>
                    </View>
                  ) : null}
                  {forwardedFrom ? (
                    <Text style={styles.forwardedLabel}>Forwarded</Text>
                  ) : null}
                  {isImage ? (
                    <View style={styles.imageBubble}>
                      <Image
                        source={{ uri: item.meta?.uri as string }}
                        style={styles.imageMessage}
                        resizeMode="cover"
                      />
                    </View>
                  ) : isVoice ? (
                    <Pressable
                      onPress={() => void handleVoiceToggle(item)}
                      style={styles.voiceRow}
                    >
                      <Text style={styles.voiceIcon}>
                        {playingVoiceId === item.id ? '⏸' : '▶'}
                      </Text>
                      <Text style={styles.voiceText}>
                        Voice message{duration ? ` • ${duration}s` : ''}
                      </Text>
                    </Pressable>
                  ) : isLocation ? (
                    <Pressable onPress={() => handleOpenLocation(item)} style={styles.locationCard}>
                      <Text style={styles.locationIcon}>📍</Text>
                      <Text style={styles.locationText} numberOfLines={2}>
                        {(item.meta?.locationName as string | undefined) ?? item.content}
                      </Text>
                      <Text style={styles.locationSub}>Tap to open in Maps</Text>
                    </Pressable>
                  ) : isFile ? (
                    <Pressable onPress={() => handleOpenFile(item)} style={styles.fileCard}>
                      <Text style={styles.fileIcon}>📎</Text>
                      <View style={styles.fileInfo}>
                        <Text style={styles.fileName} numberOfLines={1}>
                          {(item.meta?.fileName as string | undefined) ?? 'Attachment'}
                        </Text>
                        <Text style={styles.fileSub}>Tap to open</Text>
                      </View>
                    </Pressable>
                  ) : (
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
                  )}
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
              </Pressable>
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

        {showActionSheet && longPressMessage && (
          <View style={styles.actionSheetOverlay}>
            <View style={styles.actionSheet}>
              <Text style={styles.actionSheetTitle}>Message Options</Text>
              <Pressable onPress={handleReply} style={styles.actionSheetItem}>
                <Text style={styles.actionSheetItemIcon}>↩️</Text>
                <Text style={styles.actionSheetItemText}>Reply</Text>
              </Pressable>
              <Pressable onPress={handleForward} style={styles.actionSheetItem}>
                <Text style={styles.actionSheetItemIcon}>↪️</Text>
                <Text style={styles.actionSheetItemText}>Forward</Text>
              </Pressable>
              <Pressable onPress={handleCopy} style={styles.actionSheetItem}>
                <Text style={styles.actionSheetItemIcon}>📋</Text>
                <Text style={styles.actionSheetItemText}>Copy</Text>
              </Pressable>
              <Pressable
                onPress={handleDelete}
                style={[styles.actionSheetItem, styles.actionSheetItemDestructive]}
              >
                <Text style={styles.actionSheetItemIcon}>🗑️</Text>
                <Text style={styles.actionSheetItemTextDestructive}>Delete</Text>
              </Pressable>
              <Pressable onPress={() => setShowActionSheet(false)} style={styles.actionSheetCancel}>
                <Text style={styles.actionSheetCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}

        {replyTo ? (
          <View style={styles.replyBar}>
            <View style={styles.replyBarText}>
              <Text style={styles.replyBarLabel}>Replying to</Text>
              <Text style={styles.replyBarContent} numberOfLines={1}>
                {replyTo.content}
              </Text>
            </View>
            <Pressable onPress={() => setReplyTo(null)} accessibilityRole="button">
              <Text style={styles.replyBarClose}>✕</Text>
            </Pressable>
          </View>
        ) : null}

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
      <Modal
        visible={imageViewer !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setImageViewer(null)}
      >
        {imageViewer && (
          <View style={styles.imageViewerOverlay} onTouchStart={() => setImageViewer(null)}>
            <View style={styles.imageViewerContainer}>
              <Image
                source={{ uri: imageViewer.uri }}
                style={styles.imageViewerImage}
                resizeMode="contain"
              />
            </View>
          </View>
        )}
      </Modal>
      <Modal
        visible={showForwardPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowForwardPicker(false)}
      >
        <View style={styles.forwardOverlay}>
          <View style={styles.forwardBox}>
            <Text style={styles.forwardTitle}>Forward to</Text>
            <FlatList
              data={Object.values(buddies).filter((b) => b.userId !== id)}
              keyExtractor={(b) => b.userId}
              renderItem={({ item: b }) => (
                <Pressable onPress={() => handleForwardTo(b.userId)} style={styles.forwardRow}>
                  <Text style={styles.forwardName} numberOfLines={1}>
                    {b.displayName}
                  </Text>
                  <Text style={styles.forwardId} numberOfLines={1}>
                    {b.userId}
                  </Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={styles.forwardEmpty}>No other buddies</Text>
              }
            />
            <Pressable
              onPress={() => setShowForwardPicker(false)}
              style={styles.forwardCancel}
            >
              <Text style={styles.forwardCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  actionSheetOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    zIndex: 200,
  },
  actionSheet: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  actionSheetTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  actionSheetItemIcon: {
    fontSize: 20,
  },
  actionSheetItemText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  actionSheetItemDestructive: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
  },
  actionSheetItemTextDestructive: {
    color: '#E5484D',
    fontSize: 16,
    fontWeight: '500',
  },
  actionSheetCancel: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
  },
  actionSheetCancelText: {
    color: '#FF7A1A',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 14,
  },
  imageBubble: {
    maxWidth: '78%',
    maxHeight: 300,
    borderRadius: 16,
    overflow: 'hidden',
  },
  imageMessage: {
    width: '100%',
    aspectRatio: 1,
  },
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerContainer: {
    maxWidth: '95%',
    maxHeight: '90%',
  },
  imageViewerImage: {
    width: '100%',
    height: '100%',
  },
  replyQuote: {
    borderLeftWidth: 3,
    borderLeftColor: '#FF7A1A',
    paddingLeft: 8,
    marginBottom: 4,
    opacity: 0.9,
  },
  replyQuoteText: {
    color: '#888',
    fontSize: 12,
    fontStyle: 'italic',
  },
  forwardedLabel: {
    color: '#FF7A1A',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 160,
  },
  voiceIcon: {
    fontSize: 22,
    color: '#FF7A1A',
  },
  voiceText: {
    color: '#fff',
    fontSize: 14,
  },
  locationCard: {
    minWidth: 160,
    gap: 2,
  },
  locationIcon: {
    fontSize: 26,
  },
  locationText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  locationSub: {
    color: '#FF7A1A',
    fontSize: 11,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 160,
  },
  fileIcon: {
    fontSize: 26,
  },
  fileInfo: {
    flex: 1,
    gap: 2,
  },
  fileName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  fileSub: {
    color: '#FF7A1A',
    fontSize: 11,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  replyBarText: {
    flex: 1,
    borderLeftWidth: 3,
    borderLeftColor: '#FF7A1A',
    paddingLeft: 8,
  },
  replyBarLabel: {
    color: '#FF7A1A',
    fontSize: 11,
    fontWeight: '700',
  },
  replyBarContent: {
    color: '#ccc',
    fontSize: 13,
  },
  replyBarClose: {
    color: '#888',
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
  forwardOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  forwardBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    maxHeight: '70%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#333',
  },
  forwardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  forwardRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  forwardName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  forwardId: {
    color: '#888',
    fontSize: 12,
  },
  forwardEmpty: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  forwardCancel: {
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
    paddingTop: 12,
  },
  forwardCancelText: {
    color: '#FF7A1A',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
