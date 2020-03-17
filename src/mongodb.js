const mongodb = require('mongodb');
const helpers = require('./helpers')
const config = require('../config.json');

class MongoDB {

    constructor() {
        this.url = config.mongodb.url;
        this.database = config.mongodb.database;
        this.collection = config.mongodb.collection;
        
        this.mongoclient = new mongodb.MongoClient();
        this.mongoinstance = new this.mongoclient(this.url, { useNewUrlParser: true });
    }

    messageExist(id) {
        let find = false;
        console.log(`[${helpers.timestamp()}] [MongoDB / Find] Searching ${id}.`);
        this.mongoinstance.connect(() => {
            const collection = this.mongoinstance.db(this.database).collection(this.collection);
            var cursor = collection.find({MessageId : id});
            if (cursor.length > 0) find = true;
            if (cursor.length > 1) console.log(`[${helpers.timestamp()}] [MongoDB / Find] ${id}: ${cursor.length} matches.`);
            else console.log(`[${helpers.timestamp()}] [MongoDB / Find] ${id}: ${cursor.length} match.`);
            this.mongoinstance.close();
        });
        return find;
    }

    addMessageToDatabase(messagearray) {
        console.log(`[${helpers.timestamp()}] [MongoDB / Insert] Inserting ${messagearray.length} new message(s).`);
        this.mongoinstance.connect(() => {
            const collection = this.mongoinstance.db(this.database).collection(this.collection);
            collection.insert(messagearray)
            this.mongoinstance.close();
        });
    }
}

module.exports = MongoDB;