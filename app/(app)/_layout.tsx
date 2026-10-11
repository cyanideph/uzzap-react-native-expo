import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import React from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/theme';

interface TabMeta {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}

const TAB_META: Record<'contacts' | 'chat' | 'settings' | 'help', TabMeta> = {
  contacts: { label: 'Contacts', icon: 'people-outline', activeIcon: 'people' },
  chat: { label: 'Chat', icon: 'chatbubbles-outline', activeIcon: 'chatbubbles' },
  settings: { label: 'Settings', icon: 'settings-outline', activeIcon: 'settings' },
  help: { label: 'Help', icon: 'help-circle-outline', activeIcon: 'help-circle' },
};

function tabOptions(name: keyof typeof TAB_META) {
  const meta = TAB_META[name];
  return {
    tabBarLabel: meta.label,
    title: meta.label,
    tabBarIcon: ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
      <Ionicons name={focused ? meta.activeIcon : meta.icon} color={color} size={size} />
    ),
  };
}

/**
 * Main app tabs: Contacts · Chat · Settings · Help.
 *
 * The chat thread (`chat/[id]`) lives in the same navigator but is hidden from
 * the tab bar — it is pushed from the buddy/conversation lists.
 */
export default function AppLayout(): React.ReactElement {
  const { status } = useAuth();
  const { theme } = useTheme();

  if (status === 'loading') {
    return <Redirect href="/splash" />;
  }
  if (status === 'needs-pin') {
    return <Redirect href="/pin" />;
  }
  if (status !== 'signed-in') {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.brand.primary,
        tabBarInactiveTintColor: theme.colors.text.secondary,
        tabBarStyle: {
          backgroundColor: theme.colors.chrome.bg,
          borderTopColor: theme.colors.chrome.bevelLo,
          height: 58,
          paddingBottom: 6,
        },
      }}
    >
      <Tabs.Screen name="contacts" options={tabOptions('contacts')} />
      <Tabs.Screen name="chat" options={tabOptions('chat')} />
      <Tabs.Screen name="settings" options={tabOptions('settings')} />
      <Tabs.Screen name="help" options={tabOptions('help')} />
      {/* Thread screen: registered in the tab navigator but not shown as a tab. */}
      <Tabs.Screen name="chat/[id]" options={{ href: null }} />
    </Tabs>
  );
}
