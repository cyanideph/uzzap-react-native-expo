import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { FunctionBar, Screen, TitleBar } from '@/components/ui';
import { useTheme } from '@/theme';

const PIN_LENGTH = 6;
const RESEND_SECONDS = 45;

function maskPhone(value: string): string {
  if (value.length <= 2) return value;
  const visible = value.slice(-2);
  return `${value.slice(0, value.length - 2).replace(/\d/g, '•')}${visible}`;
}

export default function PinScreen(): React.ReactElement {
  const { theme } = useTheme();
  const { user, verifyPin, resendPin } = useAuth();

  const inputRef = useRef<TextInput>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [resent, setResent] = useState(false);

  // No pending account → back to login.
  useEffect(() => {
    if (!user) router.replace('/login');
  }, [user]);

  // Focus the hidden input on mount so the OS keypad opens immediately.
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, []);

  // Resend countdown.
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const submit = async (value: string): Promise<void> => {
    if (value.length !== PIN_LENGTH || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const result = await verifyPin(value);
      if (!result.ok) {
        setError(result.error ?? 'Invalid code. Try again.');
        setPin('');
        inputRef.current?.focus();
        return;
      }
      router.replace('/contacts');
    } finally {
      setVerifying(false);
    }
  };

  const handleChange = (value: string): void => {
    const digits = value.replace(/\D/g, '').slice(0, PIN_LENGTH);
    setPin(digits);
    setError(null);
    if (digits.length === PIN_LENGTH) void submit(digits);
  };

  const handleResend = async (): Promise<void> => {
    if (seconds > 0 || !user) return;
    await resendPin(user.id);
    setSeconds(RESEND_SECONDS);
    setResent(true);
    setPin('');
    setError(null);
    inputRef.current?.focus();
  };

  const masked = user?.phoneNumber ? maskPhone(user.phoneNumber) : 'your mobile';
  const canVerify = pin.length === PIN_LENGTH && !verifying;

  return (
    <Screen>
      <TitleBar title="VERIFY NUMBER" onBack={() => router.replace('/register')} />
      <View style={[styles.body, { padding: theme.space.lg }]}>
        <Text
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.size.body,
            textAlign: 'center',
          }}
        >
          {resent ? 'A new code was sent to ' : 'Enter the 6-digit code sent to '}
          <Text style={{ color: theme.colors.text.primary }}>{masked}</Text>
        </Text>

        <Pressable onPress={() => inputRef.current?.focus()} style={styles.cells}>
          {Array.from({ length: PIN_LENGTH }).map((_, index) => {
            const filled = index < pin.length;
            const active = index === pin.length;
            return (
              <View
                key={index}
                style={[
                  styles.cell,
                  {
                    borderColor:
                      active || filled ? theme.colors.brand.primary : theme.colors.border.divider,
                    backgroundColor: theme.colors.surface.alt,
                  },
                ]}
              >
                <Text
                  style={{
                    color: theme.colors.text.primary,
                    fontSize: theme.typography.size.xl,
                  }}
                >
                  {pin[index] ?? ''}
                </Text>
              </View>
            );
          })}
        </Pressable>

        <TextInput
          ref={inputRef}
          value={pin}
          onChangeText={handleChange}
          keyboardType="number-pad"
          maxLength={PIN_LENGTH}
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          caretHidden
          style={styles.hiddenInput}
          onSubmitEditing={() => void submit(pin)}
        />

        {error ? (
          <Text
            style={{
              color: theme.colors.text.error,
              fontSize: theme.typography.size.sm,
              textAlign: 'center',
              marginTop: theme.space.md,
            }}
          >
            {error}
          </Text>
        ) : null}

        <Pressable
          onPress={() => void handleResend()}
          disabled={seconds > 0}
          accessibilityRole="button"
          style={styles.resend}
        >
          <Text
            style={{
              color: seconds > 0 ? theme.colors.text.secondary : theme.colors.text.link,
              fontSize: theme.typography.size.sm,
            }}
          >
            {seconds > 0 ? `Resend in 0:${String(seconds).padStart(2, '0')}` : 'Resend code'}
          </Text>
        </Pressable>
      </View>

      <FunctionBar
        leftLabel="CHANGE NUMBER"
        rightLabel={verifying ? 'VERIFYING…' : 'VERIFY ▸'}
        onLeftPress={() => router.replace('/register')}
        onRightPress={() => void submit(pin)}
        rightDisabled={!canVerify}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cells: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 24,
  },
  cell: {
    width: 48,
    height: 56,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  resend: {
    marginTop: 20,
    paddingVertical: 8,
  },
});
