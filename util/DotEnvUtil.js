var fs = require('fs');


function parse(content) {

	var envObj = {};
	// convert content to string before processing
	content.toString().split('\n').forEach(function(line) {

		var keyValues = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
		if(keyValues !== null) {
			var key = keyValues[1];

			var value = keyValues[2] ? keyValues[2] : '';

			// remove any surrounding quotes
			value = value.replace(/(^['"]|['"]$)/g, '').trim();

			envObj[key] = value; 
		}
	});
	return envObj;
}

function load(options) {

	var encoding  = 'UTF-8';
	var path = '.env';

	if(options) {
		path = options.path ? options.path : path;
		encoding = options.encoding ? options.encoding : encoding;
	}

	if(fs.existsSync(path)) {
		try {
			var envObj = parse(fs.readFileSync(path, {encoding: encoding}));
			
			Object.keys(envObj).forEach(function(key) {
				process.env[key] = envObj[key] || process.env[key];
			});

			return envObj;
		}
		catch(e) {
			console.log("[error] " + e);
			return e;
		}
	}
	else {
		fs.writeFileSync(path, '');
	}
}

module.exports = {
	load: load
}