const BotAtlasClient = require('../atlas_client');
const csvStringify = require('csv-stringify');
const express = require('express');
const relay = require('librelay');
const jwt = require('jsonwebtoken');
const uuidv4 = require('uuid/v4');


async function genToken(userId) {
    let secret = await relay.storage.get('authentication', 'jwtsecret');
    if (!secret) {
        secret = uuidv4();
        await relay.storage.set('authentication', 'jwtsecret', secret);
    }
    return jwt.sign({ userId }, secret, { algorithm: "HS512", expiresIn: 2*60*60 /* later maybe: "2 days" */ });
}

class APIHandler {

    constructor({server, requireAuth=true}) {
        this.server = server;
        this.router = express.Router();
    }

    asyncRoute(fn, requireAuth=true) {
        if (process.env.API_AUTH_OVERRIDE === 'insecure') requireAuth = false;

        /* Add error handling for async exceptions.  Otherwise the server just hangs
         * the request or subclasses have to do this by hand for each async routine. */
        return (req, res, next) => {
            if (requireAuth) {
                const header = req.get('Authorization');
                const parts = (header || '').split(' ');
                if (!header || parts.length !== 2 || parts[0].toLowerCase() !== 'jwt') {
                    console.log('missing authentication for this bot server request');
                    res.status(401).send({ message: 'forbidden' });
                } else {
                    relay.storage.get('authentication', 'jwtsecret')
                        .then((secret) => {
                            try {
                                const jwtInfo = jwt.verify(parts[1], secret);
                                fn.call(this, req, res, next, jwtInfo.userId).catch(e => {
                                    console.error('Async Route Error:', e);
                                    next();
                                });
                            } catch (err) {
                                console.log('bad authentication for this bot server request', err);
                                res.status(401).send({ message: 'forbidden' });
                            }
                        })
                        .catch(err => {
                            console.log('storage error while checking authentication for this bot server request', err);
                            res.status(401).send({ message: 'forbidden' });
                        });
                }
            } else {
                fn.call(this, req, res, next).catch(e => {
                    console.error('Async Route Error:', e);
                    next();
                });
            }
        };
    }

    async toCSV(data) {
        return await new Promise((resolve, reject) => {
            try {
                csvStringify(data, (e, output) => {
                    if (e) {
                        reject(e);
                    } else {
                        resolve(output);
                    }
                });
            } catch(e) {
                reject(e);
            }
        });
    }
}


class AuthenticationAPIV1 extends APIHandler {

    constructor(options) {
        super(options);
        this.router.get('/status/v1', this.asyncRoute(this.onStatusGet, false));
        this.router.get('/atlasauth/request/v1/:tag', this.asyncRoute(this.onRequestAtlasAuthentication, false));
        this.router.post('/atlasauth/authenticate/v1/:tag', this.asyncRoute(this.onAtlasAuthenticate, false));
        this.router.post('/atlasauth/complete/v1/', this.asyncRoute(this.onComplete, true));
        this.onboarderClient = null;
    }

    async onStatusGet(req, res, next) {
        const registered = await BotAtlasClient.onboardComplete();
        res.status(200).json({
            status: registered ? 'complete' : (BotAtlasClient.onboardingCreatedUser ? 'authenticate-admin' : 'authenticate-user')
        });
    }

    async onRequestAtlasAuthentication(req, res) {
        const tag = req.params.tag;
        if (!tag) {
            res.status(412).json({
                error: 'missing_arg',
                message: 'Missing URL param: tag'
            });
            return;
        }
        try {
            const registered = this.server.bot.ourId;
            if (registered) {
                //check that they are a bot admin
                const admins = await this.server.bot.getAdministrators();
                const isAdmin = admins.filter(a => a.label.split(" ")[0] === "@" + tag);
                if (isAdmin.length === 0) {
                    throw { code: '500', json: { "botAdmin": "You need to authorized by the bot owner to manage this bot." } };
                }
            }
            let result = await BotAtlasClient.requestAuthentication(tag);
            res.status(200).json({type: result.type});
        } catch (e) {
            res.status(e.code).json(e.json);
        }
        return;
    }

