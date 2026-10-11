// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Drizzle migrations are imported as `.sql` modules (see babel.config.js).
config.resolver.sourceExts.push('sql');

// `react-native-mmkv` ships a `.cjs` entry that Metro must resolve.
config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = false;

// Keep Expo/Metro's built-in cache stores. Metro requires CacheStore
// implementations with get/set/clear methods; plain configuration objects
// cause `TypeError: store.get is not a function` during bundle export.

// Faster minification
config.transformer.minifierConfig = {
  keep_fnames: true,
  mangle: { keep_fnames: true },
};

// Deterministic module IDs for better caching
config.serializer.createModuleIdFactory = () => (path) => path;

module.exports = config;
