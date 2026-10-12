import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../theme';

/**
 * Minimal, token-driven UI primitives shared by the route screens.
 *
 * These exist so screens stay declarative and every value comes from the theme
 * (no raw hex). Visual polish / brand chrome is owned by the design system;
 * this module only provides functional building blocks.
 */

/* -------------------------------------------------------------------------- */
/* Screen shell                                                               */
/* -------------------------------------------------------------------------- */

export interface ScreenProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'right' | 'bottom' | 'left')[];
  padded?: boolean;
  testID?: string;
}

export function Screen({
  children,
  style,
  edges = ['top', 'bottom'],
  padded = false,
  testID,
}: ScreenProps): React.ReactElement {
  const { theme } = useTheme();
  return (
    <SafeAreaView
      testID={testID}
      style={[
        { flex: 1, backgroundColor: theme.colors.surface.base },
        padded && { paddingHorizontal: theme.space.lg },
        style,
      ]}
      edges={edges}
    >
      {children}
    </SafeAreaView>
  );
}

/* -------------------------------------------------------------------------- */
/* Title bar / function bar                                                   */
/* -------------------------------------------------------------------------- */

export interface TitleBarProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
}

export function TitleBar({ title, subtitle, right, onBack }: TitleBarProps): React.ReactElement {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.titleBar,
        {
          backgroundColor: theme.colors.chrome.bg,
          minHeight: theme.layout.titleBarHeight + 24,
          paddingHorizontal: theme.space.md,
        },
      ]}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          style={styles.titleBack}
        >
          <Text
            style={{
              color: theme.colors.chrome.text,
              fontSize: theme.typography.size.xl,
              lineHeight: theme.typography.size.xl,
            }}
          >
            {'‹'}
          </Text>
        </Pressable>
      ) : null}
      <View style={styles.titleTextWrap}>
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.chrome.text,
            fontFamily: theme.typography.family.display,
            fontSize: theme.typography.size.bodyLg,
            letterSpacing: 0.5,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{ color: theme.colors.chrome.bevelHi, fontSize: theme.typography.size.xs }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? null}
    </View>
  );
}

interface SoftkeyProps {
  label?: string;
  onPress?: () => void;
  disabled?: boolean;
  align: 'left' | 'right';
  testID?: string;
}

