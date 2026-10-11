// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Drizzle migrations are imported as `.sql` modules (see babel.config.js).
config.resolver.sourceExts.push('sql');

// `react-native-mmkv` ships a `.cjs` entry that Metro must resolve.
config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = false;

// Build performance: persistent filesystem cache + in-memory cache
config.cacheStores = [
  { name: 'memory', maxSize: 100 * 1024 * 1024 }, // 100MB in-memory
  { name: 'filesystem', root: '.metro-cache', maxSize: 500 * 1024 * 1024 }, // 500MB on disk
];

// Faster minification
config.transformer.minifierConfig = {
  keep_fnames: true,
  mangle: { keep_fnames: true },
};

// Deterministic module IDs for better caching
config.serializer.createModuleIdFactory = () => (path) => path;

module.exports = config;
