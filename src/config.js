'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.resolve(__dirname, '../config.json');

// Allows the config to be overriden
function setConfig(newConfig) {

};

// Defaults
var config = {
  debug: false,
  cache: {
    active: true,
    type: "google-cloud"
  }
};

// Load config from config.json if it exists and update default values
if (fs.existsSync(CONFIG_PATH)) {
  var fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH));
  assert(fileConfig instanceof Object);

  for(var p in fileConfig) {
    if( fileConfig.hasOwnProperty(p) ) {
      config[p] = fileConfig[p];
    }
  }
}

/**
 * Overrides configuration (used for tests)
 */
config.setConfig = function(newConfig) {
  const oldConfig = config;
  config = newConfig;
  config.chrome = oldConfig.chrome;
  config.port = oldConfig.port;
}

module.exports = config;