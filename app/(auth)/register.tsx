import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { Control, Path } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInputProps,
} from 'react-native';
import { z } from 'zod';

import { useAuth } from '@/auth/AuthProvider';
import { FunctionBar, ProgressBar, Screen, TextField, TitleBar } from '@/components/ui';
import { useTheme } from '@/theme';

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const registerSchema = z
  .object({
    userId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{6,12}$/, '6–12 letters or numbers'),
    mobileCc: z
      .string()
      .trim()
      .regex(/^\+\d{1,4}$/, 'e.g. +63'),
    mobile: z
      .string()
      .trim()
      .regex(/^\d{6,15}$/, 'Enter a valid mobile number'),
    firstName: z.string().trim().min(1, 'Required').max(40, 'Max 40 characters'),
    lastName: z.string().trim().min(1, 'Required').max(40, 'Max 40 characters'),
    email: z.string().trim().email('Enter a valid email'),
    password: z.string().min(6, 'At least 6 characters'),
    confirmPassword: z.string().min(6, 'At least 6 characters'),
    pin: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: "Passwords don't match",
  });

type RegisterFormValues = z.infer<typeof registerSchema>;
type RegisterFieldName = keyof RegisterFormValues;
type Step = 1 | 2 | 3;

const STEP_FIELDS: Record<Step, RegisterFieldName[]> = {
  1: ['userId', 'mobileCc', 'mobile', 'firstName', 'lastName', 'email'],
  2: ['password', 'confirmPassword'],
  3: ['pin'],
};

const STEP_TITLES: Record<Step, string> = {
  1: 'Account details',
  2: 'Choose a password',
  3: 'Verify your number',
};

const STEP_HELP: Record<Step, string> = {
  1: 'Your User ID identifies you in Uzzap. Use a full international mobile number.',
  2: 'Passwords must be at least 6 characters and match.',
  3: 'We texted a 6-digit code to your mobile. Enter it to finish signing up.',
};

/* -------------------------------------------------------------------------- */
/* RHF-bound field                                                            */
/* -------------------------------------------------------------------------- */

interface RhfTextFieldProps extends TextInputProps {
  control: Control<RegisterFormValues>;
  name: Path<RegisterFormValues>;
  label: string;
  error?: string;
}

function RhfTextField({
  control,
  name,
  label,
  error,
  ...rest
}: RhfTextFieldProps): React.ReactElement {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange, onBlur } }) => (
        <TextField
          label={label}
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          onBlur={onBlur}
          error={error}
          {...rest}
        />
      )}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function RegisterScreen(): React.ReactElement {
  const { theme } = useTheme();
  const { register: registerAccount, verifyPin } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    trigger,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    mode: 'onTouched',
    defaultValues: {
      userId: '',
      mobileCc: '+63',
      mobile: '',
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      pin: '',
    },
  });

  const goNext = async (): Promise<void> => {
    const valid = await trigger(STEP_FIELDS[step]);
    if (!valid) return;
    setFormError(null);
    if (step < 3) setStep((step + 1) as Step);
  };

  const goBack = (): void => {
    setFormError(null);
    if (step === 1) {
      router.replace('/login');
      return;
    }
    setStep((step - 1) as Step);
  };

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await registerAccount({
        userId: values.userId,
        mobile: `${values.mobileCc}${values.mobile}`,
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
      });
      if (!result.ok) {
        setFormError(result.error ?? 'Registration failed.');
        return;
      }

      const pinResult = await verifyPin(values.pin);
      if (!pinResult.ok) {
        setFormError(pinResult.error ?? 'Invalid code.');
        return;
      }

      router.replace('/contacts');
    } finally {
      setSubmitting(false);
    }
  });

  const headingStyle = {
    color: theme.colors.text.primary,
    fontFamily: theme.typography.family.display,
    fontSize: theme.typography.size.xl,
  };
  const helperStyle = {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.size.bodySm,
    marginTop: theme.space.xs,
    marginBottom: theme.space.lg,
  };

  return (
    <Screen>
      <TitleBar title={`REGISTER  •  ${step}/3`} onBack={goBack} />
      <ProgressBar value={step / 3} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.body, { padding: theme.space.lg }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={headingStyle}>{STEP_TITLES[step]}</Text>
          <Text style={helperStyle}>{STEP_HELP[step]}</Text>

          {step === 1 ? (
            <>
              <RhfTextField
                control={control}
                name="userId"
                label="User ID"
                error={errors.userId?.message}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="6–12 letters or numbers"
              />
              <View style={styles.phoneRow}>
                <View style={styles.ccField}>
                  <RhfTextField
                    control={control}
                    name="mobileCc"
                    label="CC"
                    error={errors.mobileCc?.message}
                    keyboardType="phone-pad"
                    placeholder="+63"
                  />
                </View>
                <View style={styles.mobileField}>
                  <RhfTextField
                    control={control}
                    name="mobile"
                    label="Mobile"
                    error={errors.mobile?.message}
                    keyboardType="phone-pad"
                    placeholder="9205008429"
                  />
                </View>
              </View>
              <RhfTextField
                control={control}
                name="firstName"
                label="First name"
                error={errors.firstName?.message}
                autoCapitalize="words"
              />
              <RhfTextField
                control={control}
                name="lastName"
                label="Last name"
                error={errors.lastName?.message}
                autoCapitalize="words"
              />
              <RhfTextField
                control={control}
                name="email"
                label="Email"
                error={errors.email?.message}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="you@example.com"
              />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <RhfTextField
                control={control}
                name="password"
                label="Password"
                error={errors.password?.message}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <RhfTextField
                control={control}
                name="confirmPassword"
                label="Retype password"
                error={errors.confirmPassword?.message}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={() => void onSubmit()}
              />
            </>
          ) : null}

          {step === 3 ? (
            <RhfTextField
              control={control}
              name="pin"
              label="Validation PIN"
              error={errors.pin?.message}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="••••••"
              textContentType="oneTimeCode"
            />
          ) : null}

          {formError ? (
            <Text
              style={{
                color: theme.colors.text.error,
                fontSize: theme.typography.size.sm,
                marginTop: theme.space.sm,
              }}
            >
              {formError}
            </Text>
          ) : null}
        </ScrollView>

        <FunctionBar
          leftLabel="◂ BACK"
          rightLabel={step === 3 ? (submitting ? 'VERIFYING…' : 'VERIFY ▸') : 'NEXT ▸'}
          onLeftPress={goBack}
          onRightPress={() => {
            if (step === 3) void onSubmit();
            else void goNext();
          }}
          rightDisabled={submitting}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: {
    flexGrow: 1,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ccField: {
    width: 96,
  },
  mobileField: {
    flex: 1,
  },
});