function Softkey({
  label,
  onPress,
  disabled,
  align,
  testID,
}: SoftkeyProps): React.ReactElement | null {
  const { theme } = useTheme();
  if (!label) return null;
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={[styles.softkey, align === 'right' && styles.softkeyRight]}
    >
      <Text
        style={{
          color: disabled ? theme.colors.text.disabled : theme.colors.chrome.text,
          fontSize: theme.typography.size.sm,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export interface FunctionBarProps {
  leftLabel?: string;
  rightLabel?: string;
  onLeftPress?: () => void;
  onRightPress?: () => void;
  leftDisabled?: boolean;
  rightDisabled?: boolean;
  leftTestID?: string;
  rightTestID?: string;
}

export function FunctionBar({
  leftLabel,
  rightLabel,
  onLeftPress,
  onRightPress,
  leftDisabled,
  rightDisabled,
  leftTestID,
  rightTestID,
}: FunctionBarProps): React.ReactElement {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.functionBar,
        {
          backgroundColor: theme.colors.chrome.bgAlt,
          borderTopColor: theme.colors.chrome.bevelLo,
        },
      ]}
    >
      <Softkey
        label={leftLabel}
        onPress={onLeftPress}
        disabled={leftDisabled}
        align="left"
        testID={leftTestID}
      />
      <Softkey
        label={rightLabel}
        onPress={onRightPress}
        disabled={rightDisabled}
        align="right"
        testID={rightTestID}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface AppButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  fullWidth = true,
}: AppButtonProps): React.ReactElement {
  const { theme } = useTheme();
  const isDisabled = Boolean(disabled) || Boolean(loading);

  const palette = {
    primary: {
      bg: theme.colors.brand.primary,
      fg: theme.colors.brand.onPrimary,
      border: 'transparent',
    },
    secondary: {
      bg: theme.colors.surface.alt,
      fg: theme.colors.text.primary,
      border: theme.colors.border.divider,
    },
    ghost: { bg: 'transparent', fg: theme.colors.brand.primary, border: 'transparent' },
    danger: {
      bg: theme.colors.semantic.danger,
      fg: theme.colors.text.inverse,
      border: 'transparent',
    },
  }[variant];

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      style={({ pressed }) => [
        {
          minHeight: theme.layout.minTouchTarget,
          borderRadius: theme.radius.card,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: theme.space.lg,
          backgroundColor: palette.bg,
          borderWidth: theme.stroke.hairline,
          borderColor: palette.border,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        fullWidth && { alignSelf: 'stretch' },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text
          style={{
            color: palette.fg,
            fontSize: theme.typography.size.bodyLg,
            fontWeight: '600',
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Text field                                                                 */
/* -------------------------------------------------------------------------- */

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
}

export const TextField = React.forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, style, containerStyle, ...rest },
  ref,
) {
  const { theme } = useTheme();
  const [focused, setFocused] = React.useState(false);
  const hasError = Boolean(error);
  const borderColor = hasError
    ? theme.colors.text.error
    : focused
      ? theme.colors.border.inputFocus
      : theme.colors.border.input;

  return (
    <View style={[{ marginBottom: theme.space.md }, containerStyle]}>
      {label ? (
        <Text
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.size.sm,
            marginBottom: theme.space.xs,
          }}
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        ref={ref}
        {...rest}
        placeholderTextColor={theme.colors.text.disabled}
        style={[
          {
            height: theme.layout.inputHeight,
            borderRadius: theme.radius.card,
            borderWidth: theme.stroke.hairline,
            borderColor,
            paddingHorizontal: theme.space.md,
            color: theme.colors.text.primary,
            backgroundColor: theme.colors.surface.base,
            fontSize: theme.typography.size.body,
          },
          style,
        ]}
        onFocus={(event) => {
          setFocused(true);
          rest.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          rest.onBlur?.(event);
        }}
      />
      {error ? (
        <Text
          style={{
            color: theme.colors.text.error,
            fontSize: theme.typography.size.xs,
            marginTop: theme.space.xs,
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/* Lists                                                                      */
/* -------------------------------------------------------------------------- */

export function SectionHeader({ title }: { title: string }): React.ReactElement {
  const { theme } = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface.alt,
        paddingHorizontal: theme.space.lg,
        paddingVertical: theme.space.xs,
        minHeight: theme.layout.sectionHeaderHeight,
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: theme.colors.text.secondary,
          fontFamily: theme.typography.family.display,
          fontSize: theme.typography.size.sm,
          letterSpacing: 1,
        }}
      >
        {title}
      </Text>
    </View>
  );
}

export interface SettingRowProps {
  label: string;
  description?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}

export function SettingRow({
  label,
  description,
  right,
  onPress,
  disabled,
}: SettingRowProps): React.ReactElement {
  const { theme } = useTheme();

  const content = (
    <>
      <View style={styles.settingText}>
        <Text
          style={{
            color: disabled ? theme.colors.text.disabled : theme.colors.text.primary,
            fontSize: theme.typography.size.body,
          }}
        >
          {label}
        </Text>
        {description ? (
          <Text
            style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.size.sm,
              marginTop: 2,
            }}
          >
            {description}
          </Text>
        ) : null}
      </View>
      {right ??
        (onPress ? (
          <Text style={{ color: theme.colors.text.secondary, fontSize: theme.typography.size.lg }}>
            {'›'}
          </Text>
        ) : null)}
    </>
  );

  const rowStyle = [
    styles.settingRow,
    {
      minHeight: theme.layout.settingsRowHeight,
      borderBottomColor: theme.colors.border.divider,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={disabled ? undefined : onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled) }}
        style={({ pressed }) => [
          ...rowStyle,
          pressed && { backgroundColor: theme.colors.surface.alt },
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={rowStyle}>{content}</View>;
}

export interface CheckboxProps {
  checked: boolean;
  onToggle: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Checkbox({
  checked,
  onToggle,
  label,
  disabled,
}: CheckboxProps): React.ReactElement {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => {
        if (!disabled) onToggle(!checked);
      }}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      accessibilityLabel={label}
      style={styles.checkboxRow}
    >
      <View
        style={[
          styles.checkboxBox,
          {
            borderColor: checked ? theme.colors.brand.primary : theme.colors.border.input,
            backgroundColor: checked ? theme.colors.brand.primary : 'transparent',
          },
        ]}
      >
        {checked ? (
          <Text
            style={{
              color: theme.colors.brand.onPrimary,
              fontSize: theme.typography.size.sm,
              lineHeight: theme.typography.size.sm,
            }}
          >
            {'✓'}
          </Text>
        ) : null}
      </View>
      <Text style={{ color: theme.colors.text.primary, fontSize: theme.typography.size.body }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Feedback                                                                   */
/* -------------------------------------------------------------------------- */

export function ProgressBar({ value }: { value: number }): React.ReactElement {
  const { theme } = useTheme();
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View style={[styles.progressTrack, { backgroundColor: theme.colors.surface.alt }]}>
      <View
        style={{
          width: `${clamped * 100}%` as `${number}%`,
          height: '100%',
          backgroundColor: theme.colors.brand.primary,
        }}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Alert Dialog                                                               */
/* -------------------------------------------------------------------------- */

export interface AlertDialogProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  content: React.ReactNode;
  actions: { text: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' }[];
}

export function AlertDialog({
  visible,
  onClose,
  title,
  content,
  actions,
}: AlertDialogProps): React.ReactElement | null {
  useTheme();
  if (!visible) return null;
  return (
    <View style={styles.alertOverlay} onStartShouldSetResponder={() => true}>
      <View style={styles.alertContainer}>
        <Text style={styles.alertTitle}>{title}</Text>
        {content}
        <View style={styles.alertActions}>
          {actions.map((action, index) => (
            <AppButton
              key={index}
              label={action.text}
              onPress={() => {
                action.onPress();
                onClose();
              }}
              variant={action.variant ?? 'primary'}
              fullWidth={false}
              style={styles.alertAction}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* App Input                                                                  */
/* -------------------------------------------------------------------------- */

export interface AppInputProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
  autoFocus?: boolean;
  error?: string | null;
  style?: StyleProp<ViewStyle>;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  onSubmitEditing?: () => void;
  maxLength?: number;
}

export function AppInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoFocus,
  error,
  style,
  autoCapitalize,
  autoCorrect,
  onSubmitEditing,
  maxLength,
}: AppInputProps): React.ReactElement {
  const { theme } = useTheme();
  const [focused, setFocused] = React.useState(false);
  const hasError = Boolean(error);
  const borderColor = hasError
    ? theme.colors.text.error
    : focused
      ? theme.colors.border.inputFocus
      : theme.colors.border.input;

  return (
    <View style={[{ marginBottom: theme.space.md }, style]}>
      {label ? (
        <Text
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.size.sm,
            marginBottom: theme.space.xs,
          }}
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.text.disabled}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        onSubmitEditing={onSubmitEditing}
        maxLength={maxLength}
        style={[
          {
            height: theme.layout.inputHeight,
            borderRadius: theme.radius.card,
            borderWidth: theme.stroke.hairline,
            borderColor,
            paddingHorizontal: theme.space.md,
            color: theme.colors.text.primary,
            backgroundColor: theme.colors.surface.base,
            fontSize: theme.typography.size.body,
          },
        ]}
        onFocus={() => {
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
        }}
      />
      {error ? (
        <Text
          style={{
            color: theme.colors.text.error,
            fontSize: theme.typography.size.xs,
            marginTop: theme.space.xs,
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty State                                                                */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}): React.ReactElement {
  const { theme } = useTheme();
  return (
    <View style={styles.emptyWrap}>
      <Text
        style={{
          color: theme.colors.text.primary,
          fontFamily: theme.typography.family.display,
          fontSize: theme.typography.size.lg,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {message ? (
        <Text
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.size.body,
            textAlign: 'center',
            marginTop: theme.space.sm,
          }}
        >
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <AppButton
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
          fullWidth={false}
          style={{ marginTop: theme.space.lg, paddingHorizontal: theme.space.xl }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  titleBack: {
    paddingRight: 8,
  },
  functionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  softkey: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    minWidth: 72,
  },
  softkeyRight: {
    alignItems: 'flex-end',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  settingText: {
    flex: 1,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 4,
    width: '100%',
    overflow: 'hidden',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  alertContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 320,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  alertTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  alertActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  alertAction: {
    minWidth: 80,
  },
});
