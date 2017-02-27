var https = require('https');
var reqUtil = require('../util/RequestUtil');
var oAuthUtil = require('../util/OAuthUtil');
var dotEnv = require('../util/DotEnvUtil');

var SobjectsUtil = require('../util/SobjectsUtil');

// load the env vars from .env
dotEnv.load();

const path = '/services/data/v38.0';

console.log(process.env);

if(process.env.INSTANCE_URL) {
	const instanceUrl = process.env.INSTANCE_URL.replace('https://', '');
}

function InvalidSessionError(name, message) {
	this.name = name;
	this.message = message;
}

require('util').inherits(InvalidSessionError, Error);

// @description	This function makes a POST request to salesforce to create a new lead 
// @argument	data: JSON object containing project, user and event info
// @argument	cb: callback function
// @returns		call to a callback function with the following arguments:
//					err -  an error is returned in the callback if there was an error during the API call
//					data - String `created` returned as data if operation succeeds
var createNewLead = function createNewLead(data, cb) {

	// this must be local var unlike path and instanceUrl, to make sure we always have latest access_token
	var authHeader = `Bearer ${process.env.ACCESS_TOKEN}`;

	if(data.project) {
		// create a new lead object
		var lead = new SobjectsUtil.Lead(process.env.OWNER_ID, 'SmartCoder-Connect', data.project._id, data.user, 'Unknown');

		var options = {
		'hostname': instanceUrl,
			'path': `${path}/sobjects/Lead`,
			'method': 'POST',
			'headers': {
				'Authorization': authHeader,
				'Content-Type': 'application/json'
			}
		}	
	
		// reqUtil.send(request_options, request_body, callback{})
		reqUtil.send(options, JSON.stringify(lead), function(err, response) {
			if(err) {
				console.error("[error] Error creating a lead", err);
				return (cb(err));
			} 

			var body = response.body;
			body = JSON.parse(body);

			// lead was successfully created
			if(response.statusCode == 201 && body.success) {
				addLeadToCampaign(body.id);
				return (cb(null, 'Created'));
			}
			// if request is not authorized (token expired or invalid login)
			// Mark the amqp message to be redelivered (ch.recover) - Maybe use setTimeout so that by the time msg is redlivered, a new access token is available
			else if(response.statusCode == 401) {
				
				if(body instanceof Array) body = body[0];

				// get a new access token is existing one has expired / invalid
				if(body.errorCode.toLowerCase() === 'invalid_session_id') {
					// get new access token
					oAuthUtil.getAccessToken(function(done) {
						if(done) {
							// reload the env variables once new access token is updated
							dotEnv.load();
						}
					});
				}
				// callback with errorcode
				return (cb(new InvalidSessionError(body.errorCode, body.message), null));
			}
		}); //send
	}
}

// @description	This function adds a lead to a given campaign (essentially creates a campaign member) in Salesforce. 
// @argument	leadId: Salesforce Id for the lead record
// @argument	cb: callback function
// @returns		call to a callback function with the following arguments:
//					err -  an error is returned in the callback if there was an error during the API call
//					data - String `created` returned as data if operation succeeds
var addLeadToCampaign = function addLeadToCampaign(leadId, cb) {

	if(leadId) {
		var campaignMember = new SobjectsUtil.CampaignMember(leadId, '');
		
		var authHeader = `Bearer ${process.env.ACCESS_TOKEN}`;
		var options ={
			'hostname': instanceUrl,
			'path': `${path}/sobjects/CampaignMember`,
			'method': 'POST',
			'headers': {
				'Authorization': authHeader,
				'Content-Type': 'application/json'
			}
		}

		reqUtil.send(options, JSON.stringify(campaignMember), function(err, response) {
			if(err) {
				console.error('[err] Error creating CampaignMember', err);
			}

			var body = JSON.parse(response.body);
			// Campaign Member was created successfully
			if(response.statusCode == 201 && body.success) {
				console.log(`[SFDC-Consumer] Lead added to Campaign ${body.id}`);
				if(cb) return cb(null, ('Created'));
			}

			else if(response.statusCode == 401) {
				if(body instanceof Array) body = body[0];

				if(body.errorCode.toLowerCase() === 'invalid_session_id') {
					oAuthUtil.getAccessToken(function(done){ 
						if(done) dotEnv.load();
					});

					// try to insert the record again after 10 seconds
					setTimeout(function() {
						addLeadToCampaign(leadId, null);
					}, 10000);

					if(cb) return (cb(new InvalidSessionError(body.errorCode, body.message)));
				}
			}
		});
	}
}

