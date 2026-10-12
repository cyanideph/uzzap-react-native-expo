import { Platform } from 'react-native';

import { getString, setString, removeString } from '../storage/preferences';

/**
 * SMS Validation Listener for registration PIN codes.
 *
 * Per protocol spec §2: SMS validation messages are sent to the device
 * on port 50000 with format "Validation PIN: 12345" (5 digits).
 * The legacy app (`kalypte/bs.java`) listens on `sms://:50000`.
 *
 * Note: On modern Android/Expo, listening for incoming SMS requires
 * a development build with native modules (expo-sms only supports sending).
 * This implementation provides the interface and can be extended with
 * a native module in a dev build.
 */

const PENDING_REG_KEY = 'uzzap.sms.pending_registration';

export interface SmsValidationListener {
  startListening(): Promise<void>;
  stopListening(): void;
  isListening(): boolean;
}

export class SmsValidationService implements SmsValidationListener {
  private listening = false;

  async startListening(): Promise<void> {
    if (this.listening) return;

    if (Platform.OS !== 'android') {
      return;
    }

    // Note: expo-sms only supports sending SMS, not listening.
    // To listen for incoming SMS on a specific port, a development build
    // with a native module (e.g., react-native-get-sms-android) is required.
    // This is a placeholder for future native module integration.
    this.listening = true;
  }

  stopListening(): void {
    this.listening = false;
  }

  isListening(): boolean {
    return this.listening;
  }

  async setPendingRegistration(userId: string): Promise<void> {
    await setString(PENDING_REG_KEY, JSON.stringify({ userId, timestamp: Date.now() }));
  }

  async getPendingRegistration(): Promise<{ userId: string; timestamp: number } | null> {
    const raw = await getString(PENDING_REG_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async clearPendingRegistration(): Promise<void> {
    await removeString(PENDING_REG_KEY);
  }
}

export const smsValidationService = new SmsValidationService();
