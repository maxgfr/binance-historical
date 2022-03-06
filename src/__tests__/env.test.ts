describe('Environment unit testing', () => {
  it('should display the environment variable', () => {
    expect(process.env.MY_VARIABLE).toBe('AZERTY');
  });
});
