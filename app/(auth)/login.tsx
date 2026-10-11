import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Checkbox, FunctionBar, Screen, TextField, TitleBar } from '@/components/ui';
import * as authService from '@/services/authService';
import { useTheme } from '@/theme';

export default function LoginScreen(): React.ReactElement {
  const { theme } = useTheme();
  const { signIn, isLoggingIn, loginError } = useAuth();

  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [autoLogin, setAutoLogin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill the last remembered account (never the password).
  useEffect(() => {
    let active = true;
    void (async () => {
      const remembered = await authService.getRememberedCredentials();
      if (active && remembered) {
        setUserId(remembered.userId);
        setRememberMe(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const canSubmit = userId.trim().length > 0 && password.length > 0 && !isLoggingIn && !submitting;

  const handleLogin = async (): Promise<void> => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await signIn({ userId: userId.trim(), password, rememberMe, autoLogin });
      if (!result.ok) return;
      router.replace(result.phase === 'needs-pin' ? '/pin' : '/contacts');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <TitleBar title="LOGIN" subtitle="Sign in to Uzzap" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.body, { padding: theme.space.lg }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoWrap}>
            <Text
              style={{
                color: theme.colors.brand.primary,
                fontFamily: theme.typography.family.pixelBold,
                fontSize: theme.typography.size.xl,
                letterSpacing: 3,
              }}
            >
              UZZAP
            </Text>
          </View>

          <TextField
            label="User ID"
            value={userId}
            onChangeText={setUserId}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="your user id"
            returnKeyType="next"
            textContentType="username"
          />

          <View>
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="your password"
              returnKeyType="done"
              textContentType="password"
              onSubmitEditing={() => void handleLogin()}
            />
            <Pressable
              onPress={() => setShowPassword((value) => !value)}
              accessibilityRole="button"
              style={styles.eye}
            >
              <Text style={{ color: theme.colors.text.link, fontSize: theme.typography.size.sm }}>
                {showPassword ? 'HIDE' : 'SHOW'}
              </Text>
            </Pressable>
          </View>

          <Checkbox checked={rememberMe} onToggle={setRememberMe} label="Remember me" />

          <View style={styles.switchRow}>
            <Text
              style={{ color: theme.colors.text.primary, fontSize: theme.typography.size.body }}
            >
              Auto-login on next launch
            </Text>
            <Switch
              value={autoLogin}
              onValueChange={setAutoLogin}
              trackColor={{
                false: theme.colors.surface.alt,
                true: theme.colors.brand.primary,
              }}
              thumbColor={theme.colors.surface.base}
            />
          </View>

          {loginError ? (
            <Text
              style={{
                color: theme.colors.text.error,
                fontSize: theme.typography.size.sm,
                marginTop: theme.space.sm,
              }}
            >
              {loginError}
            </Text>
          ) : null}
        </ScrollView>

        <FunctionBar
          leftLabel="REGISTER"
          rightLabel={isLoggingIn || submitting ? 'LOGGING IN…' : 'LOGIN ▸'}
          onLeftPress={() => router.push('/register')}
          onRightPress={() => void handleLogin()}
          rightDisabled={!canSubmit}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  eye: {
    position: 'absolute',
    right: 12,
    top: 30,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
});
