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


async function getActorOrNitter(username, instance, selection) {
    let name = `${username}@${instance}`
    let result = db.prepare('select actor from accounts where name = ?').get(name);
    if (result === undefined) {
        // attempt to get nitter user
        let nitterUrl = req.app.get('nitter');
        try {
            let parser = new Parser();
            feedUrl = `${nitterUrl}/${username}/rss`;
            feedData = await parser.parseURL(feedUrl);
            let displayName = feedData.title;
            let description = feedData.description;
            // create keypair
            let pair = generateRSAKeypair();
            let actorRecord = createActor(username, domain, pair.public, displayName, feedData.image.url, description);
            let webfingerRecord = createWebfinger(username, domain);
            const apikey = crypto.randomBytes(16).toString('hex');
            let actorJson = JSON.stringify(actorRecord)
            db.prepare('insert or replace into accounts(name, actor, apikey, pubkey, privkey, webfinger) values(?, ?, ?, ?, ?, ?)').run( `${username}@${domain}`, actorJson, apikey, pair.public, pair.private, JSON.stringify(webfingerRecord));
            result = {
                actor: actorJson,
            };
            // do not add feed; do not poll until follow occurs
        } catch (e) {
            return undefined;
        }
    }
    return result;
}
module.exports = {
    createWebfinger,
    createActor,
    getActorOrNitter
}