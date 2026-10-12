import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getString, removeString, setString } from '../storage/preferences';
import { supabase } from './supabaseClient';

/**
 * Push notification integration.
 *
 * On Android the native FCM registration token is obtained through
 * `expo-notifications` (`getDevicePushTokenAsync`), with the Expo push token as
 * a fallback (Expo Go / no google-services config). The token is persisted
 * locally and registered against the legacy `registry` target on connect.
 */

export interface PushRegistration {
  token: string;
  type: 'fcm' | 'apns' | 'expo';
  platform: string;
  registeredAt: number;
}

export interface NotificationRoute {
  conversationId?: string;
  messageId?: string;
  type?: string;
  raw: Record<string, unknown>;
}

const PUSH_TOKEN_KEY = 'uzzap.push.registration';
const ANDROID_CHANNEL_ID = 'messages';

export class PushService {
  private configured = false;

  /** Install the foreground handler and Android channel. Safe to call twice. */
  configure(): void {
    if (this.configured) return;
    this.configured = true;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    if (Platform.OS === 'android') {
      void Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF7A1A',
      });
    }
  }

  async registerForPush(): Promise<PushRegistration | null> {
    this.configure();

    const status = await this.ensurePermission();
    if (!status) return null;

    const registration = await this.acquireToken();
    if (!registration) return null;

    await setString(PUSH_TOKEN_KEY, JSON.stringify(registration));
    await this.sendTokenToServer(registration.token).catch(() => undefined);
    return registration;
  }

  async getStoredToken(): Promise<PushRegistration | null> {
    const raw = await getString(PUSH_TOKEN_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PushRegistration;
    } catch {
      return null;
    }
  }

  /** Best-effort registration of the device token on our own profile row. */
  async sendTokenToServer(token: string): Promise<void> {
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      await supabase
        .from('profiles')
        .update({ push_token: token, push_platform: Platform.OS })
        .eq('id', uid);
    } catch {
      // Best effort — local registration is what matters for notifications.
    }
  }

  async unregister(): Promise<void> {
    await removeString(PUSH_TOKEN_KEY);
    try {
      await Notifications.setBadgeCountAsync(0);
    } catch {
      // ignore — unsupported on some platforms
    }
  }

  async scheduleLocalNotification(
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<string> {
    this.configure();
    return Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: true },
      trigger: null,
    });
  }

  async setBadgeCount(count: number): Promise<void> {
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch {
      // ignore
    }
  }

  /** Map a tapped notification into a navigation route. */
  handleNotificationResponse(response: Notifications.NotificationResponse): NotificationRoute {
    const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
    return {
      conversationId: typeof data.conversationId === 'string' ? data.conversationId : undefined,
      messageId: typeof data.messageId === 'string' ? data.messageId : undefined,
      type: typeof data.type === 'string' ? data.type : undefined,
      raw: data,
    };
  }

  addResponseListener(
    listener: (route: NotificationRoute, response: Notifications.NotificationResponse) => void,
  ): Notifications.EventSubscription {
    return Notifications.addNotificationResponseReceivedListener((response) => {
      listener(this.handleNotificationResponse(response), response);
    });
  }

  addReceivedListener(
    listener: (notification: Notifications.Notification) => void,
  ): Notifications.EventSubscription {
    return Notifications.addNotificationReceivedListener(listener);
  }

  private async ensurePermission(): Promise<boolean> {
    try {
      const current = await Notifications.getPermissionsAsync();
      if (current.status === 'granted') return true;
      const requested = await Notifications.requestPermissionsAsync();
      return requested.status === 'granted';
    } catch {
      return false;
    }
  }

  private async acquireToken(): Promise<PushRegistration | null> {
    const registeredAt = Date.now();

    // Native FCM (Android) / APNs (iOS) token.
    try {
      const deviceToken = await Notifications.getDevicePushTokenAsync();
      return {
        token:
          typeof deviceToken.data === 'string'
            ? deviceToken.data
            : JSON.stringify(deviceToken.data),
        type: Platform.OS === 'ios' ? 'apns' : 'fcm',
        platform: Platform.OS,
        registeredAt,
      };
    } catch {
      // Fall through to the Expo push service (Expo Go / missing FCM config).
    }

    try {
      const projectId = this.getProjectId();
      const expoToken = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );
      return { token: expoToken.data, type: 'expo', platform: Platform.OS, registeredAt };
    } catch {
      return null;
    }
  }

  private getProjectId(): string | undefined {
    const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
    return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  }
}

export const pushService = new PushService();

export const registerForPush = (): Promise<PushRegistration | null> =>
  pushService.registerForPush();
export const unregisterPush = (): Promise<void> => pushService.unregister();
export const scheduleLocalNotification = (
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<string> => pushService.scheduleLocalNotification(title, body, data);
