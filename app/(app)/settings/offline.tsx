import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen, SectionHeader, TitleBar } from '@/components/ui';
import { useUzzapStore } from '@/store';
import { useTheme } from '@/theme';
import type { OfflineDeliveryMode } from '@/types/models';

const OPTIONS: readonly { value: OfflineDeliveryMode; label: string; hint: string }[] = [
  { value: 'server', label: 'Server storage', hint: 'Messages wait on the server until you log in' },
  { value: 'push', label: 'Push notifications', hint: 'Delivered via push while offline' },
  { value: 'sms', label: 'SMS fallback', hint: 'Forwarded by SMS when offline' },
  { value: 'email', label: 'Email forwarding', hint: 'Forwarded to your email when offline' },
];

export default function OfflineSettingsScreen(): React.ReactElement {
  const { theme } = useTheme();
  const mode = useUzzapStore((state) => state.settings.offlineDelivery);
  const updateSettings = useUzzapStore((state) => state.updateSettings);

  return (
    <Screen edges={['top']}>
      <TitleBar title="OFFLINE DELIVERY" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeader title="WHEN YOU ARE LOGGED OUT" />
        {OPTIONS.map((option) => {
          const selected = mode === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => updateSettings({ offlineDelivery: option.value })}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[
                styles.row,
                { borderBottomColor: theme.colors.border.divider },
                selected && { backgroundColor: theme.colors.surface.alt },
              ]}
            >
              <View
                style={[
                  styles.radio,
                  {
                    borderColor: selected
                      ? theme.colors.brand.primary
                      : theme.colors.border.input,
                  },
                ]}
              >
                {selected ? (
                  <View
                    style={[styles.radioDot, { backgroundColor: theme.colors.brand.primary }]}
                  />
                ) : null}
              </View>
              <View style={styles.text}>
                <Text
                  style={{
                    color: theme.colors.text.primary,
                    fontSize: theme.typography.size.body,
                    fontWeight: selected ? '700' : '400',
                  }}
                >
                  {option.label}
                </Text>
                <Text
                  style={{
                    color: theme.colors.text.secondary,
                    fontSize: theme.typography.size.sm,
                    marginTop: 2,
                  }}
                >
                  {option.hint}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  text: {
    flex: 1,
  },
});
