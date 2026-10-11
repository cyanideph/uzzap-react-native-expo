describe('Utility functions', () => {
  describe('Simple string utilities', () => {
    it('should trim strings', () => {
      expect('  hello  '.trim()).toBe('hello');
    });

    it('should convert to lowercase', () => {
      expect('HELLO'.toLowerCase()).toBe('hello');
    });

    it('should check if string includes substring', () => {
      expect('hello world'.includes('world')).toBe(true);
    });
  });

  describe('Number utilities', () => {
    it('should format timestamp', () => {
      const ts = 1700000000;
      const date = new Date(ts * 1000);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      expect(`${hours}:${minutes}`).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  describe('Array utilities', () => {
    it('should filter array', () => {
      const arr = [1, 2, 3, 4, 5];
      expect(arr.filter((x) => x > 3)).toEqual([4, 5]);
    });

    it('should map array', () => {
      const arr = [1, 2, 3];
      expect(arr.map((x) => x * 2)).toEqual([2, 4, 6]);
    });

    it('should reduce array', () => {
      const arr = [1, 2, 3, 4];
      expect(arr.reduce((a, b) => a + b, 0)).toBe(10);
    });
  });

  describe('Object utilities', () => {
    it('should get object keys', () => {
      const obj = { a: 1, b: 2 };
      expect(Object.keys(obj)).toEqual(['a', 'b']);
    });

    it('should get object values', () => {
      const obj = { a: 1, b: 2 };
      expect(Object.values(obj)).toEqual([1, 2]);
    });
  });
});
