import Boilerplate from '../src'

test('Boilerplate', () => {
  const BoilerplateFn = jest.fn(Boilerplate)
  expect(BoilerplateFn()).toBe('Boilerplate')
  expect(BoilerplateFn).toHaveBeenCalled()
})
