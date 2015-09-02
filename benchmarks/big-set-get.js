'use strict';

var fs = require('fs');
var path = require('path');

var Benchmark = require('benchmark');
var profiler = require('v8-profiler');

var Memcached = require('../');
var common = require('../test/common');

var CPUProfileDataModel = require('./cpu-profile');

var memcached = new Memcached(common.servers.single);

var largeString = fs.readFileSync(path.join(__dirname, '../test/fixtures/lipsum.txt'));

var largeSet = module.exports = new Benchmark.Suite();

largeSet.add('big-set-get', function(deferred) {
  function bail(err) {
    deferred.reject(err);
  }

  memcached.set('benchmark:big-set-get', largeString, 0, function(err) {
    if (err) {
      return bail(err);
    }
    memcached.get('benchmark:big-set-get', function(err) {
      if (err) {
        return bail(err);
      }
      deferred.resolve();
    });
  });
}, {
  defer: true
});

function isMetaFunctionName(functionName) {
  return functionName !== '(anonymous function)' &&
    /^\((.+)\)$/.test(functionName);
}

function getProfileStats(data) {
  var profile = new CPUProfileDataModel(data);

  var specialNodes = profile.profileHead.children
    .filter(function(child) {
      return isMetaFunctionName(child.functionName);
    });

  var specialTime = specialNodes
    .map(function(node) { return node.totalTime; })
    .reduce(function(a, b) { return a + b; }, 0);

  // TODO: Figure out how to handle that some profiles use ms
  // and others use seconds.

  return {
    totalTime: profile.profileHead.totalTime,
    specialTime: specialTime,
    cpuTime: profile.profileHead.totalTime - specialTime,
    breakdown: specialNodes.map(function(node) {
      return { name: node.functionName, totalTime: node.totalTime };
    })
  };
}

if (module === require.main) {
  largeSet
    .on('start', function(info) {
      profiler.startProfiling(process.version + '-' + info.target.name);
      console.error('Running: %s', info.target.name);
    })
    .on('cycle', function(info) {
      console.error('Done: %s', info.target.name);
    })
    .on('complete', function(info) {
      var profile = profiler.stopProfiling('');
      // console.log('%j', profile);
      console.error('profile:', getProfileStats(profile));
      profile.delete();
      process.exit(0);
    })
    .run();
}

/**
v2.5.0:
profile: { totalTime: 6218.688644886017,
  specialTime: 4143.5796884477495,
  cpuTime: 2075.1089564382673,
  breakdown: 
   [ { name: '(idle)', totalTime: 3986.9175919284176 },
     { name: '(program)', totalTime: 126.12626414691964 },
     { name: '(garbage collector)', totalTime: 30.535832372412123 } ] }

0.10.39:
profile: { totalTime: 5980.000,
  specialTime: 4804.624730550656,
  cpuTime: 1175.375269449344,
  breakdown: 
   [ { name: '(program)', totalTime: 4774.156378600823 },
     { name: '(garbage collector)', totalTime: 304.68351949833428 } ] }
 */
