var async = require("async");
var lodash = require("lodash");
var redis = require("redis");

// TODO: redis pool // NOT NEEDED APPARENTLY
//       maybe some wrap lock
//       separated ttl for tags
//       allow not to cache result

function init(initOptions) {

	var client = redis.createClient(initOptions || {});

	function get(key, callback) {
		client.get(['key', key].join(':'), function(err, data){
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
			client.setex(['key', key].join(':'), ttl, JSON.stringify(data), callback);
		} else {
			client.set(['key', key].join(':'), JSON.stringify(data), callback);
		}
	}

	function wrap(key, work, ttl, callback){
		if (typeof ttl == 'function') {
			callback = ttl;
			ttl = undefined;
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
					options = options || {};
					// we use the ttl we received, or the one in the wrap function
					var setTtl = options.ttl || ttl;;
					var multi = client.multi();
					if (setTtl) {
						multi.setex(['key', key].join(':'), setTtl, JSON.stringify(data));
					} else {
						multi.set(['key', key].join(':'), JSON.stringify(data));
					}
					if (options.tags) {
						options.tags.forEach(function(tagName){
							multi.rpush(['tag', tagName].join(':'), key);
							multi.expire(['tag', tagName].join(':'), setTtl);
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
		client.del(['key', key].join(':'), callback);
	}

	function deleteTags(tags, callback) {
		if (!Array.isArray(tags)) {
			tags = [tags];
		}
		async.each(tags, function(tagName, callback){
			client.lrange(['tag', tagName].join(':'), 0, -1, function(err, keys){
				if (err) {
					return callback(err);
				}
				var multi = client.multi();
				keys.forEach(function(key){
					multi.del(['key', key].join(':'));
				});
				multi.del(['tag', tagName].join(':'));
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
