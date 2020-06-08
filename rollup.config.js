import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import resolve from '@rollup/plugin-node-resolve'
import babel from '@rollup/plugin-babel'
// import nodePolyfills from 'rollup-plugin-node-polyfills'
import builtins from 'rollup-plugin-node-builtins'
// import replace from '@rollup/plugin-replace'
// import external from 'builtin-modules'
import { terser } from 'rollup-plugin-terser'
// import pkg from './package.json'

const extensions = ['.js', '.ts']

const onwarn = (warning, warn) => {
  if (warning.code === 'CIRCULAR_DEPENDENCY' && warning.importer.match(/readable-stream/)) {
    // ignore readable-stream error
    return
  }
  warn(warning)
}

export default [
  {
    onwarn,
    input: 'src/index.ts',
    output: [
      {
        dir: 'dist/cjs',
        format: 'cjs',
        intro: 'var global = typeof self !== undefined ? self : this;',
      },
      {
        dir: 'dist/esm',
        format: 'esm',
        intro: 'var global = typeof self !== undefined ? self : this;',
      },
    ],
    // external,
    plugins: [
      json(),
      builtins(),
      resolve({
        extensions,
        mainFields: ['jsnext:main', 'module', 'main'],
        browser: true,
        preferBuiltins: false,
      }),
      // replace({
      //   delimiters: ['', ''],
      //   values: {
      //     'require(\'readable-stream/transform\')': 'require(\'stream\').Transform',
      //     'require("readable-stream/transform")': 'require("stream").Transform',
      //     'readable-stream': 'stream'
      //   }
      // }),
      commonjs({
        sourceMap: false,
      }),
      babel({
        extensions,
        include: ['src/**/*'],
        babelHelpers: 'bundled',
      }),
      terser(),
    ],
  },
  // {
  //   input: 'src/index.ts',
  //   output: [
  //     {
  //       name: 'NSPlayer',
  //       file: pkg.browser,
  //       format: 'umd',
  //     },
  //   ],
  //   plugins: [
  //     json(),
  //     builtins(),
  //     resolve({ extensions, browser: true }),
  //     commonjs(),
  //     babel({
  //       extensions,
  //       include: ['src/**/*'],
  //       babelHelpers: 'bundled',
  //     }),
  //     terser(),
  //   ],
  // },
]
