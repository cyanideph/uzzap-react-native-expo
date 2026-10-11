import 'react-native-gesture-handler';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/AuthProvider';
import { useUzzapMigrations } from '@/db/useMigrations';
import { bootstrapServices } from '@/services/bootstrap';
import { useUzzapStore } from '@/store';
import { ThemeProvider, useTheme } from '@/theme';

// Keep the native splash up until React has mounted our own splash screen.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * Root layout.
 *
 * Provider order is significant:
 *   Migrations → GestureHandler → SafeArea → Theme (tokens) → Auth (session) → Router.
 *
 * Drizzle migrations run first so the SQLite schema exists before the service
 * layer (settings, roster, message history) touches the database. The zustand
 * store needs no provider — screens consume it through `useUzzapStore`
 * selectors — but `AuthProvider` gates the router on the rehydrated auth slice.
 */
export default function RootLayout(): React.ReactElement {
  const migrations = useUzzapMigrations();

  useEffect(() => {
    // Our `(auth)/splash` screen owns the branded hold; reveal the app now.
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  // Bring the service layer up only after the schema exists — settings and the
  // domain services read/write SQLite on load.
  useEffect(() => {
    if (!migrations.success) return;
    void bootstrapServices();
  }, [migrations.success]);

  if (!migrations.success) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <MigrationGate error={migrations.error} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <StatusBar style="auto" />
            <RootNavigator />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Blocking screen shown while the bundled migrations are applied. */
function MigrationGate({ error }: { error?: Error }): React.ReactElement {
  return (
    <View style={styles.gate}>
      <Text style={styles.gateTitle}>{error ? 'DATABASE ERROR' : 'PREPARING'}</Text>
      {error ? (
        <Text style={styles.gateMessage}>{error.message}</Text>
      ) : (
        <ActivityIndicator color="#FF7A1A" size="small" style={styles.gateSpinner} />
      )}
    </View>
  );
}

/** Inner navigator so theme tokens are available to the stack. */
function RootNavigator(): React.ReactElement {
  const { theme } = useTheme();
  // Touch the store so the persistence layer is wired before screens mount.
  useUzzapStore((state) => state.phase);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.surface.base },
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
    gap: 12,
  },
  gateTitle: {
    color: '#FF7A1A',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 3,
  },
  gateMessage: {
    color: '#CCCCCC',
    fontSize: 13,
    paddingHorizontal: 32,
    textAlign: 'center',
  },
  gateSpinner: {
    marginTop: 4,
  },
});
