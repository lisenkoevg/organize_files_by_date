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

const PARALLEL = 10
if (cmdOptions['dry-run'] || cmdOptions.verbose) {
  console.log('Cmd options:\n%s\n', JSON.stringify(cmdOptions, null, 2))
}
let excludeDirPattern = new RegExp('^' + cmdOptions['dir-name-format'].replace(/Y|M/g, '\\d') + '$')
fs.stat(cmdOptions.dir) // check if dir exist
  .then(res => fs.readdir(cmdOptions.dir)) // readdir
  .then(files => { // stat dir entries
    files = files.sort()
    files.forEach(x => {
      DIR_ENTRIES.push(x)
      if (!excludeDirPattern.test(x))
        DIR_ENTRIES_NO_NEW_SUBDIR.push(x)
    })
    DIR_ENTRIES_NO_NEW_SUBDIR.every((x, i) => {
      DIR_ENTRIES_NO_NEW_SUBDIR_HEAD.push(x)
      return (!cmdOptions['head'] || i < cmdOptions['head'] - 1)
    })
    return async.mapLimit(
      DIR_ENTRIES.map(file => path.join(cmdOptions.dir, file)),
      PARALLEL,
      fs.stat
    )
  })
  .then(stats => { // generate uniq subdir list
    stats.forEach((x, i) => {
      STATS[DIR_ENTRIES[i]] = {
        mtime: x.mtime,
        isDirectory: x.isDirectory(),
        dirName: dayjs(x.mtime).format(cmdOptions['dir-name-format'])
      }
    })

    let subdirsToCreate = new Set()
    for (let [ k, v ] of Object.entries(STATS)) {
      let existedEntryIndex = DIR_ENTRIES.indexOf(v.dirName)
      if (existedEntryIndex == -1 && DIR_ENTRIES_NO_NEW_SUBDIR_HEAD.indexOf(k) != -1)
        subdirsToCreate.add(v.dirName)
    }
    return Array.from(subdirsToCreate).sort()
  })
  .then(dirs => { //create subdirs
    if (cmdOptions['dry-run']) {
      if (dirs.length) {
        let p = path.isAbsolute(cmdOptions.dir) ? cmdOptions.dir : path.join(process.cwd(), cmdOptions.dir)
        console.log(
          'Create %s subdirectories in directory "%s":',
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
      let dirsTmp = dirs.map(x => path.join(cmdOptions.dir, x))
      if (cmdOptions.verbose && dirs.length) {
        console.log('Creating directories:')
      }
      let tmp = async.eachLimit(
        dirsTmp,
        PARALLEL,
        (x, cb) => {
          cmdOptions.verbose && console.log('%s', x)
          fs.mkdir(x, cb)
        }
      )
      return tmp
    }
  })
  .then(res => { // move dir and files
    let copyList = DIR_ENTRIES_NO_NEW_SUBDIR_HEAD.map(
      (file, i) => ({ from: file, to: STATS[file].dirName })
    )
    if (cmdOptions['dry-run']) {
      let p = path.isAbsolute(cmdOptions.dir) ? cmdOptions.dir : path.join(process.cwd(), cmdOptions.dir)
      console.log('Move %s file(s)/subdirectorie(s) in directory "%s" to subdir:',
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
  .catch(err => { console.error(err) })

