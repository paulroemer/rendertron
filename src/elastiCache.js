const config = require('./config');
const redis = require('ioredis');
const _ = require('lodash');
const renderer = require('./renderer');
require('dotenv').config();

const host = process.env.ELASTICACHE_CONFIGURATION_ENDPOINT || 'localhost';
const lazyConnect = process.env.LAZY_CONNECT == 'false' ? false : true;

// uncomment the line below if you want to use moment to set the cache deletion time
// const moment = require('moment-timezone');

// AWS ElastiCache with redis cluster mode
// uncomment the lines below and replace the host with your configuration endpoint
// change lazyConnect to true if you want redis client to connect to the redis server as soon as it's created
// with lazyConnect: true, it will only connect when running query against the redis database
// const redisClient = new redis.Cluster([
//   {host: host, port: 6379, lazyConnect: lazyConnect}
// ]);

// AWS ElastiCache with redis cluster mode OFF
// uncomment the lines below and replace the host with your node endpoint
// change lazyConnect to true if you want redis client to connect to the redis server as soon as it's created
// with lazyConnect: true, it will only connect when running query against the redis database
const redisClient = new redis({host: host, port: 6379, lazyConnect: lazyConnect});
const redisSubscriberClient = new redis({host: host, port: 6379, lazyConnect: lazyConnect});

let redisReady = false;

// detect if redis server is down
redisClient.on('error', function(err) {
  console.error(err);
  redisReady = false;
});

// detect if redis server is up
redisClient.on('ready', function(err) {
  console.log('redis is ready!');
  redisReady = true;
});

// redisSubscriberClient.on("ready", function (err) {
//   redisSubscriberClient.config("SET", "notify-keyspace-events", "AKE");
//   redisSubscriberClient.psubscribe('__key*__:*');
// })

redisSubscriberClient.on('message', function (channel, message) {
  if(channel === '__keyevent@0__:expired') {
    console.log("Page " + message + " expired. Refreshing...");

    try {
      var options = Object;
      options['wc-inject-shadydom'] = true;
      const url = message.replace("/render/", "");
      renderer.serialize(url, options, config)
        .then(function(result) {
          elastiCache.set(message, "{}", result.body);
        });
    } catch (err) {
      console.error('Cannot render requested URL anymore');
      console.error(err);
    }
  }
})

redisSubscriberClient.config("SET", "notify-keyspace-events", "Ex");
redisSubscriberClient.subscribe('__keyevent@0__:expired');

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

class ElastiCache {
  clearCache() {
    // TODO: for now do not delete at all but maybe this is a desired but configurable feature
  }

  /**
   * Cache render results to redis
   * @param {String} key
   * @param {String} headers
   * @param {String} payload
   */
  async set(key, headers, payload) {
    const pagePayload = JSON.stringify(payload);
    const pageHeaders = JSON.stringify(headers);

    const params = [
      key,
      'payload',
      pagePayload,
      'headers',
      pageHeaders
    ];

    // put the render result into cache
    redisClient.hmset(params, function(err, reply) {
      if (err) {
        console.error(err);
      } else {
        console.log("Cached: " + params[0]);
        // use the code below if you want the cache to live for a duration in terms of seconds
        // let expirationTimeInSeconds = Math.floor(Date.now()/1000) + cacheDurationMinutes*60*1000;
        let expirationTimeInSeconds = config.cache.expirationTimeoutInSeconds;

        // use the code below if you want to clear at a specific period of time
        // let end = Math.floor(moment.tz('America/New_York').endOf('day').valueOf()/1000);
        // let start = Math.floor(moment.tz('America/New_York').valueOf()/1000);
        // let expirationTimeInSeconds = end - start + Math.floor(Math.random()*3600);

        redisClient.expire(key, expirationTimeInSeconds, function(err, reply) {
          if (err) {
            console.error(err);
          }
        });
      };
    });
  }

  /**
   * Get cached rendering results from redis
   * @param {String} key
   * @return {Object}
   */
  get(key) {
    if (redisReady) {
      return redisClient.hgetall(key)
        .then(function(result) {
          if (!_.isEmpty(result)) {
            return parsingContent(result.headers, result.payload);
          }
          return false;
        })
        .catch(function(error) {
          console.error(error);
        });
    }
  }
}

var elastiCache = new ElastiCache();
module.exports = elastiCache;
