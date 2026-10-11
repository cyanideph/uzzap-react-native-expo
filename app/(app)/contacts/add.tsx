import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';

import { AppButton, FunctionBar, Screen, TextField, TitleBar } from '@/components/ui';
import { contactService } from '@/services/contactService';
import { useTheme } from '@/theme';

export default function AddBuddyScreen(): React.ReactElement {
  const { theme } = useTheme();
  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const saveBuddy = async (): Promise<void> => {
    const id = userId.trim();
    if (!id) {
      Alert.alert('User ID required', 'Enter the Uzzap User ID of the buddy you want to add.');
      return;
    }

    setSaving(true);
    try {
      await contactService.saveContact({
        userId: id,
        displayName: displayName.trim() || id,
        phoneNumber: phoneNumber.trim() || undefined,
      });
      router.back();
    } catch (error) {
      Alert.alert(
        'Could not add buddy',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['top']}>
      <TitleBar title="ADD BUDDY" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label="Uzzap User ID *"
          value={userId}
          onChangeText={setUserId}
          placeholder="Enter User ID"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          editable={!saving}
        />
        <TextField
          label="Display Name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Optional name shown in your buddy list"
          autoCapitalize="words"
          returnKeyType="next"
          editable={!saving}
        />
        <TextField
          label="Mobile Number"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          placeholder="Optional"
          keyboardType="phone-pad"
          editable={!saving}
        />
        <AppButton
          label={saving ? 'ADDING…' : 'ADD BUDDY'}
          onPress={() => void saveBuddy()}
          disabled={saving || !userId.trim()}
          loading={saving}
          style={{ marginTop: theme.space.sm }}
        />
      </ScrollView>
      <FunctionBar
        leftLabel="Cancel"
        onLeftPress={() => router.back()}
        rightLabel={saving ? 'Adding…' : 'Add'}
        onRightPress={() => void saveBuddy()}
        rightDisabled={saving || !userId.trim()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingTop: 20,
    flexGrow: 1,
  },
});
