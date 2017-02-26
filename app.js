var express = require('express');
var bodyParser = require('body-parser');
var cors = require('cors');
var path = require('path');

var oAuthService = require('./services/OAuthService');
var consumerUtil = require('./util/ConsumerUtil');

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

app.use(function(req, res, next){
	console.log(`${req.method} request for ${req.url} `);
	next();
});


app.use(express.static('./public'));

app.use(cors());

app.get('/', function(req, res) {
	res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.use('/v1/sfdcconsumer', oAuthService);

// if no route is matched
app.use(function(req, res, next) {
	var err = new Error('Not Found');
	err.Status = 404;
	next(err);
});

app.set('port', process.env.PORT || 3000);

app.listen(app.get('port'), function() {
	console.log('Listening on port ' + app.get('port'));
});

process.on("error", function(err){
	console.log(err);
})