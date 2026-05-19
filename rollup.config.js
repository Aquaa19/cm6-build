import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/editor.js',
  output: [
    {
      // Outputs directly to the React Native Android assets directory
      file: '../nova-code/android/app/src/main/assets/editor/editor.bundle.js',
      format: 'iife',
      name: 'CMEditor'
    }
    // Note: If you run iOS later, you can add an additional output config here
  ],
  plugins: [
    nodeResolve({
      browser: true
    }),
    commonjs()
  ]
};
