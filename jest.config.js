/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        jsx: 'react-jsx',
        esModuleInterop: true,
        strictNullChecks: true,
        rootDir: '.',
      },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'lib/**/*.ts',
    'pages/api/**/*.ts',
    '!**/*.d.ts',
  ],
};
