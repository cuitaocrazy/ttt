const exec = require('child_process').exec

/**
 *
 * @param {IGrunt} grunt
 */
module.exports = function (grunt) {

  grunt.registerTask('buildTest', function () {
    // grunt.log.write('Logging some stuff...').ok()
    const done = this.async()

    exec('tsc -b ./tests/saga-core', (err, stdout, stderr) => {
      if (err) {
        grunt.log.errorlns(stderr)
      } else {
        grunt.log.writeln(stdout)
      }
      done()
    })
  })

  grunt.registerTask('runTest', function () {
    const done = this.async()

    exec('npx mocha ./dist/tests/saga-core.js', (err, stdout, stderr) => {
      if (err) {
        grunt.log.errorlns(stderr)
      } else {
        grunt.log.writeln(stdout)
      }
      done()
    })
  })

  grunt.registerTask('test', ['buildTest', 'runTest'])
}
