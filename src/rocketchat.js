const bent = require('bent');
const fs = require('fs');
const ddp = require("ddp");
const login = require("ddp-login");
const EventEmitter = require('events');
const helpers = require('./helpers')
const config = require('../config.json');

class RocketChat extends EventEmitter {
    constructor() {
        super();
        this.baseurl = config.rocketchat.url;
        this.userid = config.rocketchat.userid;
        this.token = config.rocketchat.token;
        this.listencommand = config.rocketchat.listencommand;
        this.pathpicture = config.rocketchat.pathpicture
        this.connected = undefined;
        this.listChannel = undefined;
        
        this.initialize();
    }

    async initialize() {
        await this.checkConnection();
    }

    async GET(path, callback) {
        console.log(`[${helpers.timestamp()}] [RocketChat / Request] GET on /${path}`);
        const request = bent(this.baseurl, 'GET', 'json', {
            'X-User-Id': this.userid,
            'X-Auth-Token': this.token
        });
        let response = await request(path);
        if (typeof(callback) != 'function') return response;
        await callback(response);
    }

    async GETBuffer(path) {
        console.log(`[${helpers.timestamp()}] [RocketChat / Request] GET avatar for ${path}`);
        const request = bent('GET', 'buffer', 200, {
            'X-User-Id': this.userid,
            'X-Auth-Token': this.token
        });
        let response = await request('https://chat-info.univ-lyon1.fr/' + path);
        return response;
    }

    async POST(path, payload, callback) {
        console.log(`[${helpers.timestamp()}] [RocketChat / Request] POST on /${path}`);
        const request = bent(this.baseurl, 'POST', 'json', {
            'X-User-Id': this.userid,
            'X-Auth-Token': this.token
        });
        let response = await request(path, payload);
        if (typeof(callback) != 'function') return response;
        await callback(response);
    }

    async checkConnection() {
        await this.GET('me', response => {
            if (response.success) console.log(`[${helpers.timestamp()}] [RocketChat / API] Connected as ${response.username} (${response._id})`);
            else console.error(`[${helpers.timestamp()}] [RocketChat / API] Error: Can't login`);
            this.connected = response.success;
        });
    }

    async provisionChannelList() {
        if (!this.connected) return;
        this.listChannel = [];
        let tempList = []
        await this.GET('groups.list', response => {
            response.groups.forEach(group => {
                tempList.push(group._id)
            });
        });
        await this.GET('channels.list.joined', response => {
            response.channels.forEach(channel => {
                tempList.push(channel._id)
            });
        });

        for (let id of tempList) {
            await this.GET(`chat.search?roomId=${id}&searchText=${this.listencommand}`, async response => {
                if (response.messages.length == 0) return;
                try {
                    await this.GET(`channels.info?roomId=${id}`, info => {
                        console.log(`[${helpers.timestamp()}] [RocketChat / Discover] Watching channel #${info.channel.name} (ID: ${id})`);
                        this.listChannel.push({
                            'name': info.channel.name,
                            'id': id
                        });
                    });
                } catch (ex) {
                    await this.GET(`groups.info?roomId=${id}`, info => {
                        console.log(`[${helpers.timestamp()}] [RocketChat / Discover] Watching group #${info.group.name} (ID: ${id})`);
                        this.listChannel.push({
                            'name': info.group.name,
                            'id': id
                        });
                    });
                }
                
            });
        }
            
        this.emit('provision_discord', this.listChannel);
    }

    async newMessage(message) {
        let diff = message[1][0]._updatedAt.$date - message[1][0].ts.$date;
        if (diff> 1000) return;
        let channel = this.listChannel.filter(channel => channel.id == message[0])[0];
        let msg = message[1][0].msg;
        let user = message[1][0].u.name;
        let username = message[1][0].u.username;
        let picture = await this.GETBuffer(`avatar/${username}`);
        try {
            fs.writeFileSync(this.pathpicture + username + '.png', picture, {flag: 'w'});
        } catch (ex) { console.warn("Can't create picture"); }

        if ('attachments' in message[1][0]) msg += config.discord.avatarurl + message[1][0].file._id + '.' + message[1][0].file.type.replace(/.+\//, '');

        this.emit('messagewh', {
            'username': username, 
            'user': user,
            'msg': msg,
            'channel': channel.name
        });
    }

    async postMessage(message) {
        console.log(`[${helpers.timestamp()}] [RocketChat / Bridge] Sending message from ${message.author} to ${message.channel}`);
        let rid = this.listChannel.filter(channel => channel.name == message.channel)[0].id;
        this.POST('chat.sendMessage', {
            'message': {
                'rid': rid,
                'msg': `**[Discord-Bridge] ${message.author}**: ${message.content}`
            }
        }, null);
    }

    async liveMode() {
        let listSubscribe = [];
        let token = this.token;
        let global_emit = this;

        this.listChannel.forEach(channel => {
            listSubscribe.push({
                'id': channel.id,
                'ddpClient': new ddp({
                    host: this.baseurl.replace('https://', '').replace('/api/v1/', ''),
                    port: 443,
                    maintainCollections: true
                })
            })
        });

        listSubscribe.forEach(async sub => {
            sub.ddpClient.connect(function () {
                login.loginWithToken(sub.ddpClient, token, function () {
                    sub.ddpClient.subscribe("stream-room-messages", [sub.id, false], function () {
                        console.log(`[${helpers.timestamp()}] [RocketChat / LiveChat] Subscribed to WSS ${sub.id}`);
                        sub.ddpClient.on("message", async function (msg) {
                            try {
                                let payload = JSON.parse(msg);
                                if (payload.msg == 'ping') return;
                                if (payload.msg == 'ready') return;
                                if (payload.msg == 'updated') return;
                                if (payload.fields.args[0].msg.includes('[Discord-Bridge]')) return;
                                if (payload.fields.args[0].msg.length == 0) {
                                    if ('attachments' in payload.fields.args[0]) {
                                        let att = await global_emit.GETBuffer(payload.fields.args[0].attachments[0].title_link);
                                        try {
                                            fs.writeFileSync(global_emit.pathpicture + payload.fields.args[0].file._id + '.' + payload.fields.args[0].file.type.replace(/.+\//, ''), att);
                                        } catch (ex) { console.warn("Can't create picture"); }
                                        global_emit.emit('livemessage', [sub.id, payload.fields.args]);
                                    }
                                }
                                else if ('urls' in payload.fields.args[0]) {
                                    if ('parsedUrl' in payload.fields.args[0].urls[0]) console.log('parsed url:' + msg);
                                    else global_emit.emit('livemessage', [sub.id, payload.fields.args]);
                                }
                                else if (payload.msg == 'changed') global_emit.emit('livemessage', [sub.id, payload.fields.args]);
                                else console.log(msg);
                            } catch (ex) {
                                console.error('Fatal exception due to: ' + msg)
                            } 
                        });
                    });
                });
            });
        });
        
    }
}

module.exports = RocketChat;