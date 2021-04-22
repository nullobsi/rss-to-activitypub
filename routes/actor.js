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

module.exports = {
    createWebfinger,
    createActor,
}