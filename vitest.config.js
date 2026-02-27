/** @type {import('vitest/config').UserConfig} */
module.exports = {
  test: {
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    environment: 'node',
    globals: true,
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: [
        'src/core/**/*.js',
        'src/ipc-handlers.js',
        'src/preload-api.js',
        'src/recording-controller.js'
      ],
      exclude: [
        'coverage/**',
        'coverage-native/**',
        'tests/**'
      ]
    }
  }
};
