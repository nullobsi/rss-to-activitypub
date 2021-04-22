const { DOMAIN, PRIVKEY_PATH, CERT_PATH, PORT_HTTP, PORT_HTTPS, NITTER_INSTANCE } = config;
const Parser = require("rss-parser");
const {createAcct} = require("./routes/actor");

async function getAccount(username, query) {
    let result = db.prepare(`SELECT ${query} FROM accounts WHERE name = ?`).get(`${username}@${DOMAIN}`);
    if (result) {
        if (result.actor) result.actor = JSON.parse(result.actor);
        if (result.webfinger) result.webfinger = JSON.parse(result.webfinger);
        if (result.followers) result.followers = JSON.parse(result.followers);
        return result;
    }
    let parser = new Parser();
    try {
        let feedData = await parser.parseURL(`${NITTER_INSTANCE}/${username}/rss`);
        let [actor, webfinger] = createAcct(feedData, username, DOMAIN, db);
        return {actor, webfinger};
    } catch(e) {
        console.log(e);
        return undefined;
    }
}

function getNitterActivity(id, item) {
    let result = db.prepare(`SELECT message FROM messages WHERE guid = ?`, id).run(id);
    if (result) {
        return result;
    } else if (item) {
        let actor = getAccount(item["creator"].substr(1), 'actor');
        if (!actor) {
            console.log("get activity actor creation failed");
            return undefined;
        }
        let out = {
            'id': `https://${DOMAIN}/m/${id}`,
            'type': 'Note',
            'published': d.toISOString(),
            'attributedTo': actor.id,
            'content': item.content,
            'link': item.link,
            'cc': 'https://www.w3.org/ns/activitystreams#Public'
        };
        db.prepare('insert or replace into messages(guid, message) values(?, ?)').run( id, JSON.stringify(out));
        return out;
    } else return undefined;
}

module.exports = {getAccount, getNitterActivity}