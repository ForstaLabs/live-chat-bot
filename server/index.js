const ForstaBot = require('./forsta_bot');
const WebServer = require('./web');
const process = require('process');
const relay = require('librelay');


let _rejectCount = 0;
process.on('unhandledRejection', ev => {
    console.error(ev);
    if (_rejectCount++ > 100) {
        console.error("Reject count too high, killing process.");
        process.exit(1);
    }
});


async function run() {
    if (process.env.RELAY_STORAGE_BACKING !== 'postgres') {
        const msg = 'Live Chat reqires a postgres backing store -- \
            set RELAY_STORAGE_BACKING=postgres and USER=postgres in your environment';
        console.error(msg);
        throw Error(msg);
    }

    relay.storage.setLabel('live-chat');
    await relay.storage.initialize();
    const bot = new ForstaBot();
    await bot.start();
    const webServer = new WebServer(bot);
    await webServer.start();
}


run().catch(e => {
    console.error("RUN ERROR:", e);
    process.exit(1);
});