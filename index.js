//
// This is an example of a url-routing middleware.
// This is not intended for production use, but rather as
// an example of how to write a middleware.
//

var fs = require('fs');

function getMatchers(urls) {
  var matchers = [],
      matcher,
      url,
      r;

  for (url in urls) {
    // Call the 'matcher' function above, and store the resulting closure.
    // First, turn the URL into a regex.  
    // NOTE: Turning user input directly into a Regular Expression is NOT SAFE.
    r = new RegExp(url.replace(/\//, '^\\/'));
    // This next block of code may look a little confusing. 
    // It returns a closure (anonymous function) for each URL to be matched,
    // storing them in an array - on each request, if the URL matches one that has
    // a function stored for it, the function will be called.
    matcher = (function(r) {
      var dest = urls[url];
      return function (url) {
        var m = url.match(r);
        if (!m) {
          return;
        }
        var path = url.slice(m[0].length + 1);
        console.log('proxy:', url, '->', dest);
        return ({url: path, dest: dest});
      }})(r);
    matchers.push(matcher);
  }
  return matchers;
}

module.exports = function (urls) {
  var matchers,
      urlFile;
  if (typeof urls === 'string') {
    //
    // If we are passed a string then assume it is a
    // file path, parse that file and watch it for changes
    //
    urlsFile = urls,
    urls = JSON.parse(fs.readFileSync(urlsFile));
    fs.watchFile(urlsFile, function () {
      var self = this;
      console.log("Reloading urls...");
      fs.readFile(urlsFile, function (err, data) {
        if (err) {
          self.emit('error', err);
        }
        urls = JSON.parse(data);
        matchers = getMatchers(urls);
      });
    });
  }
  matchers = getMatchers(urls);

  // This closure is returned as the request handler.
  middleware = function (req, res, next) {
    //
    // in node-http-proxy middlewares, `proxy` is the prototype of `next`
    // (this means node-http-proxy middlewares support both the connect API (req, res, next)
    // and the node-http-proxy API (req, res, proxy)
    //
    var proxy = next;
    for (var k in matchers) {
      // for each URL matcher, try the request's URL.
      var m = matchers[k](req.url);
      // If it's a match:
      if (m) {
        // Replace the local URL with the destination URL.
        req.url = m.url;
        // If routing to a server on another domain, the hostname in the request must be changed.
        req.headers.host = m.host;
        // Once any changes are taken care of, this line makes the magic happen.
        return proxy.proxyRequest(req, res, m.dest);
      }
    }
    next() //if there wasno matching rule, fall back to next middleware.
  }

  // this closure is attached to the request handler for websocket proxying
  middleware.proxyWebSocketRequest = function (req, socket, head, next) {
    //
    // Same as above, but for WebSocket
    //
    console.log("Websocket proxying : " + req.url);
    var proxy = next;
    for (var k in matchers) {
      // for each URL matcher, try the request's URL.
      var m = matchers[k](req.url);
      // If it's a match:
      if (m) {
        // Replace the local URL with the destination URL.
        req.url = m.url;
        // If routing to a server on another domain, the hostname in the request must be changed.
        req.headers.host = m.host;
        // Once any changes are taken care of, this line makes the magic happen.
        return proxy.proxyWebSocketRequest(req, socket, head, m.dest);
      }
    }
    next() //if there wasno matching rule, fall back to next middleware.
  }
  
  return middleware;
}