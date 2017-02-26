var amqp = require('amqplib/callback_api');
var consumerService = require('../services/ConsumerService.js');

// 
var amqpConn = null;
const CLOUDAMQP_URL = process.env.CLOUDAMQP_URL;

function connectToAmqp() {

	amqp.connect(CLOUDAMQP_URL, function(err, conn) {

		if(err) {
			console.error("[AMQP] ", err.message);
			return setTimeout(connectToAmqp, 1000);
		}

		conn.on('error', function(err) {
			if(err.message.toLowerCase() !== 'connection closing') {
				console.error("[AMQP] Connection error", err.message);
			}
		})
		conn.on('close', function(){
			console.error("[AMQP] reconnecting...");
			return setTimeout(connectToAmqp, 1000);
		});

		console.log("[AMQP] connected");
		amqpConn = conn;
		whenConnected();
	});
}

function whenConnected() {
	startNewProjectWorker();
	startUpdatedProjectWorker();
}

/**
	Function to create a channel and read messages from project.created queue. The message is then forwarded to a method to create a lead in SFDC instance
*/

function startNewProjectWorker() {
	amqpConn.createChannel(function(err, ch) {
		if(err) {
			console.log("[AMQP] err", err);
			amqpConn.close();
			return;
		}

		ch.on("error", function(err) {
			console.error("[AMQP] channel error", err);
			return;
		});

		ch.on("close", function() {
			console.log("[AMQP channel closed]");
			if(amqpConn) {
				return setTimeout(startNewProjectWorker, 3000);
			}
		});

		// maximum number of messages sent over the channel that can be awaiting ack. If max count is reached, server won't send anymore messages on this channel, until atleast one of the waiting messages is acked
		ch.prefetch(10);
		// make sure amqp never loses the queue {durable: true}
		ch.assertQueue("project.created", {durable: true}, function(err, _ok) {

			ch.consume("project.created", createNewLead, {noAck: false}); // make sure acknowledgement are not turned off - noAck: false

			console.log("Worker started. Reading from project.created");
		});


		function createNewLead(msg) {

			console.log("\n\n[AMQP] Received: " + msg.content.toString());
			
			consumerService.createNewLead(JSON.parse(msg.content.toString()), function(err, data) {
				if(err) {
					console.error("[AMQP] There was an error creating a lead ");

					// if err is returned because of expired/invalid token, retry in some time
					if(err.name.toString().toLowerCase() == 'invalid_session_id') {
						setTimeout(function() {
							ch.recover(function(err, ok) {
								console.log("[err] " + err);
							});
						}, 10000);
					}	
				}
				else if(!err || data.toLowerCase() === 'created') {
					console.log('[ack]...');
					// acknowledge the message if there was no error
					ch.ack(msg);
				}				
			}); 
		} 

	});
}

/**
	Function to create a channel and read messages from project.updated queue. The message is then forwarded to a method to remove the lead from the SFDC instance.
*/
function startUpdatedProjectWorker() {
	amqpConn.createChannel(function(err, ch) {
		if(err) {
			console.error("[AMQP] err", err);
			amqpConn.close();
			return;
		}

		ch.on("error", function(err) {
			console.error("[AMQP] channel error", err);
			return;
		});

		ch.on("close", function() {
			console.log("[AMQP channel closed]");
			return;
		});

		// maximum number of messages sent over the channel that can be awaiting ack. If max count is reached, server won't send anymore messages on this channel, until atleast one of the waiting messages is acked
		ch.prefetch(10);
		// make sure amqp never loses the queue {durable: true}
		ch.assertQueue("project.updated", {durable: true}, function(err, _ok) {

			ch.consume("project.updated", removeLeadFromCampaign, {noAck: false}); // make sure acknowledgement are not turned off - noAck: false

			console.log("Worker started. Reading from project.updated");
		});

		function removeLeadFromCampaign(msg) {
			console.log("[AMQP] Update Received: " + msg.content.toString());

			consumerService.removeLeadFromCampaign(JSON.parse(msg.content.toString()), function(err) {
				if(err) {
					console.error("[AMQP] There was an error removing the lead: " + err.message);	

					// if err is returned because of expired/invalid token, retry in some time
					if(err.name.toString().toLowerCase() === 'invalid_session_id') {
						setTimeout(function() {
							ch.recover(function(err, ok) {
								console.log("[err] >>>>>> " + err);
							});
						}, 10000);
					}	
				}
				else {
					console.log('[ack]...');
					// acknowledge the message if there was no error
					ch.ack(msg);
				}
			});
		} 

	});
}

connectToAmqp();