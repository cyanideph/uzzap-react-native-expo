import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppInput, Screen, TitleBar } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/theme';
import { contactService, saveContact } from '@/services/contactService';

export default function AddBuddyScreen(): React.ReactElement {
  const { theme: _theme } = useTheme();
  const { user: _user } = useAuth();

  const [tab, setTab] = useState<'userId' | 'phone' | 'qr'>('userId');
  const [userId, setUserId] = useState('');
  const [phoneCc, setPhoneCc] = useState('+63');
  const [phone, setPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<{ userId: string; displayName: string; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearchUserId = async (): Promise<void> => {
    if (!userId.trim()) {
      setError('Enter a User ID');
      return;
    }
    setSearching(true);
    setError(null);
    setResult(null);
    try {
      const buddy = await contactService.getContact(userId.trim());
      if (buddy) {
        setResult({ userId: buddy.userId, displayName: buddy.displayName, status: buddy.status });
      } else {
        setResult({ userId: userId.trim(), displayName: userId.trim(), status: 'offline' });
      }
    } catch {
      setError('Failed to search. Check connection.');
    } finally {
      setSearching(false);
    }
  };

  const handleSearchPhone = async (): Promise<void> => {
    const fullPhone = `${phoneCc}${phone}`.replace(/\s/g, '');
    if (!fullPhone.match(/^\+\d{8,15}$/)) {
      setError('Enter a valid mobile number');
      return;
    }
    setSearching(true);
    setError(null);
    setResult(null);
    try {
      const buddy = await contactService.getContact(fullPhone);
      if (buddy) {
        setResult({ userId: buddy.userId, displayName: buddy.displayName, status: buddy.status });
      } else {
        setResult({ userId: fullPhone, displayName: fullPhone, status: 'offline' });
      }
    } catch {
      setError('Failed to search. Check connection.');
    } finally {
      setSearching(false);
    }
  };

  const handleAddBuddy = async (): Promise<void> => {
    if (!result) return;
    setError(null);
    try {
      await saveContact({
        userId: result.userId,
        displayName: result.displayName,
        phoneNumber: tab === 'phone' ? `${phoneCc}${phone}`.replace(/\s/g, '') : undefined,
      });
      Alert.alert('Success', `${result.displayName} added to your buddies!`);
      router.back();
    } catch {
      setError('Failed to add buddy. Try again.');
    }
  };

  const handleInvite = async (): Promise<void> => {
    if (!result) return;
    Alert.alert(
      'Invite to Uzzap',
      `Send an invitation to ${result.userId}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send SMS', onPress: () => Alert.alert('SMS', 'SMS invitation would be sent here') },
        { text: 'Share Link', onPress: () => Alert.alert('Share', 'Share link would be sent here') },
      ]
    );
  };

  return (
    <Screen edges={['top']}>
      <TitleBar title="ADD BUDDY" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.tabBar}>
            {(['userId', 'phone', 'qr'] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => { setTab(t); setError(null); setResult(null); }}
                style={[
                  styles.tab,
                  tab === t && styles.tabActive,
                ]}
              >
                <Text style={[
                  styles.tabLabel,
                  tab === t ? styles.tabLabelActive : styles.tabLabelInactive,
                ]}>
                  {t === 'userId' ? 'USER ID' : t === 'phone' ? 'PHONE' : 'QR CODE'}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === 'userId' && (
            <>
              <AppInput
                label="User ID"
                value={userId}
                onChangeText={setUserId}
                placeholder="Enter Uzzap User ID"
                autoCapitalize="none"
                autoCorrect={false}
                error={error}
                onSubmitEditing={handleSearchUserId}
              />
<AppButton
                label={searching ? 'SEARCHING…' : 'SEARCH'}
                onPress={handleSearchUserId}
                disabled={searching || !userId.trim()}
                fullWidth
                style={{ marginTop: 12 }}
              />
            </>
          )}

          {tab === 'phone' && (
            <>
              <AppInput
                label="Country Code"
                value={phoneCc}
                onChangeText={setPhoneCc}
                placeholder="+63"
                keyboardType="phone-pad"
                style={styles.smallInput}
              />
              <AppInput
                label="Mobile Number"
                value={phone}
                onChangeText={setPhone}
                placeholder="9205008429"
                keyboardType="phone-pad"
                error={error}
                onSubmitEditing={handleSearchPhone}
              />
              <AppButton
                label={searching ? 'SEARCHING…' : 'SEARCH'}
                onPress={handleSearchPhone}
                disabled={searching || !phone.trim()}
                fullWidth
                style={{ marginTop: 12 }}
              />
            </>
          )}

          {tab === 'qr' && (
            <View style={styles.qrSection}>
              <Text style={styles.qrTitle}>QR CODE SCANNER</Text>
              <View style={styles.qrViewfinder}>
                <View style={styles.qrCorners} />
                <Text style={styles.qrPlaceholder}>
                  Point camera at buddy's QR code
                </Text>
              </View>
              <Text style={styles.qrNote}>
                Requires camera permission. Feature requires dev build with native module.
              </Text>
              <Pressable
                onPress={() => Alert.alert('My QR', 'Show your QR code to let others add you easily.')}
                style={styles.qrMyCode}
              >
                <Text style={styles.qrMyCodeText}>SHOW MY QR CODE</Text>
              </Pressable>
            </View>
          )}

          {result && (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <View style={styles.resultAvatar}>
                  <Text style={styles.resultInitial}>
                    {(result.displayName.charAt(0) || '?').toUpperCase()}
                  </Text>
                </View>
                <View style={styles.resultInfo}>
                  <Text style={styles.resultName}>{result.displayName}</Text>
                  <Text style={styles.resultStatus}>
                    {result.status === 'offline' ? 'Offline' : result.status.charAt(0).toUpperCase() + result.status.slice(1)}
                  </Text>
                </View>
              </View>
              <View style={styles.resultActions}>
                <AppButton
                  label={tab === 'phone' && result.status === 'offline' ? 'INVITE VIA SMS' : 'ADD BUDDY'}
                  onPress={tab === 'phone' && result.status === 'offline' ? handleInvite : handleAddBuddy}
                  variant={tab === 'phone' && result.status === 'offline' ? 'secondary' : 'primary'}
                  fullWidth
                />
              </View>
            </View>
          )}

          {error && !result && (
            <Text style={styles.errorText}>{error}</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    padding: 16,
    gap: 20,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#FF7A1A',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  tabLabelActive: {
    color: '#14161A',
  },
  tabLabelInactive: {
    color: '#888',
  },
  smallInput: {
    width: 96,
  },
  qrSection: {
    alignItems: 'center',
    gap: 16,
  },
  qrTitle: {
    color: '#FF7A1A',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  qrViewfinder: {
    width: 240,
    height: 240,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FF7A1A',
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCorners: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    bottom: 12,
    borderWidth: 2,
    borderColor: '#FF7A1A',
    borderRadius: 8,
  },
  qrPlaceholder: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  qrNote: {
    color: '#666',
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  qrMyCode: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#333',
  },
  qrMyCodeText: {
    color: '#FF7A1A',
    fontSize: 14,
    fontWeight: '700',
  },
  resultCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#333',
    gap: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resultAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultInitial: {
    color: '#FF7A1A',
    fontSize: 20,
    fontWeight: '700',
  },
  resultInfo: {
    flex: 1,
    gap: 2,
  },
  resultName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultStatus: {
    color: '#888',
    fontSize: 12,
  },
  resultActions: {
    marginTop: 4,
  },
  errorText: {
    color: '#E5484D',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
});
