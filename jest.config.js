/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest'],
  },
  setupFiles: ['dotenv/config'],
  testPathIgnorePatterns: ['/node_modules/', '/build/'],
};
