var expect = require('chai').expect;
var nock = require('nock');
var dotEnv = require('../util/DotEnvUtil');

var SobjectsUtil = require('../util/SobjectsUtil');
var consumerService = require('../services/ConsumerService');
var reqUtil = require('../util/RequestUtil');

dotEnv.load();

const path = '/services/data/v38.0';
const instanceUrl = process.env.INSTANCE_URL.replace('https://', '');

const compositeReqBody = {
	'allOrNone': true, 
	'compositeRequest': [
		{	// Get lead record using connect project id (external id)
			'method': 'GET',
			'url': `${path}/sobjects/Lead/Connect_Project_Id__c/abc?fields=Id,FirstName`,
			'referenceId': 'Lead'
		},

		{	
			// get related campaign member record using query API
			'method': 'GET',
			'url': `${path}/query/?q=Select Id, FirstName From CampaignMember where LeadId = '123' LIMIT 1`,
			'referenceId': 'CM'
		}
	]
};

const compositeResBody = {
	  "compositeResponse": [
	    {
	      "body": {
	        "attributes": {
	          "type": "Lead",
	          "url": "/services/data/v38.0/sobjects/Lead/00Q4100000KFM32EAH"
	        },
	        "Id": "1234",
	        "FirstName": "John"
	      },
	      "httpHeaders": {},
	      "httpStatusCode": 200,
	      "referenceId": "Lead"
	    },
	    {
	      "body": {
	        "totalSize": 1,
	        "done": true,
	        "records": [
	          {
	            "attributes": {
	              "type": "CampaignMember",
	              "url": "/services/data/v38.0/sobjects/CampaignMember/00v41000006enHEAAY"
	            },
	            "Id": "12345",
	            "FirstName": "John"
	          }
	        ]
	      },
	      "httpHeaders": {},
	      "httpStatusCode": 200,
	      "referenceId": "CM"
	    }
	  ]
};

const content = {
	project: {
		"title": "React Components for LinkedIn Clone",
		"datecreated" : "02/21/2017",
		"launchdate":"03/03/2017", 
		"submissiondate" : "04/02/2017", 
		"details": {
			"tags" : [ "react", "flux", "javascript", "html", "css"]
		},
		"status": "Draft",
		"_id": "abc"	
	},
	user: {
		firstname: 'Kate',
		lastname: 'Monraue',
		email: 'kate@wc.com'
	},
	event: 'created'
};

describe("ConsumerService", function() {
	
	describe("#createLead()", function() {
	
		before(function() {
			var body = new SobjectsUtil.Lead(process.env.OWNER_ID, 'SmartCoder-Connect', 'abc', content.user, 'Unknown');
			
			// mock unauthorized response
			nock(`https://${instanceUrl}`)
				.post(`${path}/sobjects/Lead`, body)
				.reply(401, function() {
					return new Array({"errorCode": 'INVALID_SESSION_ID', "message": "Session expired or invalid"});
				}); 

			// this nock is needed here since we retry to create a campaign member if it fails first time
			var reqBody = new SobjectsUtil.CampaignMember(123, null);
			nock(`https://${instanceUrl}`)
				.post(`${path}/sobjects/CampaignMember`, reqBody)
				.reply(401, function() {
					return new Array({"errorCode": 'INVALID_SESSION_ID', "message": "Session expired or invalid"});
				});

			// mock a successful response
			nock(`https://${instanceUrl}`)
				.post(`${path}/sobjects/Lead`, body)
				.reply(201, function() {
					var response = { 'success': true, 'id': 123, 'errors': [] };
					return JSON.stringify(response);
				});

			//console.error('pending mocks: %j', nock.pendingMocks());

		});// before

		after(function() {
			//console.error('pending mocks: %j', nock.pendingMocks());
		});

		it("should return error if request is not authorized", function(done) {
			consumerService.createNewLead(content, function(err, data) {
				expect(err.name.toLowerCase()).to.be.equal('invalid_session_id');
				done();
			});
		});

		
		it("should return `created` if a lead is successfully created", function(done) {
			consumerService.createNewLead(content, function(err, data) {
				expect(data.toLowerCase()).to.be.equal('created');
				done();
			});
		});

		
	}); // describe createLead

	describe("#addLeadToCampaign", function() {

		before(function(){
			// 
			var reqBody = new SobjectsUtil.CampaignMember(123, null);
			nock(`https://${instanceUrl}`)
				.post(`${path}/sobjects/CampaignMember`, reqBody)
				.reply(401, function() {
					return new Array({"errorCode": 'INVALID_SESSION_ID', "message": "Session expired or invalid"});
				});

			// mock a successful response
			nock(`https://${instanceUrl}`)
				.post(`${path}/sobjects/CampaignMember`, reqBody)
				.reply(201, function() {
					var response = { 'success': true, 'id': 456, 'errors': [] };
					return JSON.stringify(response);
				});

			
			console.error('pending mocks: %j', nock.pendingMocks());
		});

		it("should return error if request is not authorized", function(done) {
			consumerService.addLeadToCampaign(123, function(err, data) {
				expect(err.name.toLowerCase()).to.be.equal('invalid_session_id');
				done();
			});
		});

		it("should return `created` if a campaign member is successfully created", function(done) {
			consumerService.addLeadToCampaign(123, function(err, data) {
				expect(data.toLowerCase()).to.be.equal('created');
				done();
			});
		});
	}); // describe addLeadToCampaign

	describe("#removeLeadFromCampaign", function() {

		before(function() {

			nock(`https://${instanceUrl}`)
				.log(console.log)
				.post(`${path}/composite`, function(){
					return compositeReqBody;
				})
				.reply(401, function() {
					return new Array({"errorCode": "INVALID_SESSION_ID", "message": "Session expired or invalid"});
				});

			nock(`https://${instanceUrl}`)
				.log(console.log)
				.post(`${path}/composite`, function(){
					return compositeReqBody;
				})
				.reply(200, function() {
					return compositeResBody;
				});

			nock(`https://${instanceUrl}`)
				.log(console.log)
				.post(`${path}/composite`, function(){
					return compositeReqBody;
				})
				.reply(200, function() {
					return compositeResBody;
				});

			nock(`https://${instanceUrl}`)
				.log(console.log)
				.delete(`${path}/sobjects/CampaignMember/12345`)
				.reply(401, function() {
					return new Array({"errorCode": "INVALID_SESSION_ID", "message": "Session expired or invalid"});
				});

			nock(`https://${instanceUrl}`)
				.log(console.log)
				.delete(`${path}/sobjects/CampaignMember/12345`)
				.reply(204);			

			console.error('pending mocks: %j', nock.pendingMocks());
		});

		after(function() {
			console.error('pending mocks: %j', nock.pendingMocks());
		});


		it("should return an error if request is not authorized", function(done){
			consumerService.removeLeadFromCampaign(content, function(err, data) {
				expect(err.name.toLowerCase()).to.be.equal('invalid_session_id');
				done();
			});
		});

		it("should return an error if request is not authorized", function(done){
			consumerService.removeLeadFromCampaign(content, function(err, data) {
				expect(err.name.toLowerCase()).to.be.equal('invalid_session_id');
				done();
			});
		});


		it("should return deleted if the campaign member was deleted successfully", function(done) {
			consumerService.removeLeadFromCampaign(content, function(err, data){
				expect(data.toLowerCase()).to.be.equal('deleted');
				done();
			});
		});
		
	});

});