module.exports = {
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: ['**/__tests__/**/*.test.(ts|tsx)'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^react-native$': '<rootDir>/src/__tests__/mocks/react-native.ts',
    '^expo$': '<rootDir>/src/__tests__/mocks/expo.ts',
    '^expo-.*$': '<rootDir>/src/__tests__/mocks/expo.ts',
    '^@react-native-async-storage/async-storage$': '<rootDir>/src/__tests__/mocks/async-storage.ts',
    '^@react-native-community/netinfo$': '<rootDir>/src/__tests__/mocks/netinfo.ts',
  },
  testEnvironment: 'node',
  transformIgnorePatterns: ['node_modules/'],
  setupFiles: [],
};