    async onAtlasAuthenticate(req, res) {
        const tag = req.params.tag;
        if (!tag) {
            res.status(412).json({
                error: 'missing_arg',
                message: 'Missing URL param: tag'
            });
            return;
        }
        const type = req.body.type;
        const value = req.body.value;
        if (!type) {
            res.status(412).json({
                error: 'missing_arg',
                message: 'Missing payload param: type'
            });
            return;
        }
        if (!value) {
            res.status(412).json({
                error: 'missing_arg',
                message: 'Missing payload param: value'
            });
            return;
        }
        try {
            if (type === 'sms') {
                console.log('about to sms auth with', tag, value);
                this.onboarderClient = await BotAtlasClient.authenticateViaCode(tag, value);
                console.log('returned with', this.onboarderClient);
            } else if (type === 'password') {
                console.log('about to password auth with', tag, value);
                this.onboarderClient = await BotAtlasClient.authenticateViaPassword(tag, value);
                console.log('returned with', this.onboarderClient);
            } else if (type === 'totp') {
                const otp = req.body.otp;
                if (!otp) {
                    res.status(412).json({
                        error: 'missing_arg',
                        message: 'Missing payload param: otp'
                    });
                    return;
                }
                console.log('about to password+totp auth with', tag, value, otp);
                this.onboarderClient = await BotAtlasClient.authenticateViaPasswordOtp(tag, value, otp);
                console.log('returned with', this.onboarderClient);
            } else {
                res.status(412).json({
                    error: 'value_error',
                    message: 'Missing payload param: type must be sms or password'
                });
            }
        } catch (e) {
            if (e.code == 429) {
                res.status(403).json({ "non_field_errors": ["Too many requests, please try again later."] });
            } else {
                res.status(e.code).json(e.json || {non_field_errors: ['Internal error, please try again.']});
            }
            return;
        }

        const token = await genToken(await relay.storage.getState("onboardUser"));
        res.status(200).json({ token });
    }

    async onComplete(req, res) {
        const { first_name, tag_slug, is_existing_tag } = req.body;
        if (!first_name) {
            res.status(412).json({
                error: 'missing_arg',
                message: 'Missing URL param: first_name'
            });
            return;
        }
        if (!tag_slug) {
            res.status(412).json({
                error: 'missing_arg',
                message: 'Missing URL param: tag_slug'
            });
            return;
        }
        try {
            const tagSearch = await this.onboarderClient.fetch("/v1/tag/?search=" + encodeURIComponent(tag_slug));
            if (tagSearch.results) {
                const tagAlreadyExists = tagSearch.results.find(r => r.slug == tag_slug);
                if (!is_existing_tag && tagAlreadyExists) {
                    res.status(409).json({ user_already_exists: [ `User ${tag_slug} already exists. Use them as the bot?` ]});
                    return;
                }
            }
            await BotAtlasClient.onboard(this.onboarderClient, req.body, is_existing_tag, tagSearch.results[0]);
        } catch (e) {
            if (e.code === 403) {
                res.status(403).json({non_field_errors: ['Insufficient permission. Need to be an administrator?']});
            } else  {
                res.status(e.code || 500).json({non_field_errors: ['Internal error.']});
            }
            return;
        }
        await this.server.bot.start(); // it could not have been running without a successful onboard

        res.status(200).json({ok: true});
    }


}

class AdminsAPIV1 extends APIHandler {

    constructor(options) {
        super(options);
        this.router.get('/v1', this.asyncRoute(this.onGetAdministrators, true));
        this.router.post('/v1', this.asyncRoute(this.onUpdateAdministrators, true));
        this.router.get('/v1/bot-user/', this.asyncRoute(this.onGetBotUser, true));
    }

    async onGetAdministrators(req, res) {
        try {
            const admins = await this.server.bot.getAdministrators();
            res.status(200).json({ administrators: admins });
            return;
        } catch (e) {
            console.log('problem in get administrators', e);
            res.status(e.statusCode || 500).json(e.info || { message: 'internal error'});
            return;
        }
    }

    async onUpdateAdministrators(req, res, next, userId) {
        const op = req.body.op;
        const id = req.body.id;
        const tag = req.body.tag;

        if (!(op === 'add' && tag || op === 'remove' && id)) {
            res.status(400).json({ non_field_errors: ['must either add tag or remove id'] });
        }

        try {
            const admins = (op === 'add')
                ? await this.server.bot.addAdministrator({addTag: tag, actorUserId: userId})
                : await this.server.bot.removeAdministrator({removeId: id, actorUserId: userId});
            res.status(200).json({ administrators: admins });
            return;
        } catch (e) {
            console.log('problem in update administrators', e);
            res.status(e.statusCode || 500).json(e.info || { message: 'internal error'});
            return;
        }
    }

    async onGetBotUser(req, res) {
        const botUser = this.server.bot.botUser;
        res.status(200).json({ botUser });
    }
}