// @description	This function essentially retrieves a campaign member record from salesforce. Its a two part request, first it retrieves 
// 				 a lead record where Connect Project Id matches the project id in the argument object, then it retrieves the campaign member where Lead 
// 				 Id matches the lead retrieves in 1st request
// @argument	project: JSON object containing the project info	
// @argument	cb: callback function
// @returns		call to provided callback with the following arguments:
//					err - an err is returned in the callback if an error occurred during the API call
//					data - a JSON representation of containing campaign member object is returned in the callback  
var getCampaignMember = function getCampaignMember(project, cb) {
		// 1.1) find the lead using _id field in the project (Lead.Connect_Project_Id__c = project._id)
		// 1.2) find the Campaign Member with Lead Id of lead found in 1
		
		var authHeader = `Bearer ${process.env.ACCESS_TOKEN}`;
		// The above 2 steps can be combined in a composite REST API call
		var options = {
			'hostname': instanceUrl,
			'path': `${path}/composite`,
			'method': 'POST',
			'headers': {
				'Authorization': authHeader,
				'Content-Type': 'application/json'
			}
		} //options

		var reqBody = {
			'allOrNone': true, 
			'compositeRequest': [
				{	// Get lead record using connect project id (external id)
					'method': 'GET',
					'url': `${path}/sobjects/Lead/Connect_Project_Id__c/${project._id}?fields=Id,FirstName`,
					'referenceId': 'Lead'
				},

				{	
					// get related campaign member record using query API
					'method': 'GET',
					'url': `${path}/query/?q=Select Id, FirstName From CampaignMember where LeadId = '@{Lead.Id}' LIMIT 1`,
					'referenceId': 'CM'
				}
			]
		} //body

		// send the https request
		reqUtil.send(options, JSON.stringify(reqBody), function(err, response){

			if(err) {
				console.error('[err] Error querying CampaignMember ', err);
				return (cb(err));
			}

			var body = JSON.parse(response.body);

			if(response.statusCode == 200) {

				var compositeResponse = body.compositeResponse;
				// if both requests returned an ok response and a campaign member record was found - compositeResponse[1].body.totalsize > 0
				if(compositeResponse[0].httpStatusCode == 200 
						&& compositeResponse[1].httpStatusCode == 200
						&& compositeResponse[1].body.totalSize > 0) 
				{
					
					// extract the campaign member data from the response
					var campaignMember = compositeResponse[1].body.records;

					if(campaignMember instanceof Array) {
						campaignMember = campaignMember[0];
					}

					return(cb(null, campaignMember));
				}
				// else either the responses weren't ok or the campaign member records was not found
				else {
					return (cb(null));
				}
			}
			else if(response.statusCode == 401) {
				if(body instanceof Array) body = body[0];
				if(body.errorCode.toLowerCase() === 'invalid_session_id') {
					// get a new access token
					oAuthUtil.getAccessToken(function(done) {
						if(done) dotEnv.load();
					});
				}
				// if session is invalid, error is returned to calling function which in turn returns error to the consumer
				return (cb(new InvalidSessionError(body.errorCode, body.message), null));
			}
		}); // reqUtil.send
}


// @description: Remove lead from Campaign (delete campaign member where Lead is leadId)
// @argument	data: JSON object containing the project info
var removeLeadFromCampaign = function removeLeadFromCampaign(data, cb) {
	
	if(data.project) {	
		
		var project = data.project;	

		// 1) get the campaign member to be deleted
		getCampaignMember(project, function(err, campaignMember) {	

			if(err) {
				console.log('[err] ' + err);
				return (cb(err));
			}
			else if(campaignMember) {
				// 2) delete the Campaign Member record
				var authHeader = `Bearer ${process.env.ACCESS_TOKEN}`;

				var options = {
					'hostname': instanceUrl,
					'method': 'DELETE',
					'path': `${path}/sobjects/CampaignMember/${campaignMember.Id}`,
					'headers': {
						'Authorization': `${authHeader}`,
						'Content-Type': 'application/json'
					}
				}//options

				reqUtil.send(options, null,  function(err, response) {

					if(err) {
						console.error('[err] Error removing lead from Campaign ', err);
						return (cb(err));
					}

					// this check is needed here since successful delete request would not return a response body
					if(response.body) {
						var body = JSON.parse(response.body);
					}

					if(response.statusCode == 204) {
						return (cb(null, 'Deleted'));
					}
					else if(response.statusCode == 401) {
						if(body instanceof Array) body = body[0];
						if(body.errorCode.toLowerCase() === 'invalid_session_id') {
							// get a new access token
							oAuthUtil.getAccessToken(function(done) {
								if(done) dotEnv.load();
							});
						}
						return (cb(new InvalidSessionError(body.errorCode, body.message)));
					}
				});//reqUtil.send
			}
			else {
				return (cb(null));
			}
		}); // getCampaignMember
	}
}


module.exports = {
	'createNewLead': createNewLead,
	'addLeadToCampaign': addLeadToCampaign,
	'removeLeadFromCampaign': removeLeadFromCampaign,
	'getCampaignMember': getCampaignMember
}