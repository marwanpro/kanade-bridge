
function timestamp() {
    return new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
}

module.exports = {timestamp};