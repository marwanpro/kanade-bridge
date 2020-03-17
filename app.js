'use strict';
// https://discordapp.com/oauth2/authorize?permissions=537078800&scope=bot&client_id=688427706207174789

const Discord = require('./src/discord');
const RocketChat = require('./src/rocketchat');

const discordInstance = new Discord();
const rocketchatInstance = new RocketChat();

discordInstance.on('provision_rc', () => rocketchatInstance.provisionChannelList());
discordInstance.on('listening_rc', () => rocketchatInstance.liveMode());
discordInstance.on('sending_rc', message => rocketchatInstance.postMessage(message))
rocketchatInstance.on('provision_discord', channels => discordInstance.setupChannels(channels));
rocketchatInstance.on('messagewh', message => discordInstance.newWebhookMessage(message));
rocketchatInstance.on('livemessage', message => rocketchatInstance.newMessage(message));

process.on('uncaughtException', err => {
    console.error(`Uncaught Exception: ${err}`);
    process.exit(1);
});

  
process.on("unhandledRejection", err => {
    console.warn(err);
});