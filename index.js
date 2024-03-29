const fs = require('fs-extra')
const dayjs = require('dayjs')
const path = require('path')
const assert = require('assert')
const async = require('async')

const {
  cmdOptions,
  optionDefinitions,
  tryCmdOptions,
  validateCmdOptions,
  usage
} = require('./cmdOptions')

if (cmdOptions.help || !validateCmdOptions()) {
  usage()
  process.exit(1)
}

const DIR_ENTRIES = []
const DIR_ENTRIES_NO_NEW_SUBDIR = []
const DIR_ENTRIES_NO_NEW_SUBDIR_HEAD = []
const STATS = {}
const DIRS = []

const PARALLEL = 1
if (cmdOptions['dry-run'] || cmdOptions.verbose) {
  console.log('Cmd options:\n%s\n', JSON.stringify(cmdOptions, null, 2))
}
let excludeDirPattern = new RegExp('^' + cmdOptions['dir-name-format'].replace(/Y|M|D/g, '\\d') + '$')
cmdOptions.profile && console.time('process')
fs.stat(cmdOptions.dir) // check if dir exist
  .then(res => fs.readdir(cmdOptions.dir)) // readdir
  .then(files => { // stat dir entries
    cmdOptions.profile && console.timeLog('process', 'readdir')
    files = files.sort()
    files.forEach(x => {
      DIR_ENTRIES.push(x)
      if (!excludeDirPattern.test(x))
        DIR_ENTRIES_NO_NEW_SUBDIR.push(x)
    })
    cmdOptions.profile && console.timeLog('process', 'filter exclude')
    DIR_ENTRIES_NO_NEW_SUBDIR.every((x, i) => {
      DIR_ENTRIES_NO_NEW_SUBDIR_HEAD.push(x)
      return (!cmdOptions['head'] || i < cmdOptions['head'] - 1)
    })
    cmdOptions.profile && console.timeLog('process', 'filter head')
    return async.mapLimit(
      DIR_ENTRIES.map(file => path.join(cmdOptions.dir, file)),
      PARALLEL,
      fs.stat
    )
  })
  .then(stats => { // generate uniq subdir list
    cmdOptions.profile && console.timeLog('process', 'stats')
    stats.forEach((x, i) => {
      STATS[DIR_ENTRIES[i]] = {
        mtime: x.mtime,
        isDirectory: x.isDirectory(),
        dirName: dayjs(x.mtime).format(cmdOptions['dir-name-format'])
      }
    })
    cmdOptions.profile && console.timeLog('process', 'stats1')
    let subdirsToCreate = new Set()
    for (let [ k, v ] of Object.entries(STATS)) {
      let existedEntryIndex = DIR_ENTRIES.indexOf(v.dirName)
      if (existedEntryIndex == -1 && DIR_ENTRIES_NO_NEW_SUBDIR_HEAD.indexOf(k) != -1)
        subdirsToCreate.add(v.dirName)
    }
    return Array.from(subdirsToCreate).sort()
  })
  .then(dirs => { //create subdirs
    dirs.forEach(x => DIRS.push(x))
    cmdOptions.profile && console.timeLog('process', 'make uniq')
    if (cmdOptions['dry-run']) {
      if (dirs.length) {
        let p = path.isAbsolute(cmdOptions.dir) ? cmdOptions.dir : path.join(process.cwd(), cmdOptions.dir)
        console.log(
          'Will create %s subdirectories in directory "%s":',
          dirs.length,
          p
        )
        dirs.slice(0, cmdOptions['head-dry-run'])
          .forEach((x, i) => console.log('  %s', x))
        if (dirs.length > cmdOptions['head-dry-run']) {
          console.log('  ...')
        }
        console.log()
      }
      return null
    } else {
      if (cmdOptions.verbose && dirs.length) {
        console.log('Creating directories:')
      }
      return async.eachLimit(
        dirs,
        PARALLEL,
        (x, cb) => {
          cmdOptions.verbose && console.log('%s', x, new Date(x))
          const dir = path.join(cmdOptions.dir, x)
          async.series([
            cb => fs.mkdir(dir, cb),
          ], cb)
        }
      )
    }
  })
  .then(res => { // move dir and files
    cmdOptions.profile && console.timeLog('process', 'create dirs')
    let copyList = DIR_ENTRIES_NO_NEW_SUBDIR_HEAD.map(
      (file, i) => ({ from: file, to: STATS[file].dirName })
    )
    if (cmdOptions['dry-run']) {
      let p = path.isAbsolute(cmdOptions.dir) ? cmdOptions.dir : path.join(process.cwd(), cmdOptions.dir)
      console.log('Will move %s file(s)/subdirectorie(s) in directory "%s" to subdir:',
        copyList.length,
        path.join(p)
      )
      copyList.slice(0, cmdOptions['head-dry-run'])
        .sort((a, b) => (a.to + a.from).localeCompare(b.to + b.from))
        .forEach(item => console.log(
          '  %s <- %s',
          item.to,
          item.from
        ))
      if (copyList.length > cmdOptions['head-dry-run']) {
        console.log('  ...')
      }
      console.log()
      return null
    } else {
      return async.eachLimit(
        copyList,
        PARALLEL,
        (item, cb) => {
          let from = path.join(cmdOptions.dir, item.from)
          let to = path.join(cmdOptions.dir, item.to, item.from)
          if (cmdOptions.verbose)
            console.log('Move %s -> %s', from, path.join(cmdOptions.dir, item.to))
          fs.rename(from, to, cb)
        }
      )
    }
  })
  .then(() => { // utime subdirs
    cmdOptions.profile && console.timeLog('process', 'move files')
    if (cmdOptions['dry-run'])
      return
    return async.eachSeries(
      DIRS,
      (dir, cb) => fs.utimes(
        path.join(cmdOptions.dir, dir),
        new Date(dir),
        new Date(dir),
        cb
      )
    )
  })
  .then(() => {
    cmdOptions.profile && console.timeLog('process', 'utime subdirs')
    cmdOptions.profile && console.timeEnd('process')
   })
  .catch(err => { console.error(err) })

