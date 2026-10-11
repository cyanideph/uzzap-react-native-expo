const storage: Record<string, string> = {};

module.exports = {
  getItem: jest.fn((key: string) => Promise.resolve(storage[key] ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    storage[key] = value;
    return Promise.resolve();
  }),
  removeItem: jest.fn((key: string) => {
    delete storage[key];
    return Promise.resolve();
  }),
  clear: jest.fn(() => {
    Object.keys(storage).forEach((k) => delete storage[k]);
    return Promise.resolve();
  }),
  getAllKeys: jest.fn(() => Promise.resolve(Object.keys(storage))),
  multiGet: jest.fn((keys: string[]) => Promise.resolve(keys.map((k) => [k, storage[k] ?? null]))),
  multiSet: jest.fn((entries: [string, string][]) => {
    entries.forEach(([k, v]) => (storage[k] = v));
    return Promise.resolve();
  }),
  multiRemove: jest.fn((keys: string[]) => {
    keys.forEach((k) => delete storage[k]);
    return Promise.resolve();
  }),
};
