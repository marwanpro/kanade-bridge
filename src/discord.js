const discord = require('discord.js');
const helpers = require('./helpers')
const config = require('../config.json');

class Discord extends discord.Client {

    constructor() {
        super({
            disabledEvents: [
                'CHANNEL_PINS_UPDATE', 
                'GUILD_BAN_ADD', 
                'GUILD_BAN_REMOVE', 
                'RELATIONSHIP_ADD', 
                'RELATIONSHIP_REMOVE', 
                'TYPING_START', 
                'VOICE_SERVER_UPDATE', 
                'VOICE_STATE_UPDATE'
            ],
            disableEveryone: true,
            messageCacheMaxSize: 100,
            messageCacheLifetime: 240,
            messageSweepInterval: 300
        });

        this.token = config.discord.token;
        this.prefix = config.discord.prefix;
        this.categoryname = config.discord.category;
        this.avatarURL = config.discord.avatarurl;
        this.webhooks = undefined;
        this.guild = undefined;

        this.on('ready', () => this.ready());
        this.on('disconnect', () => console.log(`[${helpers.timestamp()}] [Discord / Core] Disconnected`));
        this.on('reconnecting', () => console.log(`[${helpers.timestamp()}] [Discord / Core] Reconnecting`));
        this.on('error', err => console.error(`[${helpers.timestamp()}] [Discord / Core] ${err}`));
        this.on('warn', info => console.warn(`[${helpers.timestamp()}] [Discord / Core] ${info}`));
        this.on('message', async message => this.messageParser(message));

        super.login(this.token);
    }

    async ready() {
        console.log(`[${helpers.timestamp()}] [Discord / Core] Connected as ${this.user.tag}`);
        this.emit('provision_rc');
    }

    async messageParser(message) {
        if (message.author.bot) return;
        if (message.webhookID) return;
        
        if (this.webhooks.filter(webhook => webhook.name == message.channel.name).length > 0) {
            let content = message.content;
            message.attachments.forEach(attachment => {
                content += ' Attachment: ' + attachment.url;
            });
            this.emit('sending_rc', {
                'content': content,
                'author': message.author.tag,
                'channel': message.channel.name
            });
        }

        if (message.content.startsWith(config.discord.prefix)) {
            console.log(`[${helpers.timestamp()}] [Discord / Command] <${message.author.tag}> : ${message.content}`);
            if (message.content.includes('provisionchannel')) this.cmdProvision(message);
        }
    }

    async setupWebhook(guild, name) {
        let category = await guild.channels.cache.find(category => category.type == 'category' && category.name == this.categoryname);
        if (category == undefined) {
            console.log(`[${helpers.timestamp()}] [Discord / ChannelManager] Creating category: ${this.categoryname}`);
            await guild.channels.create(this.categoryname, {
                type: 'category'
            });
            category =  await guild.channels.cache.find(category => category.type == 'category' && category.name == this.categoryname);
        }
        let channel = await guild.channels.cache.find(channel => channel.type == 'text' && channel.parentID == category.id && channel.name == name);
        if (channel == undefined) {
            console.log(`[${helpers.timestamp()}] [Discord / ChannelManager] Creating channel: #${name}`);
            await guild.channels.create(name, {parent: category});
            channel = await guild.channels.cache.find(channel => channel.type == 'text' && channel.parentID == category.id && channel.name == name);
        }
        let webhooks = await channel.fetchWebhooks();
        let webhook = await webhooks.find(webhook => webhook.name == name);
        if (webhooks.size == 0 || webhook == undefined) {
            console.log(`[${helpers.timestamp()}] [Discord / ChannelManager] Creating webhook: #${name}`);
            webhook = await channel.createWebhook(name);
        } 
        else {
            webhook = await webhooks.find(webhook => webhook.name == name);
        }
        return webhook;
    }

    async newWebhookMessage(message) {
        console.log(`[${helpers.timestamp()}] [Discord / Webhook] Sending message from ${message.user} to #${message.channel}`);
        this.webhooks.filter(webhook => webhook.name == message.channel).forEach(async webhook => {
            await webhook.webhook.send(message.msg, {
                username: message.user,
                avatarURL: this.avatarURL + message.username + '.png'
            });
        });
    }

    async setupChannels(listChannel) {
        this.webhooks = [];
        for (let guild of this.guilds.cache.array()) {
            for (let channel of listChannel) {
                let webhook = await this.setupWebhook(guild, channel.name)
                console.log(`[${helpers.timestamp()}] [Discord / Webhook] Registered webhook for: #${channel.name}`);
                this.webhooks.push({
                    'name': channel.name,
                    'webhook': webhook
                });
            }
        }
        this.emit('listening_rc');
    }


    async cmdProvision(message) {
        message.reply('Provisionning RocketChat channels...');
        this.emit('provision_rc');
    }

}

module.exports = Discord;