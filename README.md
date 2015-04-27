A tagged cache.

	cache.wrap("hola", function(callback){
		console.log("working")
		callback(null, 123, {tags: ['lala'], ttl: 5});
	}, function(err, data){
		console.log(err, data);
		cache.wrap("hola2", function(callback){
			console.log("working2")
			callback(null, 123, {tags: ['lala'], ttl: 7});
		}, function(err, data){
			console.log(err, data);
			cache.deleteTags('lala', function(err, data){
				console.log(err)
			})
		});
	})
