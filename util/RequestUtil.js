var https = require('https');

function Response(statusCode, statusMessage, body) {
	this.statusCode = statusCode;
	this.statusMessage = statusMessage;
	this.body = body;
}

module.exports = {

	send(options, body, cb) {

		var request = https.request(options, function(res) {
			res.setEncoding("UTF-8");
			
			var body = '';

			console.log(res.statusCode + " " + res.statusMessage);

			res.once('data', function(data) {
				//console.log("[once] " + data);
			});

			res.on('data', function(chunk) {
				body += chunk;
			});

			res.on('end', function() {
				console.log("[body] " + body);
				var response = new Response(res.statusCode, res.statusMessage, body);
				cb(null, response);
			});
		});	

		request.on('error', function(err){ 
			console.log(`[error] ${err}`);
			cb(err, null);
		});

		request.end(body);
	}
}