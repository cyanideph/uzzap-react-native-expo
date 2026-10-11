module.exports = {
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() =>
    Promise.resolve({ type: 'wifi', isConnected: true, isInternetReachable: true }),
  ),
  useNetInfo: () => ({ type: 'wifi', isConnected: true, isInternetReachable: true }),
};
