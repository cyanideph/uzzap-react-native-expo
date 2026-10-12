import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import { Alert } from 'react-native';

import type { MessageType } from '../types/models';
import type { OutboundWireMessage } from '../types/protocol';
import { wsClient } from './wsClient';

export interface MediaMessageInput {
  type: 'image' | 'voice' | 'location' | 'file';
  uri: string;
  mimeType?: string;
  fileName?: string;
  duration?: number; // for voice
  latitude?: number; // for location
  longitude?: number; // for location
  locationName?: string; // for location
}

export interface ProcessedMedia {
  type: MessageType;
  content: string;
  meta: Record<string, unknown>;
  protocol: 'im';
}

/**
 * Media handling service for images, voice messages, location, and files.
 */
export class MediaService {
  private recording: Audio.Recording | null = null;
  private sound: Audio.Sound | null = null;

  constructor() {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Permissions                                                            */
  /* ---------------------------------------------------------------------- */

  async requestCameraPermission(): Promise<boolean> {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === 'granted';
  }

  async requestMediaLibraryPermission(): Promise<boolean> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === 'granted';
  }

  async requestAudioPermission(): Promise<boolean> {
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
  }

  async requestLocationPermission(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  }

  /* ---------------------------------------------------------------------- */
  /* Image handling                                                         */
  /* ---------------------------------------------------------------------- */

  async pickImage(): Promise<ProcessedMedia | null> {
    const hasPermission = await this.requestMediaLibraryPermission();
    if (!hasPermission) {
      Alert.alert('Permission required', 'Please grant media library access to send images.');
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return null;

    const asset = result.assets[0];
    return {
      type: 'image',
      content: asset.uri,
      meta: {
        width: asset.width,
        height: asset.height,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      },
      protocol: 'im',
    };
  }

  async takePhoto(): Promise<ProcessedMedia | null> {
    const hasPermission = await this.requestCameraPermission();
    if (!hasPermission) {
      Alert.alert('Permission required', 'Please grant camera access to take photos.');
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return null;

    const asset = result.assets[0];
    return {
      type: 'image',
      content: asset.uri,
      meta: {
        width: asset.width,
        height: asset.height,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      },
      protocol: 'im',
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Voice recording                                                        */
  /* ---------------------------------------------------------------------- */

  async startRecording(): Promise<void> {
    const hasPermission = await this.requestAudioPermission();
    if (!hasPermission) {
      Alert.alert(
        'Permission required',
        'Please grant microphone access to record voice messages.',
      );
      throw new Error('Audio permission denied');
    }

    try {
      this.recording = new Audio.Recording();
      await this.recording.prepareToRecordAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        },
      });
      await this.recording.startAsync();
    } catch (error) {
      this.recording = null;
      throw error;
    }
  }

  async stopRecording(): Promise<ProcessedMedia | null> {
    if (!this.recording) return null;

    try {
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      const status = await this.recording.getStatusAsync();
      const duration = status.durationMillis ? Math.round(status.durationMillis / 1000) : 0;

      this.recording = null;

      if (!uri) return null;

      return {
        type: 'voice',
        content: uri,
        meta: {
          duration,
          mimeType: 'audio/m4a',
          fileName: `voice_${Date.now()}.m4a`,
        },
        protocol: 'im',
      };
    } catch (error) {
      this.recording = null;
      throw error;
    }
  }

  async playVoice(uri: string): Promise<void> {
    try {
      if (this.sound) {
        await this.sound.unloadAsync();
      }
      this.sound = new Audio.Sound();
      await this.sound.loadAsync({ uri }, { shouldPlay: true });
    } catch (error) {
      throw error;
    }
  }

  async stopPlayback(): Promise<void> {
    if (this.sound) {
      await this.sound.stopAsync();
      await this.sound.unloadAsync();
      this.sound = null;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Location sharing                                                       */
  /* ---------------------------------------------------------------------- */

  async getCurrentLocation(): Promise<ProcessedMedia | null> {
    const hasPermission = await this.requestLocationPermission();
    if (!hasPermission) {
      Alert.alert('Permission required', 'Please grant location access to share your location.');
      return null;
    }

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = location.coords;
      const locationName = await this.reverseGeocode(latitude, longitude);

      return {
        type: 'location',
        content: locationName || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        meta: {
          latitude,
          longitude,
          locationName,
          timestamp: Date.now(),
        },
        protocol: 'im',
      };
    } catch (error) {
      throw error;
    }
  }

  private async reverseGeocode(latitude: number, longitude: number): Promise<string> {
    try {
      const results = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (results.length > 0) {
        const r = results[0]!;
        return [r.name, r.street, r.city, r.region, r.country].filter(Boolean).join(', ');
      }
    } catch {
      // ignore
    }
    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  }

  /* ---------------------------------------------------------------------- */
  /* File picking                                                           */
  /* ---------------------------------------------------------------------- */

  async pickFile(): Promise<ProcessedMedia | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets[0]) return null;

      const asset = result.assets[0];
      return {
        type: 'file',
        content: asset.uri,
        meta: {
          mimeType: asset.mimeType,
          fileName: asset.name,
          size: asset.size,
        },
        protocol: 'im',
      };
    } catch (error) {
      throw error;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Sending media                                                          */
  /* ---------------------------------------------------------------------- */

  async sendMedia(
    recipientId: string,
    media: ProcessedMedia,
    _conversationId?: string,
  ): Promise<void> {
    const wireMessage: OutboundWireMessage = {
      to: recipientId,
      body: media.content,
      protocol: media.protocol as any,
      location: media.meta.locationName as string | undefined,
    };

    // For images/voice/files, we include metadata in the message
    // The legacy protocol uses the body for content and meta for additional data
    wsClient.sendMessage({
      ...wireMessage,
      msgId: `media_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Cleanup                                                                */
  /* ---------------------------------------------------------------------- */

  async cleanup(): Promise<void> {
    if (this.recording) {
      try {
        await this.recording.stopAndUnloadAsync();
      } catch {
        // ignore
      }
      this.recording = null;
    }
    if (this.sound) {
      try {
        await this.sound.unloadAsync();
      } catch {
        // ignore
      }
      this.sound = null;
    }
  }
}

export const mediaService = new MediaService();
