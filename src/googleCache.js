'use strict';

const config = require('./config');
const datastore = require('@google-cloud/datastore')();

/**
 * Parse the headers and payload
 * @param {String} resultHeaders
 * @param {String} resultPayload
 * @return {object}
 */
function parsingContent(resultHeaders, resultPayload) {
  let headers = JSON.parse(resultHeaders);
  let payload = JSON.parse(resultPayload);
  if (payload && typeof(payload) == 'object' && payload.type == 'Buffer')
    payload = new Buffer(payload);
  return {headers, payload};
}

class GoogleCache {
  clearCache() {
    const query = datastore.createQuery('Page');
    const data = datastore.runQuery(query);
    const entities = data[0];
    const entityKeys = entities.map((entity) => entity[datastore.KEY]);
    console.log(`Removing ${entities.length} items from the cache`);
    datastore.delete(entityKeys);
    // // TODO(samli): check info (data[1]) and loop through pages of entities to delete.
  }

  async set(key, headers, payload) {
    let expirationTimeInSeconds = config.cache.expirationTimeoutInSeconds;

    const now = new Date();
    const finalKey = datastore.key(['Page', key]);
    const entity = {
      key: finalKey,
      data: [
        {name: 'saved', value: now},
        {name: 'expires', value: new Date(now.getTime() + expirationTimeInSeconds*1000)},
        {name: 'headers', value: JSON.stringify(headers), excludeFromIndexes: true},
        {name: 'payload', value: JSON.stringify(payload), excludeFromIndexes: true},
      ]
    };
    datastore.save(entity);
  }

  get(url) {
    const key = datastore.key(['Page', url]);
    const results = datastore.get(key);

    // Cache based on full URL. This means requests with different params are
    // cached separately.
    if (results.length && results[0] != undefined) {
      // Serve cached content if its not expired.
      if (results[0].expires.getTime() >= new Date().getTime()) {
        return parsingContent(results[0].headers, results[0].payload);
      }
    }
  }
}

module.exports = new GoogleCache();