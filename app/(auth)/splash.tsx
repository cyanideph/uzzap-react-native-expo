import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Screen } from '@/components/ui';
import { useTheme } from '@/theme';

/** Branded hold; resolves the persisted session then routes onward. */
export default function SplashScreen(): React.ReactElement {
  const { status } = useAuth();
  const { theme } = useTheme();

  useEffect(() => {
    if (status === 'loading') return;

    const target =
      status === 'signed-in' ? '/contacts' : status === 'needs-pin' ? '/pin' : '/login';

    const timer = setTimeout(() => {
      router.replace(target);
    }, 1200);

    return () => clearTimeout(timer);
  }, [status]);

  return (
    <Screen
      style={[styles.screen, { backgroundColor: theme.colors.brand.ink }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.center}>
        <Text
          style={{
            color: theme.colors.brand.primary,
            fontFamily: theme.typography.family.pixelBold,
            fontSize: theme.typography.size.wordmark,
            letterSpacing: 4,
          }}
        >
          UZZAP
        </Text>
        <Text
          style={{
            color: theme.colors.chrome.text,
            fontSize: theme.typography.size.bodySm,
            marginTop: theme.space.sm,
          }}
        >
          Instant messaging, the retro way.
        </Text>
        <ActivityIndicator
          color={theme.colors.brand.primary}
          size="small"
          style={{ marginTop: theme.space.xl }}
        />
      </View>
      <Text
        style={{
          color: theme.colors.text.secondary,
          fontSize: theme.typography.size.xxs,
          textAlign: 'center',
        }}
      >
        v0.1.0
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
