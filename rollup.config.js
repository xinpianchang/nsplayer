import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import resolve from '@rollup/plugin-node-resolve'
import babel from '@rollup/plugin-babel'
import builtins from 'rollup-plugin-node-builtins'
import { terser } from 'rollup-plugin-terser'
import pkg from './package.json'

const extensions = ['.js', '.ts']

const makeExternalPredicate = externalArr => {
  if (externalArr.length === 0) {
    return () => false
  }
  const pattern = new RegExp(`^(${externalArr.join('|')})($|/)`)
  return id => pattern.test(id)
}

const onwarn = (warning, warn) => {
  if (warning.code === 'CIRCULAR_DEPENDENCY' && warning.importer.match(/readable-stream/)) {
    // ignore readable-stream error
    return
  }
  warn(warning)
}

// CommonJS
const cjs = {
  onwarn,
  input: 'src/index.ts',
  output: {
    dir: 'dist/cjs',
    format: 'cjs',
    indent: false,
    intro: 'var global = typeof self !== undefined ? self : this;',
    exports: 'default',
  },
  external: makeExternalPredicate([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
  ]),
  plugins: [
    json(),
    builtins(),
    resolve({
      extensions,
      preferBuiltins: false,
    }),
    commonjs({ sourceMap: false }),
    babel({
      extensions,
      include: ['src/**/*'],
      babelHelpers: 'runtime',
    }),
  ],
}

// ES Module
const ejs = {
  onwarn,
  input: 'src/index.ts',
  output: {
    dir: 'dist/esm',
    format: 'esm',
    indent: false,
    intro: 'var global = typeof self !== undefined ? self : this;',
  },
  external: makeExternalPredicate([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
  ]),
  plugins: [
    json(),
    builtins(),
    resolve({
      extensions,
      preferBuiltins: false,
    }),
    commonjs({ sourceMap: false }),
    babel({
      extensions,
      include: ['src/**/*'],
      babelHelpers: 'runtime',
    }),
  ],
}

// ES for browsers
const mjs = {
  onwarn,
  input: 'src/index.ts',
  output: {
    dir: 'dist/mjs',
    format: 'esm',
    indent: false,
    entryFileNames: '[name].mjs',
    chunkFileNames: '[name]-[hash].mjs',
    intro: 'var global = typeof self !== undefined ? self : this;',
  },
  plugins: [
    json(),
    builtins(),
    resolve({
      extensions,
      preferBuiltins: false,
    }),
    commonjs({ sourceMap: false }),
    babel({
      extensions,
      exclude: 'node_modules/**',
      include: ['src/**/*'],
      babelHelpers: 'runtime',
    }),
    terser(),
  ],
}

// eslint-disable-next-line prettier/prettier
export default [
  cjs,
  ejs,
  mjs,
]
