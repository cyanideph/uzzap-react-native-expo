module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: [
      // Enables importing generated Drizzle `.sql` migrations and `theme.ini`
      // assets as strings at build time.
      ['inline-import', { extensions: ['.sql', '.ini'] }],
      // Must remain last.
      'react-native-reanimated/plugin',
    ],
  };
};
