'use strict'

const commandLineArgs = require('command-line-args')
const commandLineUsage = require('command-line-usage')

const cmdOptions = tryCmdOptions()

function optionDefinitions() {
  return [
    { name: 'help', alias: 'h', type: Boolean, description: 'show this help' },
    { name: 'dir', alias: 'd', type: String, description: 'directory to proceed' },
    { name: 'dry-run', alias: 'n', type: Boolean, description: 'don\'t do anything, just show' },
    { name: 'head', type: Number, defaultValue: 0, description: 'process only first N items' },
    { name: 'head-dry-run', type: Number, defaultValue: 10, description: 'print only first N items with --dry-run' },
    { name: 'dir-name-format', type: String, defaultValue: 'YYYY-MM', description: 'format of subdirectories name: YYYY-MM or YYYY' },
    { name: 'verbose', alias: 'v', type: Boolean, description: 'show file operations while processing' },
    { name: 'profile', alias: 'p', type: Boolean, description: 'show execution time' },
  ]
}

function validateCmdOptions() {
  if (!cmdOptions.dir)
    return false
  if (cmdOptions['head'] < 0 || cmdOptions['head-dry-run'] < 0
    || cmdOptions['head'] == null || cmdOptions['head-dry-run'] == null)
    return false
  if (!(['YYYY-MM', 'YYYY'].includes(cmdOptions['dir-name-format'])))
    return false
  return true
}

function tryCmdOptions() {
  let args
  try {
    args = commandLineArgs(optionDefinitions())
  } catch (e) {
    console.error(e.message)
    usage()
    process.exit(1)
  }
  return args
}

function usage() {
  const optionList = optionDefinitions()
  const usage = commandLineUsage([
    {
      header: 'Reorganize files and subdirectories.',
      content: 'Move each file and subdirectory in specified directory to subdirectory,\n'
        + 'which name generated from last modification time of this file or subdir,\n'
        + `with default format '${optionList.find(x => x.name=='dir-name-format').defaultValue}'.`
    },
    {
      header: 'Options',
      optionList,
    },
    {
      content: 'Project home: {underline https://gitflic.ru/project/evgeen/}'
    }
  ])
  console.log(usage)
}
module.exports = { cmdOptions, tryCmdOptions, validateCmdOptions, usage }
