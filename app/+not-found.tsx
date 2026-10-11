import { Stack, router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

/** Catch-all 404 for unmatched routes. */
export default function NotFoundScreen(): React.ReactElement {
  const { theme } = useTheme();
  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: 'Not found' }} />
      <Screen padded>
        <View style={styles.wrap}>
          <Text
            style={{
              color: theme.colors.brand.primary,
              fontFamily: theme.typography.family.display,
              fontSize: theme.typography.size.xxl,
            }}
          >
            404
          </Text>
          <Text
            style={{
              color: theme.colors.text.primary,
              fontSize: theme.typography.size.bodyLg,
              marginTop: theme.space.sm,
              textAlign: 'center',
            }}
          >
            This screen does not exist.
          </Text>
          <Text
            style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.size.body,
              marginTop: theme.space.sm,
              textAlign: 'center',
            }}
          >
            The page you requested could not be found.
          </Text>
          <AppButton
            label="GO TO START"
            variant="primary"
            onPress={() => router.replace('/splash')}
            style={styles.action}
          />
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    marginTop: 24,
    paddingHorizontal: 32,
  },
});
