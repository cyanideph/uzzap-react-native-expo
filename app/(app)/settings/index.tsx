import { router } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { AppButton, Screen, SectionHeader, SettingRow, TitleBar } from '@/components/ui';
import { useUzzapStore } from '@/store';
import { useTheme } from '@/theme';
import type { ThemeName } from '@/theme';

const THEME_OPTIONS: ReadonlyArray<{ value: ThemeName; label: string }> = [
  { value: 'uzzap', label: 'Uzzap (default)' },
  { value: 'default', label: 'Default' },
  { value: 'system', label: 'Follow system' },
];

export default function SettingsScreen(): React.ReactElement {
  const { theme, themeName, setTheme, mode, setMode } = useTheme();
  const { signOut } = useAuth();
  const settings = useUzzapStore((state) => state.settings);
  const updateSettings = useUzzapStore((state) => state.updateSettings);

  const confirmLogout = (): void => {
    Alert.alert('Log out', 'Sign out of Uzzap on this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await signOut();
            router.replace('/login');
          })();
        },
      },
    ]);
  };

  const switchRow = (value: boolean, onChange: (next: boolean) => void) => (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: theme.colors.surface.alt, true: theme.colors.brand.primary }}
      thumbColor={theme.colors.surface.base}
    />
  );

  return (
    <Screen edges={['top']}>
      <TitleBar title="SETTINGS" />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeader title="GENERAL" />
        <SettingRow
          label="Auto-start on boot"
          description="Start Uzzap when the device powers on"
          right={switchRow(settings.autoStart, (next) => updateSettings({ autoStart: next }))}
        />
        <SettingRow
          label="Auto-login"
          description="Sign in automatically on launch"
          right={switchRow(settings.autoLogin, (next) => updateSettings({ autoLogin: next }))}
        />
        <SettingRow
          label="Vibration"
          right={switchRow(settings.vibrationEnabled, (next) =>
            updateSettings({ vibrationEnabled: next }),
          )}
        />
        <SettingRow
          label="Sound"
          right={switchRow(settings.soundEnabled, (next) => updateSettings({ soundEnabled: next }))}
        />
        <SettingRow
          label="LED notification"
          right={switchRow(settings.ledEnabled, (next) => updateSettings({ ledEnabled: next }))}
        />

        <SectionHeader title="PRIVACY" />
        <SettingRow
          label="Read receipts"
          right={switchRow(settings.readReceipts, (next) => updateSettings({ readReceipts: next }))}
        />
        <SettingRow
          label="Last seen visible"
          right={switchRow(settings.lastSeenVisible, (next) =>
            updateSettings({ lastSeenVisible: next }),
          )}
        />
        <SettingRow
          label="SMS fallback"
          description="Deliver messages by SMS when offline"
          right={switchRow(settings.smsFallback, (next) => updateSettings({ smsFallback: next }))}
        />

        <SectionHeader title="THEME" />
        {THEME_OPTIONS.map((option) => (
          <SettingRow
            key={option.value}
            label={option.label}
            right={
              themeName === option.value ? (
                <Text
                  style={{
                    color: theme.colors.brand.primary,
                    fontSize: theme.typography.size.lg,
                  }}
                >
                  {'✓'}
                </Text>
              ) : null
            }
            onPress={() => setTheme(option.value)}
          />
        ))}
        <SettingRow
          label="Dark mode"
          right={switchRow(mode === 'dark', (next) => setMode(next ? 'dark' : 'light'))}
        />

        <SectionHeader title="ACCOUNT" />
        <SettingRow label="Change password" description="Coming soon" disabled />
        <SettingRow label="Change mobile number" description="Coming soon" disabled />

        <SectionHeader title="HELP & ABOUT" />
        <SettingRow label="Help" onPress={() => router.push('/help')} />
        <SettingRow label="About Uzzap" description="Version 0.1.0" />

        <View style={styles.logout}>
          <AppButton label="LOG OUT" variant="danger" onPress={confirmLogout} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
  },
  logout: {
    padding: 16,
  },
});
