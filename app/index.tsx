import { Redirect } from 'expo-router';
import React from 'react';

/**
 * Root index. Deep links (`uzzap://`) land on `/`; hand off to the branded
 * splash screen, which resolves the auth state and routes onward.
 */
export default function Index(): React.ReactElement {
  return <Redirect href="/splash" />;
}
