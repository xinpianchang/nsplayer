import babel from 'rollup-plugin-babel'
import commonjs from 'rollup-plugin-commonjs'
import resolve from 'rollup-plugin-node-resolve'
import { terser } from 'rollup-plugin-terser'
import pkg from './package.json'

const extensions = ['.js', '.jsx', '.ts', '.tsx']

export default {
  input: 'src/index.ts',
  output: [
    {
      file: pkg.main,
      format: 'cjs'
    },
    {
      file: pkg.module,
      format: 'esm'
    },
    {
      name: pkg.name,
      file: pkg.browser,
      format: 'umd'
    }
  ],
  plugins: [
    resolve({ extensions }),
    commonjs(),
    babel({
      extensions,
      include: ['src/**/*']
    }),
    terser()
  ]
}
