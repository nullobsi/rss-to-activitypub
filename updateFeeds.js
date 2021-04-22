const config = require('./config.json');
const { DOMAIN, PRIVKEY_PATH, CERT_PATH, PORT_HTTP, PORT_HTTPS } = config;
const Database = require('better-sqlite3');
global.db = new Database('bot-node.db')
const
      Parser = require('rss-parser'),
      request = require('request'),
      crypto = require('crypto'),
      parser = new Parser({timeout: 2000});

const Jackd = require('jackd');
const {getNitterActivity} = require("./nitter");
const {getAccount} = require("./nitter");
const beanstalkd = new Jackd();

beanstalkd.connect()

async function foo() {
  while (true) {
    try {
      const { id, payload } = await beanstalkd.reserve()
      console.log(payload)
      /* ... process job here ... */
      await beanstalkd.delete(id)
      await doFeed(payload)
    } catch (err) {
      // Log error somehow
      console.error(err)
    }
  }
}

foo()

function doFeed(feedUrl) {
return new Promise((resolve, reject) => {
  // fetch new RSS for each feed
  parser.parseURL(feedUrl, async function(err, feedData) {
    if (err) {
      reject('error fetching ' + feedUrl + '; ' + err);
    }
    else {
      let feed = db.prepare('select * from feeds where feed = ?').get(feedUrl);
      // get the old feed data from the database
      let oldFeed = JSON.parse(feed.content);

      // compare the feed item contents. if there's one or more whole new items (aka a new item with a unique guid),
      // add the items to a list like
      // [ { items: [], username }, {}, ... ]

      let oldItems = oldFeed.items;
      let newItems = feedData.items;

      // find the difference of the sets of guids (fall back to title or
      // description since guid is not required by spec) in the old and new feeds
      let oldGuidSet = new Set(oldItems.map(el => el.guid || el.title || el.description));
      let newGuidSet = new Set(newItems.map(el => el.guid || el.title || el.description));
      // find things in the new set that aren't in the old set
      let difference = new Set( [...newGuidSet].filter(x => !oldGuidSet.has(x)));
      difference = [...difference];
      
      console.log('diff', feed.feed, difference.length, difference);

      if (difference.length > 0) {
        // get a list of new items in the diff
        let brandNewItems = newItems.filter(el => difference.includes(el.guid) || difference.includes(el.title) || difference.includes(el.description));
        let acct = feed.username;
        //console.log(acct, brandNewItems);

        // send the message to everyone for each item!
        for (var item of brandNewItems) {
          let statusId = item.link.split("/status/")[1].split('#m')[0];
          let activity = undefined;
          if (item.creator.substr(1) !== acct) {
            // this is a retweet
            getNitterActivity(statusId, item);
            activity = createAnnounce(acct, statusId);
          } else {
            // normal status
            let note = getNitterActivity(statusId, item);
            activity = createCreate(acct, note);
          }
          forwardActivity(acct, activity);
        }

        // update the DB with new contents
        let content = JSON.stringify(feedData);
        db.prepare('insert or replace into feeds(feed, username, content) values(?, ?, ?)').run(feed.feed, acct, content);
        return resolve('done with ' + feedUrl)
      }
      else {
        return resolve('done with ' + feedUrl + ', no change')
      }
    }
  });
}).catch((e) => console.log(e));
}

// TODO: update the display name of a feed if the feed title has changed

// for each item in the list, get the account corresponding to the username
//    for each item in the ITEMS list, send a message to all followers

// TODO import these form a helper
async function signAndSend(activity, username, targetDomain, inbox) {
  // get the private key
  console.log('sending to ', username, targetDomain, inbox);
  let inboxFragment = inbox.replace('https://'+targetDomain,'');
  let result = await getAccount(username, 'privkey');
  //console.log('got key', result === undefined, `${name}@${domain}`);
  if (result === undefined) {
    console.log(`No record found for ${name}.`);
  }
  else {
    // digest
    const digest = crypto.createHash('sha256').update(JSON.stringify(activity)).digest('base64');

    let privkey = result.privkey;
    const signer = crypto.createSign('sha256');
    let d = new Date();
    let stringToSign = `(request-target): post ${inboxFragment}\nhost: ${targetDomain}\ndate: ${d.toUTCString()}\ndigest: SHA-256=${digest}`;
    signer.update(stringToSign);
    signer.end();
    const signature = signer.sign(privkey);
    const signature_b64 = signature.toString('base64');
    const algorithm = 'rsa-sha256';
    let header = `keyId="https://${DOMAIN}/u/${username}",algorithm="${algorithm}",headers="(request-target) host date digest",signature="${signature_b64}"`;
    //console.log('signature:',header);
    request({
      url: inbox,
      headers: {
        'Host': targetDomain,
        'Date': d.toUTCString(),
        'Signature': header,
        'Digest': `SHA-256=${digest}`,
        'Content-Type': 'application/activity+json',
        'Accept': 'application/activity+json'
      },
      method: 'POST',
      json: true,
      body: JSON.stringify(activity)
    }, function (error, response, body){
    });
  }
}

function createAnnounce(username, id) {
  const guidCreate = crypto.randomBytes(16).toString('hex');
  let d = new Date();
  let out = {
    '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
    'id': `https://${DOMAIN}/m/${guidCreate}`,
    'actor': `https://${DOMAIN}/u/${username}`,
    type: "Announce",
    'published': d.toISOString(),
    to: [`https://${DOMAIN}/u/${username}/followers`],
    object: `https://${DOMAIN}/m/${id}`
  }
  db.prepare('insert or replace into messages(guid, message) values(?, ?)').run( guidCreate, JSON.stringify(out));
  return out;
}

function createCreate(username, note) {
  const guidCreate = crypto.randomBytes(16).toString('hex');
  let d = new Date();

  let out = {
    '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
    'id': `https://${DOMAIN}/m/${guidCreate}`,
    'type': 'Create',
    'actor': `https://${DOMAIN}/u/${username}`,
    published: d.toISOString(),
  // to be filled in
    'to': [`https://${DOMAIN}/u/${username}/followers`],

    'object': note,
  };

  db.prepare('insert or replace into messages(guid, message) values(?, ?)').run( guidCreate, JSON.stringify(out));

  return out;
}

async function forwardActivity(username, activity) {
  // console.log(`${name}@${domain}`);
  let result = await getAccount(username, 'followers');
  let followers = result.followers;
  // console.log(followers);
  if (!followers) {
    followers = [];
  }
  for (let follower of followers) {
    // TODO: use inbox from Person
    let inbox = follower+'/inbox';
    let myURL = new URL(follower);
    let targetDomain = myURL.hostname;
    activity.to = [follower];
    await signAndSend(activity, username, targetDomain, inbox);
  }
}

