/**
 * Service layer — single entry point.
 *
 * Groups the raw-TCP engine, protobuf codecs, domain services and the offline
 * queue so screens/hooks can import from `@services` (or `../services`)
 * without reaching into individual modules.
 */

export * from './protobuf';
export * from './wsClient';
export * from './offlineQueue';
export * from './supabaseClient';
export * from './authService';
export * from './contactService';
export * from './messageService';
export * from './chatRoomService';
export * from './mediaService';
export * from './presenceService';
export * from './settingsService';
export * from './pushService';
export * from './smsValidationService';
export * from './e2eEncryptionService';
