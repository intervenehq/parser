const { expect } = require('@jest/globals');
const { describe } = require('node:test');
const someDummyFunction = (a) => {
  return a + ' ' + 'expected output';
};

describe('dummy testing', () => {
  test('does this work?', () => {
    const input = 'my input';
    const expectedOutput = `${input} expected output`;
    const output = someDummyFunction(input);
    expect(output).toBe(expectedOutput);
  });
});
