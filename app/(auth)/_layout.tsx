import { Redirect, Stack } from 'expo-router';
import React from 'react';

import { useAuth } from '@/auth/AuthProvider';

export const unstable_settings = {
  initialRouteName: 'splash',
};

/**
 * Auth stack: splash → login / register → pin.
 *
 * A signed-in session short-circuits to the main app; the individual screens
 * decide between login / register / pin for the remaining phases.
 */
export default function AuthLayout(): React.ReactElement {
  const { status } = useAuth();

  if (status === 'signed-in') {
    return <Redirect href="/contacts" />;
  }

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
