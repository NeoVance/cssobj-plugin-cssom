// rollup.config.js
import {readFileSync} from 'fs'
import replace from 'rollup-plugin-replace'

var commitHash = (function () {
  try {
    return readFileSync('.commithash', 'utf-8').trim()
  } catch (err ) {
    return 'unknown'
  }
})()

var pkg = JSON.parse(readFileSync('package.json', 'utf8'))
var outro = readFileSync('./src/outro.js', 'utf8')
    .replace('<@VERSION@>', pkg.version)
    .replace('<@TIME@>', new Date())
    .replace('<@commitHash@>', commitHash)

export default {
  entry: 'src/cssobj-plugin-cssom.js',
  moduleName: 'cssobj_plugin_cssom',
  moduleId: 'cssobj_plugin_cssom',
  outro: outro,
  targets: [
    { format: 'iife', dest: 'dist/cssobj-plugin-cssom.iife.js' },
    { format: 'amd',  dest: 'dist/cssobj-plugin-cssom.amd.js'  },
    { format: 'cjs',  dest: 'dist/cssobj-plugin-cssom.cjs.js'  },
    { format: 'es',   dest: 'dist/cssobj-plugin-cssom.es.js'   }
  ]
}
