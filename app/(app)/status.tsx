import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppInput, Screen, SectionHeader, TitleBar } from '@/components/ui';
import { publishStatus } from '@/services/presenceService';
import { useUzzapStore } from '@/store';
import { useTheme } from '@/theme';
import type { PresenceStatus } from '@/types/protocol';

const STATUS_OPTIONS: readonly { value: PresenceStatus; label: string; dot: string }[] = [
  { value: 'available', label: 'Available', dot: '🟢' },
  { value: 'away', label: 'Away', dot: '🟡' },
  { value: 'busy', label: 'Busy', dot: '🔴' },
  { value: 'invisible', label: 'Invisible', dot: '⚪' },
];

export default function StatusScreen(): React.ReactElement {
  const { theme } = useTheme();
  const selfStatus = useUzzapStore((state) => state.selfStatus);
  const selfStatusMessage = useUzzapStore((state) => state.selfStatusMessage);
  const [status, setStatus] = useState<PresenceStatus>(
    selfStatus === 'offline' || selfStatus === 'online' ? 'available' : selfStatus,
  );
  const [message, setMessage] = useState(selfStatusMessage ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await publishStatus(status, message.trim() || undefined);
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['top']}>
      <TitleBar title="MY STATUS" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeader title="STATUS" />
        {STATUS_OPTIONS.map((option) => {
          const selected = status === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setStatus(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[
                styles.option,
                { borderBottomColor: theme.colors.border.divider },
                selected && { backgroundColor: theme.colors.surface.alt },
              ]}
            >
              <Text style={styles.dot}>{option.dot}</Text>
              <Text
                style={{
                  flex: 1,
                  color: theme.colors.text.primary,
                  fontSize: theme.typography.size.body,
                  fontWeight: selected ? '700' : '400',
                }}
              >
                {option.label}
              </Text>
              {selected ? (
                <Text style={{ color: theme.colors.brand.primary, fontSize: 18 }}>✓</Text>
              ) : null}
            </Pressable>
          );
        })}

        <SectionHeader title="STATUS MESSAGE" />
        <View style={styles.messageWrap}>
          <AppInput
            label="Custom message (max 80)"
            value={message}
            onChangeText={(v) => setMessage(v.slice(0, 80))}
            placeholder="What are you up to?"
            maxLength={80}
          />
          <Text style={{ color: theme.colors.text.secondary, fontSize: 12 }}>
            {message.length}/80
          </Text>
        </View>

        <View style={styles.saveWrap}>
          <AppButton
            label={saving ? 'SAVING…' : 'SET STATUS'}
            onPress={() => void handleSave()}
            disabled={saving}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    fontSize: 18,
  },
  messageWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  saveWrap: {
    padding: 16,
  },
});
