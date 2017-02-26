var Lead = function Lead(ownerID, leadSource, connectProjectId, user, company) {
	this.OwnerId = ownerID;
	this.LeadSource = leadSource;
	this.Connect_Project_Id__c = connectProjectId;
	this.company = company;
	this.FirstName = user.firstname;
	this.LastName = user.lastname;
	this.Email = user.email;
}

var CampaignMember = function CampaignMember(leadId, campaignId) {
	campaignId = '70141000000AQnr';  // which Campaign the member should be added to. Ideally, this config should be stored in db 
	this.CampaignId = campaignId;
	this.LeadId = leadId;
}

module.exports = {
	'Lead': Lead,
	'CampaignMember': CampaignMember
}