var async = require("async");
var lodash = require("lodash");
var redis = require("redis");

// TODO: redis pool // NOT NEEDED APPARENTLY
//       maybe some wrap lock
//       separated ttl for tags
//       allow not to cache result

function init(initOptions) {

	initOptions = lodash.defaults(initOptions || {}, {
		redis: {},
		prefix: ''
	})

	var client = redis.createClient(initOptions.redis);

	function get(key, callback) {
		client.get([initOptions.prefix, 'key', key].join(':'), function(err, data){
			if (err) {
				return callback(err);
			}
			if (data) {
				return callback(null, JSON.parse(data));
			}
			callback();
		});
	}

	function set(key, data, ttl, callback) {
		if (typeof ttl == 'function') {
			callback = ttl;
			ttl = undefined;
		}
		if (ttl) {
			client.setex([initOptions.prefix, 'key', key].join(':'), ttl, JSON.stringify(data), callback);
		} else {
			client.set([initOptions.prefix, 'key', key].join(':'), JSON.stringify(data), callback);
		}
	}

	function wrap(key, work, staticOptions, callback){
		if (typeof staticOptions == 'function') {
			callback = staticOptions;
			staticOptions = undefined;
		}
		get(key, function(err, data){
			if (err) {
				return callback(err);
			}
			if (data) {
				return callback(null, data);
			}
			try {
				work(function(err, data, options){
					if (err) {
						return callback(err);
					}
					options = lodash.defaults(options || {}, staticOptions, lodash.pick(initOptions, ['ttl']));
					// we use the ttl we received, or the one in the wrap function
					var multi = client.multi();
					if (options.ttl) {
						multi.setex([initOptions.prefix, 'key', key].join(':'), options.ttl, JSON.stringify(data));
					} else {
						multi.set([initOptions.prefix, 'key', key].join(':'), JSON.stringify(data));
					}
					if (options.tags) {
						options.tags.forEach(function(tagName){
							multi.rpush([initOptions.prefix, 'tag', tagName].join(':'), key);
							multi.expire([initOptions.prefix, 'tag', tagName].join(':'), options.ttl);
						})
					}
					multi.exec(function(err){
						if (err) {
							return callback(err);
						}
						callback(null, data);
					})
				});
			} catch (err) {
				callback(err);
			}
		});
	}

	function deleteKey(key, callback) {
		client.del([initOptions.prefix, 'key', key].join(':'), callback);
	}

	function deleteTags(tags, callback) {
		if (!Array.isArray(tags)) {
			tags = [tags];
		}
		async.each(tags, function(tagName, callback){
			client.lrange([initOptions.prefix, 'tag', tagName].join(':'), 0, -1, function(err, keys){
				if (err) {
					return callback(err);
				}
				var multi = client.multi();
				keys.forEach(function(key){
					multi.del([initOptions.prefix, 'key', key].join(':'));
				});
				multi.del([initOptions.prefix, 'tag', tagName].join(':'));
				multi.exec(callback);
			});
		}, callback);
	}

	return {
		wrap: wrap,
		get: get,
		set: set,
		deleteTags: deleteTags,
		deleteKey: deleteKey
	}

}

module.exports = init;

// var cache = init();
// cache.wrap("hola", function(callback){
// 	console.log("working")
// 	callback(null, 123, {tags: ['lala'], ttl: 5});
// }, function(err, data){
// 	console.log(err, data);
// 	cache.wrap("hola2", function(callback){
// 		console.log("working2")
// 		callback(null, 123, {tags: ['lala'], ttl: 7});
// 	}, function(err, data){
// 		console.log(err, data);
// 		cache.deleteTags('lala', function(err, data){
// 			console.log(err)
// 		})
// 	});
// })
