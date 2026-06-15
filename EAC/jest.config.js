// jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/migrations/**'],
  coverageThreshold: {
    global: { branches: 50, functions: 50, lines: 60, statements: 60 },
  },
};
