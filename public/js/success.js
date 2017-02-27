$(document).ready(function() {

	console.log('Ready');
	var data = {};

	var hash = window.location.hash;
	if(hash) {
		var s = hash.split('#');
		var params = s[1].split('&');

		for(var i=0; i<params.length; i++) {
			var p = params[i];
			parts = p.split('=');
			
			data[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
		}

		console.log(data);
	}

	$.post('/v1/sfdcconsumer/oauth/hashparams', data)
		.done(function(success){
			console.log("[success] " + JSON.stringify(success));
			console.log(window.location.hostname);
			// window.location.replace makes sure that the oauth callback link is not stored in browser history
			window.location.replace('https://' + window.location.hostname + '/v1/sfdcconsumer/admin');
		})
		.fail(function(err){
			console.log("[err] " +JSON.stringify(err));
		});
});
