const exec = require('child_process').exec

/**
 *
 * @param {IGrunt} grunt
 */
module.exports = function (grunt) {
  const tests = ['saga-core', 'saga-redis-repo', 'saga-redis-scheduler']

  function tscBuild(dir) {
    return new Promise((resolve, reject) => {
      exec(`tsc -b -v ${dir}`, (err, stdout, stderr) => {
        if (err) {
          reject(err + stderr)
        } else {
          resolve(stdout)
        }
      })
    })
  }

  function runTest(jss) {
    return new Promise((resolve, reject) => {
      exec(`npx mocha ${jss.join(' ')} --colors`, (err, stdout, stderr) => {
        if (err) {
          reject(err + stderr)
        } else {
          resolve(stdout)
        }
      })
    })
  }

  grunt.registerTask('buildTest', function () {
    // grunt.log.write('Logging some stuff...').ok()
    const done = this.async()

    Promise.all(tests.map((name) => `./tests/${name}`).map(tscBuild))
      .then((stdout) => grunt.log.writeln(stdout))
      .then(() => done(true))
      .catch((stderr) => grunt.log.errorlns(stderr))
      .then(() => done(false))
  })

  grunt.registerTask('runTest', function () {
    const done = this.async()

    // Promise.all(tests.map((name) => `./dist/tests/${name}.js`).map(runTest))
    runTest(tests.map((name) => `./dist/tests/${name}.js`))
      .then((stdout) => grunt.log.writeln(stdout))
      .then(() => done(true))
      .catch((stderr) => grunt.log.errorlns(stderr))
      .then(() => done(false))
  })

  grunt.registerTask('test', ['buildTest', 'runTest'])
}
