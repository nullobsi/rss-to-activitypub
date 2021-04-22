const generateRSAKeypair = require('generate-rsa-keypair');
const crypto = require("crypto");
function createActor(name, domain, pubkey, displayName, imageUrl, description) {
    displayName = displayName || name;
    let actor =  {
        '@context': [
            'https://www.w3.org/ns/activitystreams',
            'https://w3id.org/security/v1'
        ],
        'id': `https://${domain}/u/${name}`,
        'type': 'Service',
        'preferredUsername': `${name}`,
        'inbox': `https://${domain}/api/inbox`,
        'followers': `https://${domain}/u/${name}/followers`,
        'name': displayName,
        'publicKey': {
            'id': `https://${domain}/u/${name}#main-key`,
            'owner': `https://${domain}/u/${name}`,
            'publicKeyPem': pubkey
        }
    };
    if (imageUrl) {
        actor.icon = {
            'type': 'Image',
            'mediaType': 'image/png',
            'url': imageUrl,
        };
    }
    if (description) {
        actor.summary = `<p>${description}</p>`;
    }
    return actor;
}

function createWebfinger(name, domain) {
    return {
        'subject': `acct:${name}@${domain}`,

        'links': [
            {
                'rel': 'self',
                'type': 'application/activity+json',
                'href': `https://${domain}/u/${name}`
            }
        ]
    };
}

function createAcct(feedData, username, domain, db) {
    let displayName = feedData.title;
    let description = feedData.description;
    // create keypair
    let pair = generateRSAKeypair();
    let actorRecord = createActor(username, domain, pair.public, displayName, feedData.image.url, description);
    let webfingerRecord = createWebfinger(username, domain);
    const apikey = crypto.randomBytes(16).toString('hex');
    db.prepare('insert or replace into accounts(name, actor, apikey, pubkey, privkey, webfinger) values(?, ?, ?, ?, ?, ?)').run( `${username}@${domain}`, JSON.stringify(actorRecord), apikey, pair.public, pair.private, JSON.stringify(webfingerRecord));
    return [actorRecord, webfingerRecord];
}


module.exports = {
    createWebfinger,
    createActor,
    createAcct,
}