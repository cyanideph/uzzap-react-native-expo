import { router } from 'expo-router';
import React from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { FunctionBar, Screen, TitleBar } from '@/components/ui';
import { useUzzapStore } from '@/store';
import { useTheme } from '@/theme';

type AppRoute = '/contacts' | '/chat' | '/settings' | '/help';

interface MenuItem {
  label: string;
  icon: number;
  route?: AppRoute;
  action?: 'silent-mode' | 'unavailable';
  detail?: string;
}

/**
 * Original JavaUzzap main-menu labels and large 57×57 px icons.
 * Routes use the implemented Expo screens; unsupported legacy actions are
 * called out honestly rather than routed to fake/demo functionality.
 */
const MENU_ITEMS: MenuItem[] = [
  {
    label: 'Subscription',
    icon: require('../../assets/themes/default/000-smart-large.png'),
    action: 'unavailable',
    detail: 'Subscription services are not implemented in the Expo client yet.',
  },
  {
    label: 'Buddy Matching',
    icon: require('../../assets/themes/default/001-abm-large.png'),
    action: 'unavailable',
    detail: 'The original Java client marked automatic buddy matching as device-dependent.',
  },
  {
    label: 'Add or Invite Buddies',
    icon: require('../../assets/themes/default/002-buddies-large.png'),
    action: 'unavailable',
    detail: 'The add/invite flow still needs to be ported from the original Java client.',
  },
  {
    label: 'Settings',
    icon: require('../../assets/themes/default/003-settings-large.png'),
    route: '/settings',
  },
  {
    label: 'Silent Mode',
    icon: require('../../assets/themes/default/008-ringtone-large.png'),
    action: 'silent-mode',
  },
  {
    label: 'Themes',
    icon: require('../../assets/themes/default/005-themes-large.png'),
    route: '/settings',
  },
  {
    label: 'Help',
    icon: require('../../assets/themes/default/006-help-large.png'),
    route: '/help',
  },
  {
    label: 'Battery Saving',
    icon: require('../../assets/themes/default/007-batteryinfo-large.png'),
    action: 'unavailable',
    detail: 'The original battery-saving controls have not been ported yet.',
  },
  {
    label: 'Extended Messaging',
    icon: require('../../assets/themes/default/d000-em-large.png'),
    route: '/chat',
  },
  {
    label: 'Instant Messaging',
    icon: require('../../assets/themes/default/d001-im-large.png'),
    route: '/contacts',
  },
  {
    label: 'Chat Rooms',
    icon: require('../../assets/themes/default/d002-chat-large.png'),
    action: 'unavailable',
    detail: 'Chat-room discovery and membership have not been ported yet.',
  },
  {
    label: 'Change Status',
    icon: require('../../assets/themes/default/d003-status-large.png'),
    action: 'unavailable',
    detail: 'Presence publishing exists in the service layer; the status picker UI still needs to be ported.',
  },
];

export default function HomeMenuScreen(): React.ReactElement {
  const { theme } = useTheme();
  const { signOut } = useAuth();
  const settings = useUzzapStore((state) => state.settings);
  const updateSettings = useUzzapStore((state) => state.updateSettings);
  const buddies = useUzzapStore((state) => state.buddies);
  const onlineCount = Object.values(buddies).filter(
    (buddy) => buddy.status === 'online' || buddy.status === 'available',
  ).length;

  const activateItem = (item: MenuItem): void => {
    if (item.route) {
      router.push(item.route);
      return;
    }

    if (item.action === 'silent-mode') {
      const enableSound = !(settings.soundEnabled || settings.vibrationEnabled);
      updateSettings({ soundEnabled: enableSound, vibrationEnabled: enableSound });
      Alert.alert(
        enableSound ? 'Silent Mode Off' : 'Silent Mode On',
        enableSound
          ? 'Sound and vibration notifications have been enabled.'
          : 'Sound and vibration notifications have been disabled.',
      );
      return;
    }

    Alert.alert(item.label, item.detail ?? 'This feature is not available yet.');
  };

  const showOptions = (): void => {
    Alert.alert('Uzzap Options', 'Choose an action.', [
      { text: 'Help', onPress: () => router.push('/help') },
      { text: 'Settings', onPress: () => router.push('/settings') },
      { text: 'About Uzzap', onPress: () => Alert.alert('About Uzzap', 'Expo client version 0.1.0 · based on JavaUzzap 1.0.14') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmSignOut = (): void => {
    Alert.alert('Log out', 'Sign out of Uzzap on this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          void signOut().then(() => router.replace('/login'));
        },
      },
    ]);
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <TitleBar title="UZZAP" subtitle={`${onlineCount} online`} />
      <ScrollView contentContainerStyle={styles.menu}>
        <View style={styles.grid}>
          {MENU_ITEMS.map((item) => (
            <Pressable
              key={item.label}
              onPress={() => activateItem(item)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              style={({ pressed }) => [
                styles.tile,
                {
                  backgroundColor: pressed ? theme.colors.semantic.selectedBg : theme.colors.surface.base,
                  borderColor: theme.colors.border.divider,
                },
              ]}
            >
              <Image source={item.icon} resizeMode="contain" style={styles.icon} />
              <Text
                style={[
                  styles.label,
                  {
                    color: theme.colors.text.primary,
                    fontFamily: theme.typography.family.body,
                  },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <FunctionBar leftLabel="Options" onLeftPress={showOptions} rightLabel="Log out" onRightPress={confirmSignOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  menu: {
    flexGrow: 1,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  tile: {
    width: '32%',
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 4,
    paddingTop: 6,
    paddingBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 57,
    height: 57,
  },
  label: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 15,
    textAlign: 'center',
  },
});
