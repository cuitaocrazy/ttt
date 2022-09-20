const exec = require('child_process').exec
const fs = require('fs')
const path = require('path')

const testProjectsDir = './tests'
const projectsDir = './src'

/**
 * @type {Array<[string, string]>}
 */
const testProjectInfos = []

/**
 * @type {Array<[string, string]>}
 */
const projectInfos = []

/**
 *
 * @param {string} projectsDir
 * @param {Array<[string, string]>} cache
 * @returns {void}
 */
function fillProjectInfoCache(projectsDir, cache) {
  if (cache.length == 0) {
    const projectDirs = fs.readdirSync(projectsDir)
    return projectDirs.reduce((acc, name) => {
      const projectDir = path.join(projectsDir, name)
      const tsConfig = getTsConfig(projectDir)
      if (tsConfig.compilerOptions?.outFile) {
        acc.push([
          projectDir,
          path.join(projectDir, tsConfig.compilerOptions.outFile),
        ])
      }
      return acc
    }, cache)
  }
}

/**
 *
 * @param {string} testProject
 * @returns {{[key: string]: string}}
 */
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

function getTestProjects() {
  fillProjectInfoCache(testProjectsDir, testProjectInfos)
  return testProjectInfos
}

function getProjects() {
  fillProjectInfoCache(projectsDir, projectInfos)
  return projectInfos
}

/**
 *
 * @param {IGrunt} grunt
 */
module.exports = function (grunt) {
  /**
   *
   * @param {string} dir
   * @returns {Promise<string>}
   */
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

  /**
   *
   * @param {string[]} jss
   * @returns {Promise<string>}
   */
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

    Promise.all(
      getTestProjects()
        .map(([dir, _]) => dir)
        .map(tscBuild),
    )
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

  grunt.registerTask('clean', () => {
    fs.rmdirSync('dist', { recursive: true, force: true })
  })

  grunt.registerTask('build', function () {
    const done = this.async()

    Promise.all(
      getProjects()
        .map(([dir, _]) => dir)
        .map(tscBuild),
    )
      .then((stdout) => grunt.log.writeln(stdout))
      .then(() => done(true))
      .catch((stderr) => grunt.log.errorlns(stderr))
      .then(() => done(false))
  })
}