class QuestionsAPIV1 extends APIHandler {

    constructor(options) {
        super(options);
        this.router.get('/*', this.asyncRoute(this.onGet, false));
        this.router.post('/*', this.asyncRoute(this.onPost, false));
    }

    async onGet(req, res) {
        let questions = await relay.storage.get('live-chat-bot', 'questions');
        if(!questions){
            questions = [
                {
                    prompt: "Hello, I am the live chat bot! Can I help you?",
                    type: "Multiple Choice",
                    responses: [
                        {
                            text: "Yes",
                            action: "Forward to Question",
                            actionOption: "Question 1",
                            forwardingText: "A member of our staff will connect with you shortly.",
                            color: '#0E6EB8',
                        },
                        {
                            text: "No",
                            action: "Forward to Question",
                            actionOption: "Question 1",
                            forwardingText: "A member of our staff will connect with you shortly.",
                            color: '#0E6EB8',
                        }
                    ]
                }
            ];
            await relay.storage.set('live-chat-bot', 'questions', questions);
        }
        res.status(200).json(questions);
        
    }

    async onPost(req, res) {
        let questions = req.body.questions;
        relay.storage.set('live-chat-bot', 'questions', questions);
        res.status(200);
    }

}

class BusinessInfoAPIV1 extends APIHandler {

    constructor(options) {
        super(options);
        this.router.get('/*', this.asyncRoute(this.onGet, false));
        this.router.post('/*', this.asyncRoute(this.onPost, false));
    }

    async onGet(req, res) {
        let businessInfoData = await relay.storage.get('live-chat-bot', 'business-info');
        if(!businessInfoData){
            businessInfoData = {
                open: '08:00',
                close: '20:00',
                outOfOfficeMessage: 'We are out of the office currently.',
                action: 'Forward to Tag'
            };
            relay.storage.set('live-chat-bot', 'business-info', businessInfoData);
        }
        res.status(200).json(businessInfoData);
    }

    async onPost(req, res) {
        let businessInfo = req.body.businessInfoData;
        relay.storage.set('live-chat-bot', 'business-info', businessInfo);
        res.status(200);
    }

}

class EmbedSettingsAPI extends APIHandler {

    constructor(options) {
        super(options);
        this.router.get('/*', this.asyncRoute(this.onGet, false));
        this.router.post('/*', this.asyncRoute(this.onPost, false));
    }

    async onGet(req, res) {
        const liveChatBot = this.server.bot.botUser;
        const tag = `@${liveChatBot.tag.slug}:${liveChatBot.org.slug}`;
        const forstaLogoUrl = `http://${req.get('host')}/static/images/forsta-logo.svg`;
        const op = { method: 'post', body: {} };
        let token = (await this.server.bot.atlas.fetch('/v1/ephemeral-token/', op)).token;
        let embedSettings = await relay.storage.get('live-chat-bot', 'embed-settings');
        if (!embedSettings) {
            embedSettings = {
                title: "Live Chat",
                subtitle: "Connect with live support",
                formText: "Please enter your contact information",
                headerLogoUrl: forstaLogoUrl,
                headerBackgroundColor: "#FFFFFF",
                headerFontColor: "#000000",
                buttonText: "Connect",
                buttonBackgroundColor: "#000000",
                buttonFontColor: "#FFFFFF",
                openButtonIconUrl: forstaLogoUrl,
                openButtonTooltipText: "Live Chat",
                openButtonColor: "#FFFFFF",
                allowCalling: false,
                token,
                tag,
                host: "http://" + req.get("host")
            };
        }
        relay.storage.set('live-chat-bot', 'embed-settings', embedSettings);
        res.status(200).json(embedSettings);
    }

    async onPost(req, res) {
        let embedSettings = req.body.embedSettings;
        relay.storage.set('live-chat-bot', 'embed-settings', embedSettings);
        res.status(200);
    }

}

class TagsAPIV1 extends APIHandler {

    constructor(options) {
        super(options);
        this.router.get('/*', this.asyncRoute(this.onGet, false));
    }

    async onGet(req, res) {
        const tagPickUri = '/v1/tag-pick/?is-nametag=false';
        let tags = (await this.server.bot.atlas.fetch(tagPickUri)).results;
        res.status(200).json({ tags });
    }

}

module.exports = {
    APIHandler,
    AdminsAPIV1,
    AuthenticationAPIV1,
    QuestionsAPIV1,
    BusinessInfoAPIV1,
    TagsAPIV1,
    EmbedSettingsAPI
};
