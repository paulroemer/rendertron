/*
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

'use strict';

const config = require('./config');
const elastiCache = require('./elastiCache');
const googleCache = require('./googleCache');

class CacheManager {
  constructor() {
    // select configured cache, Google cloud is default
    if(config.cache.type === 'elastiCache') {
      this.cache = elastiCache;
    } else {
      this.cache = googleCache;
    }
  }

  async clearCache() {
    this.cache.clearCache();
  }

  /**
   * Returns middleware function.
   * @return {function}
   */
  middleware() {
    return async function(request, response, next) {
      function accumulateContent(content) {
        if (typeof(content) === 'string') {
          body = body || '' + content;
        } else if (Buffer.isBuffer(content)) {
          if (!body) {
            body = new Buffer(0);
          }
          body = Buffer.concat([body, content], body.length + content.length);
        }
      }

      // check if we have a hit and return immediately
      const {headers, payload} = await this.cache.get(request.url);
      if(headers && payload) {
        response.set(headers);
        response.set('x-rendertron', "rendertron");
        response.set('x-rendertron-cached', "true");
        response.send(payload);
        return;
      }

      // not cached => configure "middleware" to intercept response to fill the cache with rendered results
      const methods = {
        write: response.write,
        end: response.end,
      };

      let body = null;

      response.write = function(content, ...args) {
        accumulateContent(content);
        return methods.write.apply(response, [content].concat(args));
      };

      response.end = async function(content, ...args) {
        if (response.statusCode == 200) {
          accumulateContent(content);

          this.cache.set(request.url, response.getHeaders(), body);
        }
        return methods.end.apply(response, [content].concat(args));
      }.bind(this);

      next();
    }.bind(this);
  }
}

// TODO(samli): Allow for caching options, like freshness options.
module.exports = new CacheManager();
