import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import {
  AppButton,
  AppInput,
  AlertDialog,
  Screen,
  SectionHeader,
  SettingRow,
  TitleBar,
} from '@/components/ui';
import { useUzzapStore } from '@/store';
import { useTheme } from '@/theme';
import { wsClient } from '@/services/wsClient';
import { PROTOCOL } from '@/types/protocol';
import type { ThemeName } from '@/theme';

const THEME_OPTIONS: readonly { value: ThemeName; label: string }[] = [
  { value: 'uzzap', label: 'Uzzap (default)' },
  { value: 'default', label: 'Default' },
  { value: 'system', label: 'Follow system' },
];

export default function SettingsScreen(): React.ReactElement {
  const { theme, themeName, setTheme, mode, setMode } = useTheme();
  const { signOut } = useAuth();
  const settings = useUzzapStore((state) => state.settings);
  const updateSettings = useUzzapStore((state) => state.updateSettings);
  const _user = useUzzapStore((state) => state.user);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showChangeMobile, setShowChangeMobile] = useState(false);
  const [showProxySettings, setShowProxySettings] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [proxyHost, setProxyHost] = useState(settings.proxyHost);
  const [proxyPort, setProxyPort] = useState(String(settings.proxyPort));

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

  const handleChangePassword = async (): Promise<void> => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    // TODO: Implement actual password change via authService
    Alert.alert('Success', 'Password changed (placeholder)');
    setShowChangePassword(false);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleChangeMobile = async (): Promise<void> => {
    if (!newMobile.trim()) {
      Alert.alert('Error', 'Please enter a mobile number');
      return;
    }

    // TODO: Implement actual mobile change via authService (requires PIN verification)
    Alert.alert('Success', 'Mobile number change requested (placeholder)');
    setShowChangeMobile(false);
    setNewMobile('');
  };

  const handleSaveProxy = (): void => {
    const port = parseInt(proxyPort, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      Alert.alert('Error', 'Invalid port number');
      return;
    }
    updateSettings({
      proxyEnabled: true,
      proxyHost,
      proxyPort: port,
    });
    // Apply to wsClient
    wsClient.configure({
      host: proxyHost,
      port,
    });
    setShowProxySettings(false);
  };

  const handleToggleBiometric = async (enabled: boolean): Promise<void> => {
    if (enabled) {
      // TODO: Implement biometric authentication prompt
      Alert.alert('Info', 'Biometric unlock would be enabled here (placeholder)');
    }
    updateSettings({ biometricUnlock: enabled });
  };

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
        <SettingRow label="Change password" onPress={() => setShowChangePassword(true)} />
        <SettingRow label="Change mobile number" onPress={() => setShowChangeMobile(true)} />
        <SettingRow
          label="Biometric unlock"
          right={switchRow(settings.biometricUnlock, handleToggleBiometric)}
        />

        <SectionHeader title="CONNECTION" />
        <SettingRow
          label="Connection timeout"
          description={`${settings.connectionTimeout} seconds`}
          right={
            <AppInput
              value={String(settings.connectionTimeout)}
              onChangeText={(v) => updateSettings({ connectionTimeout: parseInt(v, 10) || 60 })}
              keyboardType="numeric"
              style={styles.smallInput}
            />
          }
        />
        <SettingRow
          label="Keep-alive interval"
          description={`${settings.keepAliveInterval} seconds`}
          right={
            <AppInput
              value={String(settings.keepAliveInterval)}
              onChangeText={(v) => {
                const val = parseInt(v, 10) || 900;
                updateSettings({ keepAliveInterval: val });
                wsClient.configure({ keepAliveMs: val * 1000 });
              }}
              keyboardType="numeric"
              style={styles.smallInput}
            />
          }
        />
        <SettingRow
          label="Proxy"
          right={switchRow(settings.proxyEnabled, (next) => {
            updateSettings({ proxyEnabled: next });
            if (!next) wsClient.configure({ host: PROTOCOL.DEFAULT_HOST });
          })}
        />
        <SettingRow
          label="Proxy settings"
          description={
            settings.proxyEnabled ? `${settings.proxyHost}:${settings.proxyPort}` : 'Disabled'
          }
          onPress={() => setShowProxySettings(true)}
        />

        <SectionHeader title="HELP & ABOUT" />
        <SettingRow label="Help" onPress={() => router.push('/help')} />
        <SettingRow label="About Uzzap" description="Version 0.1.0" />

        <View style={styles.logout}>
          <AppButton label="LOG OUT" variant="danger" onPress={confirmLogout} />
        </View>
      </ScrollView>

      {showChangePassword && (
        <AlertDialog
          visible={showChangePassword}
          onClose={() => setShowChangePassword(false)}
          title="Change Password"
          content={
            <>
              <AppInput
                label="Current Password"
                value={oldPassword}
                onChangeText={setOldPassword}
                secureTextEntry
                autoFocus
              />
              <AppInput
                label="New Password"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
              <AppInput
                label="Confirm New Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
            </>
          }
          actions={[
            { text: 'Cancel', onPress: () => setShowChangePassword(false) },
            { text: 'Change', onPress: handleChangePassword, variant: 'primary' },
          ]}
        />
      )}

      {showChangeMobile && (
        <AlertDialog
          visible={showChangeMobile}
          onClose={() => setShowChangeMobile(false)}
          title="Change Mobile Number"
          content={
            <AppInput
              label="New Mobile Number"
              value={newMobile}
              onChangeText={setNewMobile}
              keyboardType="phone-pad"
              autoFocus
            />
          }
          actions={[
            { text: 'Cancel', onPress: () => setShowChangeMobile(false) },
            { text: 'Change', onPress: handleChangeMobile, variant: 'primary' },
          ]}
        />
      )}

      {showProxySettings && (
        <AlertDialog
          visible={showProxySettings}
          onClose={() => setShowProxySettings(false)}
          title="Proxy Settings"
          content={
            <>
              <AppInput
                label="Proxy Host"
                value={proxyHost}
                onChangeText={setProxyHost}
                autoFocus
              />
              <AppInput
                label="Proxy Port"
                value={proxyPort}
                onChangeText={setProxyPort}
                keyboardType="numeric"
              />
            </>
          }
          actions={[
            { text: 'Cancel', onPress: () => setShowProxySettings(false) },
            { text: 'Save', onPress: handleSaveProxy, variant: 'primary' },
          ]}
        />
      )}
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
