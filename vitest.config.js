/** @type {import('vitest/config').UserConfig} */
module.exports = {
  test: {
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    environment: 'node',
    globals: true,
    restoreMocks: true,
    clearMocks: true
  }
};
