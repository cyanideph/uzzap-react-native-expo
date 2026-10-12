/**
 * Service layer — single entry point.
 *
 * Groups the Supabase backend client, domain services and the offline queue
 * so screens/hooks can import from `@services` (or `../services`) without
 * reaching into individual modules.
 *
 * Retired modules (`wsClient`, `wsClientWeb`, `protobuf`, `smsValidationService`)
 * were deleted during the Supabase cutover cleanup.
 */

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
export * from './e2eEncryptionService';
