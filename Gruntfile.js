const exec = require('child_process').exec
const fs = require('fs')
const path = require('path')

const testProjectsDir = './tests'

/**
 * @type {Array<[string, string]>}
 */
const projectInfos = []

function getTestProjects() {
  if (projectInfos.length == 0) {
    const testProjects = fs.readdirSync(testProjectsDir)
    return testProjects.reduce((acc, name) => {
      const testProjectDir = path.join(testProjectsDir, name)
      const tsConfig = getTsConfig(testProjectDir)
      if (tsConfig.compilerOptions?.outFile) {
        acc.push([testProjectDir, path.join(testProjectDir, tsConfig.compilerOptions.outFile)])
      }
      return acc
    }, projectInfos)
  }
  return projectInfos
}

function getTsConfig(testProject) {
  try {
    const tsConfigPath = path.join(testProject, 'tsconfig.json')
    let tsConfig
    eval(`tsConfig = ${fs.readFileSync(tsConfigPath, 'utf8')}`)
    return tsConfig
  } catch (e) {
    return {}
  }
}

/**
 *
 * @param {IGrunt} grunt
 */
module.exports = function (grunt) {
  function tscBuild(dir) {
    return new Promise((resolve, reject) => {
      exec(`tsc -b -v ${dir}`, (err, stdout, stderr) => {
        if (err) {
          reject(stdout + err + stderr)
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
          reject(stdout + err + stderr)
        } else {
          resolve(stdout)
        }
      })
    })
  }

  grunt.registerTask('buildTest', function () {
    const done = this.async()

    Promise.all(getTestProjects().map(([dir, _]) => dir).map(tscBuild))
      .then((stdout) => grunt.log.writeln(stdout))
      .then(() => done(true))
      .catch((stderr) => grunt.log.errorlns(stderr))
      .then(() => done(false))
  })

  grunt.registerTask('runTest', function () {
    const done = this.async()

    runTest(getTestProjects().map(([_, js]) => js))
      .then((stdout) => grunt.log.writeln(stdout))
      .then(() => done(true))
      .catch((stderr) => grunt.log.errorlns(stderr))
      .then(() => done(false))
  })

  grunt.registerTask('test', ['buildTest', 'runTest'])
}
